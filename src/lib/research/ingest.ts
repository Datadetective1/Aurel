import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/lib/supabase/types'
import { safeFetch, parseUrl } from '@/lib/sources/fetch'
import { classifyUrl, extractFromHtml, extractFromText } from '@/lib/sources/extract'
import { assessIdentity, needsReview, shouldAutoLink } from './identity'
import { runPrompt } from '@/lib/ai/provider'
import {
  extractedFactSchema,
  sourceExtractionPrompt,
  sourceExtractionSchema,
} from '@/lib/ai/prompts/source-extraction'
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
 * "why does Atturel think this" from stored rows rather than reconstruction.
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
  /**
   * Read and assess the page, but add nothing to the person's record. What it
   * would add is held with the link, as `match_signals.held`, until the user
   * says whether it is them (`addHeldResults`, or rejection, which drops it).
   */
  holdForReview?: boolean
}

/** Provenance -> the shape the usage meter wants. Null when nothing generated. */
function usageFrom(provenance: {
  provider: string
  model: string
  groundedFallback: boolean
  tokenUsage: { input: number; output: number } | null
}): IngestResult['usage'] {
  return {
    provider: provenance.provider,
    model: provenance.model,
    inputTokens: provenance.tokenUsage?.input ?? 0,
    outputTokens: provenance.tokenUsage?.output ?? 0,
    grounded: provenance.groundedFallback,
  }
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
  /**
   * What the extraction cost, when a model ran.
   *
   * Surfaced so the caller can meter it. Without this the research meter
   * records that research happened but not what it consumed, which makes unit
   * economics unknowable the moment a provider is configured.
   */
  usage: {
    provider: string
    model: string
    inputTokens: number
    outputTokens: number
    grounded: boolean
  } | null
  /** User-facing explanation when nothing usable came back. */
  message: string | null
  /** Read and held for the user's review: nothing from it is in the record yet. */
  held?: boolean
}

/**
 * WHY A PAGE COULD NOT BE READ
 * =============================================================================
 * "There was not enough readable text on that page" was told to somebody who
 * pasted a public Facebook profile. It reads as though the page were empty and
 * Atturel merely came up short. What actually happens is that the site returns
 * half a megabyte of markup containing no readable text at all, because the
 * content is assembled by JavaScript that a fetch does not run.
 *
 * Measured against the real extractor:
 *
 *   facebook.com/zuck      495,061 bytes  ->      15 chars of text
 *   instagram.com/zuck     722,450 bytes  ->     115 chars
 *   x.com/elonmusk          26,643 bytes  ->      25 chars
 *   example.com                559 bytes  ->     142 chars   (genuinely small)
 *   linkedin.com/in/...    598,246 bytes  ->  32,239 chars   (reads fine)
 *   en.wikipedia.org/...   478,752 bytes  ->  35,404 chars
 *
 * So the signal is the RATIO, not the domain: a substantial document that
 * yields almost nothing readable is a client-rendered shell or an access wall.
 * A page that is genuinely thin is small in both. That distinction separates
 * Facebook from example.com without naming either, and LinkedIn — which reads
 * perfectly well — is never caught by it. No host list is needed and none is
 * used.
 *
 * The wording stays conservative throughout. "We couldn't read this page" is
 * always true; "the site blocked us" would be a claim about someone else's
 * intent that this evidence does not support.
 * =============================================================================
 */

/**
 * A document this big should have produced something readable.
 *
 * Well clear of both sides of the observed range: example.com is 559 bytes and
 * the smallest restricted page measured is x.com at 26,643.
 */
const SUBSTANTIAL_DOCUMENT_BYTES = 10_000

/** Below this, there is nothing worth sending to a model. */
const MIN_USABLE_TEXT = 200

/**
 * Map a fetch failure onto the access status the UI renders.
 *
 * Exported for the tests that pin this classification: it is pure, and the
 * alternative is standing up a Supabase client to assert on a string.
 */
