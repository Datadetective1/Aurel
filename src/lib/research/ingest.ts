import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { safeFetch, parseUrl } from '@/lib/sources/fetch'
import { classifyUrl, extractFromHtml, extractFromText, hashContent } from '@/lib/sources/extract'
import { assessIdentity, needsReview, shouldAutoLink } from './identity'
import { runPrompt } from '@/lib/ai/provider'
import { sourceExtractionPrompt } from '@/lib/ai/prompts/source-extraction'
import { logger } from '@/lib/logger'
import { recordUsage } from '@/lib/billing/entitlements'
import { brand } from '@/lib/brand'

type Client = SupabaseClient<Database>
type SourceType = Database['public']['Enums']['source_type']
type AccessStatus = Database['public']['Enums']['source_access_status']

/**
 * SOURCE INGESTION PIPELINE
 * =============================================================================
 *   fetch -> extract -> dedupe -> identity resolution -> fact extraction ->
 *   persist facts with provenance -> propose observations
 *
 * Every step records why it did what it did, so the Person page can answer
 * "why does Aurel think this" from stored rows rather than reconstruction.
 *
 * CACHING: a URL already ingested into this workspace is reused unless the
 * caller forces a refresh, and re-fetching an unchanged page (same content hash)
 * skips extraction entirely. Re-analysing the same company bio on every meeting
 * prep would be the single largest avoidable cost in the product.
 * =============================================================================
 */

export interface IngestOptions {
  supabase: Client
  workspaceId: string
  userId: string
  personId?: string | null
  /** Bypass the cache and re-fetch even if this URL is already stored. */
  refresh?: boolean
  /** True when the user pasted this URL themselves — a strong identity signal. */
  userSupplied?: boolean
}

export interface IngestResult {
  sourceId: string | null
  accessStatus: AccessStatus
  title: string | null
  sourceType: SourceType
  reused: boolean
  identity: {
    status: Database['public']['Enums']['identity_match_status']
    confidence: number
    explanation: string
  } | null
  factsCreated: number
  observationsProposed: number
  /** User-facing explanation when nothing usable came back. */
  message: string | null
}

/** Map a fetch failure onto the access status the UI renders. */
function accessStatusFor(reason: string): { status: AccessStatus; message: string } {
  switch (reason) {
    case 'blocked_host':
    case 'blocked_scheme':
      return { status: 'unsupported', message: 'That address cannot be fetched.' }
    case 'http_error':
      return {
        status: 'limited_access',
        message: 'The page could not be opened. It may require signing in, or it may have moved.',
      }
    case 'unsupported_content_type':
      return { status: 'unsupported', message: 'That file type is not supported yet.' }
    case 'too_large':
      return { status: 'content_unavailable', message: 'That page is too large to analyse.' }
    case 'timeout':
      return { status: 'error', message: 'That page took too long to respond.' }
    case 'invalid_url':
      return { status: 'unsupported', message: 'That does not look like a valid web address.' }
    default:
      return { status: 'error', message: 'That page could not be reached.' }
  }
}

/** Heuristic detection of pages that are really a login or paywall wall. */
function detectWall(text: string, title: string | null): AccessStatus | null {
  const sample = `${title ?? ''} ${text.slice(0, 1200)}`.toLowerCase()
  if (/\b(sign in to continue|log ?in to view|create an account to|members only)\b/.test(sample)) {
    return 'login_required'
  }
  if (/\b(subscribe to (?:read|continue)|this article is for subscribers|paywall)\b/.test(sample)) {
    return 'paywall'
  }
  // Almost no extractable text usually means a JS-rendered shell.
  if (text.trim().length < 200) return 'content_unavailable'
  return null
}

/**
 * Ingest a URL as a source and, when a person is supplied, resolve identity and
 * extract professional facts.
 */
export async function ingestUrl(url: string, options: IngestOptions): Promise<IngestResult> {
  const { supabase, workspaceId, userId, personId } = options

  const parsed = parseUrl(url)
  if (!parsed) {
    return emptyResult('unsupported', 'That does not look like a valid web address.')
  }
  const normalisedUrl = parsed.toString()
  const { sourceType } = classifyUrl(normalisedUrl)

  // --- cache -----------------------------------------------------------------
  const { data: existing } = await supabase
    .from('sources')
    .select('id, source_title, access_status, processing_status, content_hash, source_type')
    .eq('workspace_id', workspaceId)
    .eq('source_url', normalisedUrl)
    .maybeSingle()

  if (existing && !options.refresh && existing.processing_status === 'complete') {
    // Still associate it with this person if that link does not exist yet.
    const linked = personId
      ? await ensurePersonLink(supabase, {
          workspaceId,
          userId,
          sourceId: existing.id,
          personId,
          userSupplied: options.userSupplied ?? false,
        })
      : null

    return {
      sourceId: existing.id,
      accessStatus: existing.access_status,
      title: existing.source_title,
      sourceType: existing.source_type,
      reused: true,
      identity: linked,
      factsCreated: 0,
      observationsProposed: 0,
      message: null,
    }
  }

  // --- fetch -----------------------------------------------------------------
  const fetched = await safeFetch(normalisedUrl)

  if (!fetched.ok) {
    const { status, message } = accessStatusFor(fetched.reason)
    const sourceId = await upsertSource(supabase, {
      existingId: existing?.id,
      workspaceId,
      userId,
      url: normalisedUrl,
      sourceType,
      accessStatus: status,
      processingStatus: 'failed',
      failureReason: fetched.reason,
    })
    return { ...emptyResult(status, message), sourceId }
  }

  // --- extract ---------------------------------------------------------------
  const extracted =
    fetched.contentType === 'text/html' || fetched.contentType === 'application/xhtml+xml'
      ? extractFromHtml(fetched.body, fetched.finalUrl)
      : extractFromText(fetched.body)

  const wall = detectWall(extracted.text, extracted.title)
  if (wall) {
    const sourceId = await upsertSource(supabase, {
      existingId: existing?.id,
      workspaceId,
      userId,
      url: normalisedUrl,
      sourceType,
      title: extracted.title,
      accessStatus: wall,
      processingStatus: 'failed',
      failureReason: wall,
    })
    return {
      ...emptyResult(
        wall,
        wall === 'login_required'
          ? `That page needs a sign-in, so ${brand.name} cannot read it. Paste the relevant text instead.`
          : wall === 'paywall'
            ? 'That page is behind a paywall. Paste the relevant text instead.'
            : 'There was not enough readable text on that page.',
      ),
      sourceId,
    }
  }

  // Unchanged content: keep the existing extraction and skip the model call.
  if (existing?.content_hash && existing.content_hash === extracted.contentHash && !options.refresh) {
    return {
      sourceId: existing.id,
      accessStatus: existing.access_status,
      title: existing.source_title,
      sourceType: existing.source_type,
      reused: true,
      identity: null,
      factsCreated: 0,
      observationsProposed: 0,
      message: null,
    }
  }

  const sourceId = await upsertSource(supabase, {
    existingId: existing?.id,
    workspaceId,
    userId,
    url: fetched.finalUrl,
    sourceType,
    title: extracted.title,
    publisher: extracted.publisher,
    author: extracted.author,
    publishedAt: extracted.publishedAt,
    extractedText: extracted.text,
    contentHash: extracted.contentHash,
    accessStatus: 'analyzed',
    processingStatus: 'complete',
    metadata: {
      wordCount: extracted.wordCount,
      contentType: fetched.contentType,
      truncated: fetched.truncated,
      httpStatus: fetched.status,
    },
  })

  if (!sourceId) {
    return emptyResult('error', 'That source could not be saved.')
  }

  await recordUsage({ meter: 'source_ingest', subjectKind: 'source', subjectId: sourceId })

  if (!personId) {
    return {
      sourceId,
      accessStatus: 'analyzed',
      title: extracted.title,
      sourceType,
      reused: false,
      identity: null,
      factsCreated: 0,
      observationsProposed: 0,
      message: null,
    }
  }

  // --- identity resolution ---------------------------------------------------
  const { data: person } = await supabase
    .from('people')
    .select('id, full_name, job_title, email, organizations(name)')
    .eq('id', personId)
    .maybeSingle()

  if (!person) {
    return {
      sourceId,
      accessStatus: 'analyzed',
      title: extracted.title,
      sourceType,
      reused: false,
      identity: null,
      factsCreated: 0,
      observationsProposed: 0,
      message: null,
    }
  }

  const assessment = assessIdentity(
    {
      fullName: person.full_name,
      organization: person.organizations?.name ?? null,
      jobTitle: person.job_title,
      email: person.email,
    },
    {
      title: extracted.title,
      text: extracted.text,
      url: fetched.finalUrl,
      publisher: extracted.publisher,
    },
    { userSuppliedUrl: options.userSupplied ?? false },
  )

  await supabase.from('source_person_links').upsert(
    {
      workspace_id: workspaceId,
      user_id: userId,
      source_id: sourceId,
      person_id: personId,
      identity_match_status: assessment.status,
      identity_match_confidence: assessment.confidence,
      match_signals: assessment.signals,
    },
    { onConflict: 'source_id,person_id' },
  )

  const identity = {
    status: assessment.status,
    confidence: assessment.confidence,
    explanation: assessment.explanation,
  }

  // Do not extract facts from a source we are not confident is about them.
  if (!shouldAutoLink(assessment)) {
    await supabase
      .from('sources')
      .update({ access_status: 'identity_uncertain' })
      .eq('id', sourceId)

    return {
      sourceId,
      accessStatus: 'identity_uncertain',
      title: extracted.title,
      sourceType,
      reused: false,
      identity,
      factsCreated: 0,
      observationsProposed: 0,
      message: needsReview(assessment)
        ? `${assessment.explanation} Confirm whether this is the right person before ${brand.name} uses it.`
        : assessment.explanation,
    }
  }

  // --- fact extraction -------------------------------------------------------
  const generation = await runPrompt(sourceExtractionPrompt, {
    person: {
      fullName: person.full_name,
      organization: person.organizations?.name ?? null,
      jobTitle: person.job_title,
    },
    source: {
      id: sourceId,
      url: fetched.finalUrl,
      title: extracted.title,
      publisher: extracted.publisher,
      publishedAt: extracted.publishedAt,
      sourceType,
      text: extracted.text,
    },
  })

  if (generation.output.containedInstructions) {
    // Worth knowing about: a page trying to steer the model is a signal about
    // the source, and about attacks in the wild.
    logger.warn('research.source_contained_instructions', { sourceId, personId })
  }

  if (!generation.output.mentionsTarget) {
    await supabase.from('sources').update({ access_status: 'identity_uncertain' }).eq('id', sourceId)
    await supabase
      .from('source_person_links')
      .update({ identity_match_status: 'no_match' })
      .eq('source_id', sourceId)
      .eq('person_id', personId)

    return {
      sourceId,
      accessStatus: 'identity_uncertain',
      title: extracted.title,
      sourceType,
      reused: false,
      identity: { ...identity, status: 'no_match' },
      factsCreated: 0,
      observationsProposed: 0,
      message: `On reading it, this source does not appear to be about ${person.full_name}.`,
    }
  }

  const factsCreated = await persistFacts(supabase, {
    workspaceId,
    userId,
    personId,
    sourceId,
    facts: generation.output.facts,
    asOf: extracted.publishedAt,
  })

  const observationsProposed = await proposeObservations(supabase, {
    workspaceId,
    userId,
    personId,
    sourceId,
    observations: generation.output.communicationObservations,
  })

  return {
    sourceId,
    accessStatus: 'analyzed',
    title: extracted.title,
    sourceType,
    reused: false,
    identity,
    factsCreated,
    observationsProposed,
    message: null,
  }
}