export function accessStatusFor(failure: { reason: string; status?: number }): {
  status: AccessStatus
  message: string
} {
  switch (failure.reason) {
    case 'blocked_host':
    case 'blocked_scheme':
      return { status: 'unsupported', message: 'Enter a valid web address.' }
    case 'http_error':
      // 401 and 403 are the site saying no in as many words. Anything else in
      // the error range is a page that is missing or broken, which is a
      // different thing to tell somebody.
      return failure.status === 401 || failure.status === 403
        ? {
            status: 'limited_access',
            message: RESTRICTED_MESSAGE,
          }
        : {
            status: 'limited_access',
            message:
              'We couldn’t open this page. It may have moved, or it may not be publicly available.',
          }
    case 'unsupported_content_type':
      return { status: 'unsupported', message: 'That file type is not supported yet.' }
    case 'too_large':
      return { status: 'content_unavailable', message: 'That page is too large to analyze.' }
    case 'timeout':
      return {
        status: 'error',
        message: 'That page took too long to respond. Check the link and try again.',
      }
    case 'invalid_url':
      return { status: 'unsupported', message: 'Enter a valid web address.' }
    default:
      return {
        status: 'error',
        message: 'We couldn’t reach this page. Check the link and try again.',
      }
  }
}

/**
 * Said whenever the page was reachable but its content was not available to an
 * ordinary fetch. Names no site and accuses no one: it says what happened and
 * what the user can do instead.
 */
const RESTRICTED_MESSAGE =
  'We couldn’t read this page. Some sites limit automated access to their content. You can paste the relevant public information here, or attach a document instead.'

/** A page whose content really is sparse, as opposed to withheld. */
const THIN_MESSAGE = 'There wasn’t enough readable information on this page to use.'

/** Paths a site redirects to when it wants a session before showing anything. */
const AUTH_PATH =
  /\/(login|signin|sign-in|sign_in|auth|authwall|checkpoint|challenge|consent)(\/|$|\?)/i

/**
 * Why the extraction came back unusable, if it did.
 *
 * Returns null when the page read fine. Exported for the same reason as
 * `accessStatusFor`.
 */