/** Ingest pasted text or a note as a source. */
export async function ingestText(
  text: string,
  options: IngestOptions & { title?: string | null; sourceType?: SourceType },
): Promise<IngestResult> {
  const { supabase, workspaceId, userId, personId } = options
  const extracted = extractFromText(text, options.title ?? null)

  if (extracted.text.length < 20) {
    return emptyResult('content_unavailable', 'There was not enough text to work with.')
  }

  const sourceId = await upsertSource(supabase, {
    workspaceId,
    userId,
    sourceType: options.sourceType ?? 'user_pasted_text',
    title: options.title ?? null,
    extractedText: extracted.text,
    contentHash: extracted.contentHash,
    accessStatus: 'analyzed',
    processingStatus: 'complete',
    metadata: { wordCount: extracted.wordCount },
  })

  if (!sourceId) return emptyResult('error', 'That could not be saved.')

  await recordUsage({ meter: 'source_ingest', subjectKind: 'source', subjectId: sourceId })

  if (!personId) {
    return {
      sourceId,
      accessStatus: 'analyzed',
      title: options.title ?? null,
      sourceType: options.sourceType ?? 'user_pasted_text',
      reused: false,
      identity: null,
      factsCreated: 0,
      observationsProposed: 0,
      message: null,
    }
  }

  const { data: person } = await supabase
    .from('people')
    .select('id, full_name, job_title, email, organizations(name)')
    .eq('id', personId)
    .maybeSingle()

  if (!person) return emptyResult('error', 'That person could not be found.')

  // Text the user pasted against a specific person is an explicit assertion of
  // identity, so it is treated as confirmed rather than re-litigated.
  await supabase.from('source_person_links').upsert(
    {
      workspace_id: workspaceId,
      user_id: userId,
      source_id: sourceId,
      person_id: personId,
      identity_match_status: 'confirmed',
      identity_match_confidence: 1,
      match_signals: { userProvidedForPerson: true },
      reviewed_by_user: true,
    },
    { onConflict: 'source_id,person_id' },
  )

  const generation = await runPrompt(sourceExtractionPrompt, {
    person: {
      fullName: person.full_name,
      organization: person.organizations?.name ?? null,
      jobTitle: person.job_title,
    },
    source: {
      id: sourceId,
      url: null,
      title: options.title ?? null,
      publisher: null,
      publishedAt: null,
      sourceType: options.sourceType ?? 'user_pasted_text',
      text: extracted.text,
    },
  })

  const factsCreated = await persistFacts(supabase, {
    workspaceId,
    userId,
    personId,
    sourceId,
    facts: generation.output.facts,
    asOf: null,
  })

  const observationsProposed = await proposeObservations(supabase, {
    workspaceId,
    userId,
    personId,
    sourceId,
    observations: generation.output.communicationObservations,
  })

  return {
    sourceId,
    accessStatus: 'analyzed',
    title: options.title ?? null,
    sourceType: options.sourceType ?? 'user_pasted_text',
    reused: false,
    identity: { status: 'confirmed', confidence: 1, explanation: 'You provided this directly.' },
    factsCreated,
    observationsProposed,
    message: null,
  }
}

// --- persistence helpers -------------------------------------------------------

async function upsertSource(
  supabase: Client,
  input: {
    existingId?: string
    workspaceId: string
    userId: string
    url?: string | null
    sourceType: SourceType
    title?: string | null
    publisher?: string | null
    author?: string | null
    publishedAt?: string | null
    extractedText?: string | null
    contentHash?: string | null
    accessStatus: AccessStatus
    processingStatus: Database['public']['Enums']['source_processing_status']
    failureReason?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<string | null> {
  const payload = {
    workspace_id: input.workspaceId,
    user_id: input.userId,
    source_type: input.sourceType,
    source_url: input.url ?? null,
    source_title: input.title ?? null,
    publisher: input.publisher ?? null,
    author: input.author ?? null,
    published_at: input.publishedAt ?? null,
    retrieved_at: new Date().toISOString(),
    extracted_text: input.extractedText ?? null,
    content_hash: input.contentHash ?? null,
    access_status: input.accessStatus,
    processing_status: input.processingStatus,
    failure_reason: input.failureReason ?? null,
    metadata: (input.metadata ?? {}) as never,
  }

  if (input.existingId) {
    const { data, error } = await supabase
      .from('sources')
      .update(payload)
      .eq('id', input.existingId)
      .select('id')
      .single()
    if (error) {
      logger.warn('source.update_failed', { code: error.code })
      return null
    }
    return data.id
  }

  const { data, error } = await supabase.from('sources').insert(payload).select('id').single()
  if (error) {
    logger.warn('source.insert_failed', { code: error.code })
    return null
  }
  return data.id
}

async function ensurePersonLink(
  supabase: Client,
  input: {
    workspaceId: string
    userId: string
    sourceId: string
    personId: string
    userSupplied: boolean
  },
) {
  const { data: link } = await supabase
    .from('source_person_links')
    .select('identity_match_status, identity_match_confidence')
    .eq('source_id', input.sourceId)
    .eq('person_id', input.personId)
    .maybeSingle()

  if (link) {
    return {
      status: link.identity_match_status,
      confidence: Number(link.identity_match_confidence ?? 0),
      explanation: 'Already associated with this person.',
    }
  }

  await supabase.from('source_person_links').insert({
    workspace_id: input.workspaceId,
    user_id: input.userId,
    source_id: input.sourceId,
    person_id: input.personId,
    identity_match_status: input.userSupplied ? 'confirmed' : 'unreviewed',
    identity_match_confidence: input.userSupplied ? 1 : null,
    match_signals: { userProvidedForPerson: input.userSupplied },
    reviewed_by_user: input.userSupplied,
  })

  return {
    status: (input.userSupplied ? 'confirmed' : 'unreviewed') as Database['public']['Enums']['identity_match_status'],
    confidence: input.userSupplied ? 1 : 0,
    explanation: input.userSupplied ? 'You provided this link.' : 'Not yet reviewed.',
  }
}

async function persistFacts(
  supabase: Client,
  input: {
    workspaceId: string
    userId: string
    personId: string
    sourceId: string
    facts: { kind: string; value: string; detail: string | null; excerpt: string | null; evidenceLevel: string; isCurrent: boolean }[]
    asOf: string | null
  },
): Promise<number> {
  if (input.facts.length === 0) return 0

  // Existing current facts of the same kind, so a changed title supersedes
  // rather than duplicating.
  const { data: existing } = await supabase
    .from('professional_facts')
    .select('id, kind, value, is_current')
    .eq('person_id', input.personId)
    .eq('is_current', true)

  let created = 0

  for (const fact of input.facts) {
    const duplicate = (existing ?? []).find(
      (e) => e.kind === fact.kind && e.value.toLowerCase() === fact.value.toLowerCase(),
    )

    if (duplicate) {
      // Same claim from another source: strengthen provenance, do not duplicate.
      await supabase.from('fact_sources').upsert(
        {
          workspace_id: input.workspaceId,
          user_id: input.userId,
          fact_id: duplicate.id,
          source_id: input.sourceId,
          excerpt: fact.excerpt,
        },
        { onConflict: 'fact_id,source_id' },
      )
      await supabase
        .from('professional_facts')
        .update({ last_confirmed_at: new Date().toISOString() })
        .eq('id', duplicate.id)
      continue
    }

    // A different value for a single-valued current fact means it may have changed.
    const singleValued = ['current_role', 'current_organization', 'location']
    const conflicting =
      fact.isCurrent && singleValued.includes(fact.kind)
        ? (existing ?? []).find((e) => e.kind === fact.kind)
        : undefined

    const { data: inserted, error } = await supabase
      .from('professional_facts')
      .insert({
        workspace_id: input.workspaceId,
        user_id: input.userId,
        person_id: input.personId,
        kind: fact.kind as Database['public']['Enums']['fact_kind'],
        value: fact.value,
        detail: fact.detail,
        evidence_level: fact.evidenceLevel as Database['public']['Enums']['evidence_level'],
        is_current: fact.isCurrent,
        as_of: input.asOf,
        // Flag rather than silently overwrite: the user decides which is right.
        has_conflict: Boolean(conflicting),
      })
      .select('id')
      .single()

    if (error || !inserted) {
      logger.warn('fact.insert_failed', { code: error?.code })
      continue
    }

    await supabase.from('fact_sources').insert({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      fact_id: inserted.id,
      source_id: input.sourceId,
      excerpt: fact.excerpt,
    })

    if (conflicting) {
      await supabase
        .from('professional_facts')
        .update({ has_conflict: true })
        .eq('id', conflicting.id)
    }

    created++
  }

  return created
}

async function proposeObservations(
  supabase: Client,
  input: {
    workspaceId: string
    userId: string
    personId: string
    sourceId: string
    observations: { content: string; excerpt: string | null; evidenceLevel: string }[]
  },
): Promise<number> {
  let created = 0

  for (const observation of input.observations) {
    const { data: inserted, error } = await supabase
      .from('observations')
      .insert({
        workspace_id: input.workspaceId,
        user_id: input.userId,
        person_id: input.personId,
        content: observation.content,
        category: 'communication',
        evidence_level: observation.evidenceLevel as Database['public']['Enums']['evidence_level'],
        // Proposed, never active: public research does not enter the
        // relationship record until a human accepts it.
        status: 'proposed',
        source_kind: 'import',
      })
      .select('id')
      .single()

    if (error || !inserted) continue

    await supabase.from('observation_sources').insert({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      observation_id: inserted.id,
      source_id: input.sourceId,
      excerpt: observation.excerpt,
    })

    created++
  }

  return created
}

function emptyResult(accessStatus: AccessStatus, message: string): IngestResult {
  return {
    sourceId: null,
    accessStatus,
    title: null,
    sourceType: 'other',
    reused: false,
    identity: null,
    factsCreated: 0,
    observationsProposed: 0,
    message,
  }
}