export function classifyRead(input: {
  text: string
  title: string | null
  bytes: number
  finalUrl: string
  submittedUrl: string
}): { status: AccessStatus; message: string } | null {
  const text = input.text.trim()
  const sample = `${input.title ?? ''} ${text.slice(0, 1200)}`.toLowerCase()

  // Explicit walls first: these are the site telling us in words, and they
  // deserve a more specific answer than the generic one.
  if (/\b(sign in to continue|log ?in to view|create an account to|members only)\b/.test(sample)) {
    return {
      status: 'login_required',
      message: `That page needs a sign-in, so ${brand.name} cannot read it. Paste the relevant text instead.`,
    }
  }
  if (/\b(subscribe to (?:read|continue)|this article is for subscribers|paywall)\b/.test(sample)) {
    return {
      status: 'paywall',
      message: 'That page is behind a paywall. Paste the relevant text instead.',
    }
  }

  if (text.length >= MIN_USABLE_TEXT) return null

  // Redirected somewhere that wants a session. Compared against where we were
  // sent rather than where we started, so a link that lands on a login page
  // is caught even though the submitted URL looked ordinary.
  const redirectedToAuth = input.finalUrl !== input.submittedUrl && AUTH_PATH.test(input.finalUrl)

  // The ratio signal. A large document that produced no readable text is a
  // client-rendered shell or a wall; a small one is simply a small page.
  const substantialButEmpty = input.bytes >= SUBSTANTIAL_DOCUMENT_BYTES

  if (redirectedToAuth || substantialButEmpty) {
    return { status: 'limited_access', message: RESTRICTED_MESSAGE }
  }

  return { status: 'content_unavailable', message: THIN_MESSAGE }
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
    .select(
      'id, source_url, source_title, publisher, published_at, extracted_text, access_status, processing_status, content_hash, source_type',
    )
    .eq('workspace_id', workspaceId)
    .eq('source_url', normalisedUrl)
    .maybeSingle()

  if (existing && !options.refresh && existing.processing_status === 'complete') {
    // Held for review: read from what is stored, never linked as confirmed
    // just because the page is already on file. The source's own status is
    // left alone -- it may stand behind someone else.
    if (personId && options.holdForReview && existing.extracted_text) {
      const person = await loadSubject(supabase, personId)
      if (person) {
        return holdForReview(supabase, {
          workspaceId,
          userId,
          personId,
          person,
          source: {
            id: existing.id,
            title: existing.source_title,
            text: existing.extracted_text,
            url: existing.source_url ?? normalisedUrl,
            publisher: existing.publisher,
            publishedAt: existing.published_at,
            sourceType: existing.source_type,
          },
          userSupplied: options.userSupplied ?? false,
          markSource: false,
        })
      }
    }

    // Still associate it with this person if that link does not exist yet.
    // Under the hold, a typed link is never recorded as confirmed here.
    const linked = personId
      ? await ensurePersonLink(supabase, {
          workspaceId,
          userId,
          sourceId: existing.id,
          personId,
          userSupplied: !options.holdForReview && (options.userSupplied ?? false),
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
      usage: null,
      message: null,
    }
  }

  // --- fetch -----------------------------------------------------------------
  const fetched = await safeFetch(normalisedUrl)

  if (!fetched.ok) {
    // The whole failure, not just the reason: 401 and 403 need distinguishing
    // from a 404, and only the status says which happened.
    const { status, message } = accessStatusFor(fetched)
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

  const unreadable = classifyRead({
    text: extracted.text,
    title: extracted.title,
    bytes: fetched.bytes,
    finalUrl: fetched.finalUrl,
    submittedUrl: normalisedUrl,
  })

  if (unreadable) {
    // The URL is still recorded, with the status that says why nothing came of
    // it. No facts, no observations, no identity resolution — none of that runs
    // on this path, so nothing can imply the page was analysed when it was not.
    const sourceId = await upsertSource(supabase, {
      existingId: existing?.id,
      workspaceId,
      userId,
      url: normalisedUrl,
      sourceType,
      title: extracted.title,
      accessStatus: unreadable.status,
      processingStatus: 'failed',
      failureReason: unreadable.status,
    })
    return { ...emptyResult(unreadable.status, unreadable.message), sourceId }
  }

  // Unchanged content: keep the existing extraction and skip the model call.
  if (
    existing?.content_hash &&
    existing.content_hash === extracted.contentHash &&
    !options.refresh
  ) {
    return {
      sourceId: existing.id,
      accessStatus: existing.access_status,
      title: existing.source_title,
      sourceType: existing.source_type,
      reused: true,
      identity: null,
      factsCreated: 0,
      observationsProposed: 0,
      usage: null,
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
      usage: null,
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
      usage: null,
      message: null,
    }
  }

  if (options.holdForReview) {
    return holdForReview(supabase, {
      workspaceId,
      userId,
      personId,
      person,
      source: {
        id: sourceId,
        title: extracted.title,
        text: extracted.text,
        url: fetched.finalUrl,
        publisher: extracted.publisher,
        publishedAt: extracted.publishedAt,
        sourceType,
      },
      userSupplied: options.userSupplied ?? false,
      markSource: true,
    })
  }

  // The user's own decision about this page stands. "Not them" is never
  // linked again by a later run, and "this is them" is never downgraded,
  // until the user chooses to reconsider the page (`reconsiderSourceMatch`).
  const { data: prior } = await supabase
    .from('source_person_links')
    .select('identity_match_status, reviewed_by_user')
    .eq('source_id', sourceId)
    .eq('person_id', personId)
    .maybeSingle()
  if (prior?.reviewed_by_user && prior.identity_match_status === 'no_match') {
    return {
      sourceId,
      accessStatus: 'identity_uncertain',
      title: extracted.title,
      sourceType,
      reused: false,
      identity: {
        status: 'no_match',
        confidence: 0,
        explanation: 'You said this page is about someone else.',
      },
      factsCreated: 0,
      observationsProposed: 0,
      usage: null,
      message: 'You said this page is about someone else, so it was not used.',
    }
  }
  const userConfirmed =
    prior?.reviewed_by_user === true && prior.identity_match_status === 'confirmed'

  const checked = assessIdentity(
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
  const assessment = userConfirmed
    ? {
        ...checked,
        status: 'confirmed' as const,
        confidence: 1,
        explanation: 'You confirmed this is them.',
      }
    : checked

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
      usage: null,
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

  // A page the user confirmed stays theirs to undo, whatever the reading says.
  if (!generation.output.mentionsTarget && !userConfirmed) {
    await supabase
      .from('sources')
      .update({ access_status: 'identity_uncertain' })
      .eq('id', sourceId)
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
      usage: null,
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
    usage: usageFrom(generation.provenance),
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
      usage: null,
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
    usage: usageFrom(generation.provenance),
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

// --- held for review -----------------------------------------------------------

type Subject = {
  full_name: string
  job_title: string | null
  email: string | null
  organizations: { name: string } | null
}

async function loadSubject(supabase: Client, personId: string): Promise<Subject | null> {
  const { data } = await supabase
    .from('people')
    .select('full_name, job_title, email, organizations(name)')
    .eq('id', personId)
    .maybeSingle()
  return data
}

/**
 * What a page would add, kept on its link until the user decides. Validated
 * on the way back out: it is stored JSON, and only well-formed facts may
 * reach the record.
 */
const heldSchema = z.object({
  facts: z.array(extractedFactSchema),
  observations: sourceExtractionSchema.shape.communicationObservations,
  asOf: z.string().nullable(),
})

export type HeldResults = z.infer<typeof heldSchema>

/** The held results on a link's `match_signals`, or null when there are none. */
export function readHeld(signals: unknown): HeldResults | null {
  if (!signals || typeof signals !== 'object' || !('held' in signals)) return null
  const parsed = heldSchema.safeParse((signals as { held: unknown }).held)
  return parsed.success ? parsed.data : null
}

/** The link's signals without held results, once the user has decided. */
export function withoutHeld(
  signals: unknown,
): Database['public']['Tables']['source_person_links']['Update']['match_signals'] {
  if (!signals || typeof signals !== 'object' || Array.isArray(signals)) return {}
  const { held: _held, ...rest } = signals as Record<string, unknown>
  return rest as Database['public']['Tables']['source_person_links']['Update']['match_signals']
}

/**
 * HOLD FOR REVIEW
 *
 * The identity check and the reading run exactly as they would otherwise, so
 * the review shows what the page would really add. But the link is left
 * `unreviewed` -- the state that asks "Check this is them" on the web too --
 * and the facts and proposals wait in `match_signals.held`. Nothing reaches
 * the person's record, a brief or Ask until the user says it is them.
 *
 * A page that is plainly not about them is recorded as such, as without the
 * hold, and nothing is held for it.
 */
async function holdForReview(
  supabase: Client,
  input: {
    workspaceId: string
    userId: string
    personId: string
    person: Subject
    source: {
      id: string
      title: string | null
      text: string
      url: string
      publisher: string | null
      publishedAt: string | null
      sourceType: SourceType
    }
    userSupplied: boolean
    /** Mark the source itself as awaiting identity. Only for a page fetched now. */
    markSource: boolean
  },
): Promise<IngestResult> {
  const { source, person } = input

  // What the user already decided, what is already in the record, and what
  // is already waiting are left exactly as they are: "not them" is never
  // offered again, and searching again does not re-read a page still waiting.
  const { data: prior } = await supabase
    .from('source_person_links')
    .select('identity_match_status, identity_match_confidence, reviewed_by_user, match_signals')
    .eq('source_id', source.id)
    .eq('person_id', input.personId)
    .maybeSingle()
  const priorHeld = prior ? readHeld(prior.match_signals) : null
  const inRecord =
    prior?.identity_match_status === 'confirmed' || prior?.identity_match_status === 'probable'
  if (prior && (prior.reviewed_by_user || inRecord || priorHeld)) {
    return {
      sourceId: source.id,
      accessStatus: inRecord ? 'analyzed' : 'identity_uncertain',
      title: source.title,
      sourceType: source.sourceType,
      reused: true,
      identity: {
        status: prior.identity_match_status,
        confidence: Number(prior.identity_match_confidence ?? 0),
        explanation: prior.reviewed_by_user
          ? 'You already decided about this page.'
          : 'Already found for this person.',
      },
      factsCreated: 0,
      observationsProposed: 0,
      usage: null,
      message: null,
      held: !prior.reviewed_by_user && !inRecord && priorHeld !== null,
    }
  }

  const assessment = assessIdentity(
    {
      fullName: person.full_name,
      organization: person.organizations?.name ?? null,
      jobTitle: person.job_title,
      email: person.email,
    },
    { title: source.title, text: source.text, url: source.url, publisher: source.publisher },
    { userSuppliedUrl: input.userSupplied },
  )

  const base = {
    sourceId: source.id,
    accessStatus: 'identity_uncertain' as const,
    title: source.title,
    sourceType: source.sourceType,
    reused: !input.markSource,
    factsCreated: 0,
    observationsProposed: 0,
  }
  const link = (status: Database['public']['Enums']['identity_match_status'], signals: object) =>
    supabase.from('source_person_links').upsert(
      {
        workspace_id: input.workspaceId,
        user_id: input.userId,
        source_id: source.id,
        person_id: input.personId,
        identity_match_status: status,
        identity_match_confidence: assessment.confidence,
        match_signals:
          signals as Database['public']['Tables']['source_person_links']['Insert']['match_signals'],
      },
      { onConflict: 'source_id,person_id' },
    )
  const markUncertain = async () => {
    if (input.markSource) {
      await supabase
        .from('sources')
        .update({ access_status: 'identity_uncertain' })
        .eq('id', source.id)
    }
  }
  const notThem = (explanation: string) => ({
    ...base,
    identity: { status: 'no_match' as const, confidence: assessment.confidence, explanation },
    usage: null,
    message: explanation,
  })

  if (assessment.status === 'no_match') {
    await link('no_match', assessment.signals)
    await markUncertain()
    return notThem(assessment.explanation)
  }

  const generation = await runPrompt(sourceExtractionPrompt, {
    person: {
      fullName: person.full_name,
      organization: person.organizations?.name ?? null,
      jobTitle: person.job_title,
    },
    source: {
      id: source.id,
      url: source.url,
      title: source.title,
      publisher: source.publisher,
      publishedAt: source.publishedAt,
      sourceType: source.sourceType,
      text: source.text,
    },
  })

  if (generation.output.containedInstructions) {
    logger.warn('research.source_contained_instructions', {
      sourceId: source.id,
      personId: input.personId,
    })
  }

  if (!generation.output.mentionsTarget) {
    await link('no_match', assessment.signals)
    await markUncertain()
    return {
      ...notThem(`On reading it, this source does not appear to be about ${person.full_name}.`),
      usage: usageFrom(generation.provenance),
    }
  }

  const held: HeldResults = {
    facts: generation.output.facts,
    observations: generation.output.communicationObservations,
    asOf: source.publishedAt,
  }
  await link('unreviewed', { ...assessment.signals, held })
  await markUncertain()

  return {
    ...base,
    identity: {
      status: assessment.status,
      confidence: assessment.confidence,
      explanation: assessment.explanation,
    },
    usage: usageFrom(generation.provenance),
    message: `${assessment.explanation} Check it is them before ${brand.name} adds anything.`,
    held: true,
  }
}

/**
 * Read a stored page again for one person and hold it for review -- the
 * second half of "Reconsider", after the caller has cleared the user's
 * earlier "not them". Read from what was stored: nothing is fetched.
 */
export async function reholdForReview(
  supabase: Client,
  input: { workspaceId: string; userId: string; personId: string; sourceId: string },
): Promise<IngestResult> {
  const { data: source } = await supabase
    .from('sources')
    .select('id, source_url, source_title, publisher, published_at, extracted_text, source_type')
    .eq('id', input.sourceId)
    .maybeSingle()
  if (!source?.extracted_text || !source.source_url) {
    return emptyResult(
      'content_unavailable',
      'There is no stored text for that page to read again.',
    )
  }
  const person = await loadSubject(supabase, input.personId)
  if (!person) return emptyResult('error', 'That person could not be found.')
  return holdForReview(supabase, {
    workspaceId: input.workspaceId,
    userId: input.userId,
    personId: input.personId,
    person,
    source: {
      id: source.id,
      title: source.source_title,
      text: source.extracted_text,
      url: source.source_url,
      publisher: source.publisher,
      publishedAt: source.published_at,
      sourceType: source.source_type,
    },
    userSupplied: false,
    markSource: false,
  })
}

/**
 * The user said a held page is them: what it would add goes into the record,
 * through the same writers a research run uses, so a fact already on record
 * from another page gains this one as a source instead of being duplicated.
 * No model runs here; the reading was done, and metered, with the research.
 */
export async function addHeldResults(
  supabase: Client,
  input: {
    workspaceId: string
    userId: string
    personId: string
    sourceId: string
    held: HeldResults
  },
): Promise<{ factsCreated: number; observationsProposed: number }> {
  const factsCreated = await persistFacts(supabase, {
    workspaceId: input.workspaceId,
    userId: input.userId,
    personId: input.personId,
    sourceId: input.sourceId,
    facts: input.held.facts,
    asOf: input.held.asOf,
  })
  const observationsProposed = await proposeObservations(supabase, {
    workspaceId: input.workspaceId,
    userId: input.userId,
    personId: input.personId,
    sourceId: input.sourceId,
    observations: input.held.observations,
  })
  return { factsCreated, observationsProposed }
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
    status: (input.userSupplied
      ? 'confirmed'
      : 'unreviewed') as Database['public']['Enums']['identity_match_status'],
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
    facts: {
      kind: string
      value: string
      detail: string | null
      excerpt: string | null
      evidenceLevel: string
      isCurrent: boolean
    }[]
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
    usage: null,
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
