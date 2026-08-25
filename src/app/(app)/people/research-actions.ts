'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import { requireUser } from '@/lib/auth'
import { getWorkspace } from '@/lib/workspace'
import { checkCapability, recordUsage } from '@/lib/billing/entitlements'
import { ingestText, ingestUrl } from '@/lib/research/ingest'
import { extractDocument } from '@/lib/sources/document'
import { resolveSearchProvider, researchCapability } from '@/lib/research/providers'
import { detectInputKind } from '@/lib/sources/url'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'

/**
 * RESEARCH + UNIVERSAL ADD CONTEXT
 * =============================================================================
 * One entry point handles whatever the user pastes. `detectInputKind` decides
 * whether it is a URL, a transcript or a note, so the user never has to pick
 * from a menu of import workflows.
 *
 * Research runs synchronously and returns a real result. A background job queue
 * would be the right call at higher volume, but at MVP scale a synchronous call
 * with truthful staged progress is simpler and gives the user a better moment.
 * =============================================================================
 */

export interface ResearchState {
  ok?: boolean
  error?: string
  message?: string
  sourcesConsidered?: number
  sourcesAccepted?: number
  factsCreated?: number
  observationsProposed?: number
  needsReview?: boolean
}

const addContextSchema = z.object({
  personId: z.string().uuid(),
  input: z.string().trim().min(3, 'Paste a link, a note or a transcript.').max(200_000),
  title: z.string().trim().max(200).optional(),
})

/**
 * Add a document.
 *
 * The file is turned into text and then goes down exactly the same path as a
 * pasted transcript — identity resolution, fact extraction, citation, user
 * confirmation. Nothing about a document is special once it is text, which is
 * why this is a thin wrapper rather than a second pipeline.
 *
 * Metered as a document analysis, and refused before any work happens if the
 * user has no quota left.
 */
export async function addDocument(
  _prev: ResearchState,
  formData: FormData,
): Promise<ResearchState> {
  const personId = formData.get('personId')
  const file = formData.get('file')

  if (typeof personId !== 'string' || !personId) return { error: 'No person selected.' }
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file first.' }

  const capability = await checkCapability('documentAnalysis', 'document_analysis')
  if (!capability.allowed) return { error: capability.message }

  const user = await requireUser()
  const { workspaceId } = await getWorkspace()
  const supabase = await createClient()

  const { data: person } = await supabase
    .from('people')
    .select('id')
    .eq('id', personId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!person) return { error: 'That person could not be found.' }

  const extraction = await extractDocument(file)
  if (!extraction.ok) return { error: extraction.message }

  try {
    const result = await ingestText(extraction.text, {
      supabase,
      workspaceId,
      userId: user.id,
      personId,
      title: extraction.title,
      sourceType: 'document',
    })

    await recordUsage({
      meter: 'document_analysis',
      subjectKind: 'person',
      subjectId: personId,
      provider: result.usage?.provider,
      model: result.usage?.model,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    })

    await track('document_added', { kind: extraction.kind, truncated: extraction.truncated })
    revalidatePath(`/people/${personId}`)

    if (result.message) return { error: result.message }

    const truncationNote = extraction.truncated
      ? ' Only the first part was read — it is a long document.'
      : ''

    return {
      ok: true,
      message:
        result.observationsProposed > 0
          ? `Read ${extraction.title}. ${result.observationsProposed} suggestion${
              result.observationsProposed === 1 ? '' : 's'
            } to review.${truncationNote}`
          : `Read ${extraction.title} and saved it as a source.${truncationNote}`,
      factsCreated: result.factsCreated,
      observationsProposed: result.observationsProposed,
    }
  } catch (error) {
    logger.error('research.document_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
    return { error: 'That document could not be processed. Nothing was saved.' }
  }
}

/**
 * Universal Add Context. Accepts a URL, pasted text or a transcript and routes
 * to the right ingestion path.
 */
export async function addContext(_prev: ResearchState, formData: FormData): Promise<ResearchState> {
  const parsed = addContextSchema.safeParse({
    personId: formData.get('personId'),
    input: formData.get('input'),
    title: formData.get('title') || undefined,
  })

  if (!parsed.success) {
    return {
      error: z.flattenError(parsed.error).fieldErrors.input?.[0] ?? 'That could not be read.',
    }
  }

  const kind = detectInputKind(parsed.data.input)

  const capability = await checkCapability(
    kind === 'transcript' ? 'transcriptAnalysis' : 'researchPerson',
    kind === 'transcript' ? 'transcript_analysis' : 'source_ingest',
  )
  if (!capability.allowed) return { error: capability.message }

  const user = await requireUser()
  const { workspaceId } = await getWorkspace()
  const supabase = await createClient()

  try {
    const result =
      kind === 'url'
        ? await ingestUrl(parsed.data.input, {
            supabase,
            workspaceId,
            userId: user.id,
            personId: parsed.data.personId,
            userSupplied: true,
          })
        : await ingestText(parsed.data.input, {
            supabase,
            workspaceId,
            userId: user.id,
            personId: parsed.data.personId,
            title: parsed.data.title ?? (kind === 'transcript' ? 'Transcript' : 'Note'),
            sourceType: kind === 'transcript' ? 'transcript' : 'user_note',
          })

    if (kind === 'transcript') {
      await recordUsage({
        meter: 'transcript_analysis',
        subjectKind: 'person',
        subjectId: parsed.data.personId,
        // Null when the deterministic composer ran, which is the honest
        // record: nothing was spent with a provider.
        provider: result.usage?.provider,
        model: result.usage?.model,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
      })
    }

    await track('observation_added', { source: kind })
    revalidatePath(`/people/${parsed.data.personId}`)

    if (result.message) {
      return { ok: false, error: result.message }
    }

    return {
      ok: true,
      message:
        result.factsCreated > 0 || result.observationsProposed > 0
          ? `Added. ${result.factsCreated} fact${result.factsCreated === 1 ? '' : 's'} and ${result.observationsProposed} suggestion${result.observationsProposed === 1 ? '' : 's'} to review.`
          : 'Added as a source. Nothing new was extractable from it.',
      factsCreated: result.factsCreated,
      observationsProposed: result.observationsProposed,
      needsReview: result.identity ? result.identity.status === 'ambiguous' : false,
    }
  } catch (error) {
    logger.error('research.add_context_failed', {
      kind,
      error: error instanceof Error ? error.name : 'unknown',
    })
    return { error: 'Something went wrong reading that. Try again, or paste the text directly.' }
  }
}

/**
 * RESEARCH PERSON.
 *
 * Two paths:
 *   - discovery configured: search for candidate sources, then ingest the best
 *   - not configured: ingest the profile URL the user supplied, if any
 *
 * Either way the result is source-backed. There is no path that invents a
 * profile when nothing was found.
 */
export async function researchPerson(personId: string): Promise<ResearchState> {
  const capability = await checkCapability('researchPerson', 'person_research')
  if (!capability.allowed) return { error: capability.message }

  const user = await requireUser()
  const { workspaceId } = await getWorkspace()
  const supabase = await createClient()

  const { data: person } = await supabase
    .from('people')
    .select('id, full_name, job_title, profile_url, identity_locked, organizations(name)')
    .eq('id', personId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!person) return { error: 'That person could not be found.' }

  const { data: job } = await supabase
    .from('research_jobs')
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      person_id: personId,
      status: 'running',
      stage: 'resolving_identity',
      query: {
        name: person.full_name,
        organization: person.organizations?.name ?? null,
        jobTitle: person.job_title,
      },
      provider: resolveSearchProvider().id,
    })
    .select('id')
    .single()

  const jobId = job?.id ?? null
  const capabilities = researchCapability()

  let considered = 0
  let accepted = 0
  let facts = 0
  let proposals = 0
  let inputTokens = 0
  let outputTokens = 0
  let usedProvider: string | undefined
  let usedModel: string | undefined
  const candidateUrls: string[] = []

  try {
    // --- discovery -----------------------------------------------------------
    if (capabilities.canDiscover) {
      await updateJob(supabase, jobId, { stage: 'searching_sources' })
      const provider = resolveSearchProvider()
      const search = await provider.search({
        name: person.full_name,
        organization: person.organizations?.name ?? null,
        jobTitle: person.job_title,
        limit: 10,
      })

      if (search.ok) {
        considered = search.results.length
        // Prefer official and substantive sources over aggregators.
        candidateUrls.push(...rankCandidates(search.results.map((r) => r.url)).slice(0, 6))
      }
    }

    // The user-supplied profile URL is always worth reading, and is the only
    // source available when discovery is not configured.
    if (person.profile_url) {
      candidateUrls.unshift(person.profile_url)
      considered = Math.max(considered, 1)
    }

    if (candidateUrls.length === 0) {
      await updateJob(supabase, jobId, {
        status: 'no_results',
        stage: 'complete',
        completed_at: new Date().toISOString(),
        sources_considered: 0,
      })
      return {
        ok: false,
        error: capabilities.canDiscover
          ? `I could not find enough reliable professional information about ${person.full_name}.`
          : (capabilities.discoveryHint ?? 'Add a link to research from.'),
      }
    }

    // --- ingest --------------------------------------------------------------
    await updateJob(supabase, jobId, { stage: 'reviewing_material' })

    const seen = new Set<string>()
    for (const url of candidateUrls) {
      if (seen.has(url)) continue
      seen.add(url)

      const result = await ingestUrl(url, {
        supabase,
        workspaceId,
        userId: user.id,
        personId,
        // Only the profile URL the user themselves supplied gets that trust.
        userSupplied: url === person.profile_url,
      })

      if (result.usage) {
        // One research run reads several pages, so cost accrues across the
        // whole job rather than per page.
        inputTokens += result.usage.inputTokens
        outputTokens += result.usage.outputTokens
        usedProvider = result.usage.provider
        usedModel = result.usage.model
      }

      if (result.sourceId && result.accessStatus === 'analyzed') {
        accepted++
        facts += result.factsCreated
        proposals += result.observationsProposed
      }
    }

    await updateJob(supabase, jobId, {
      status: 'complete',
      stage: 'complete',
      completed_at: new Date().toISOString(),
      sources_considered: considered,
      sources_accepted: accepted,
      facts_created: facts,
      observations_proposed: proposals,
    })

    await supabase
      .from('people')
      .update({
        last_researched_at: new Date().toISOString(),
        research_status: accepted > 0 ? 'complete' : 'no_results',
      })
      .eq('id', personId)
      .eq('user_id', user.id)

    await recordUsage({
      meter: 'person_research',
      subjectKind: 'person',
      subjectId: personId,
      provider: usedProvider,
      model: usedModel,
      inputTokens,
      outputTokens,
    })
    await track('person_added', { researched: true, sourcesAccepted: accepted })

    revalidatePath(`/people/${personId}`)

    if (accepted === 0) {
      return {
        ok: false,
        error: `I reviewed ${considered} source${considered === 1 ? '' : 's'} but could not confirm any of them were about ${person.full_name}.`,
        sourcesConsidered: considered,
      }
    }

    return {
      ok: true,
      message: `Reviewed ${considered} source${considered === 1 ? '' : 's'}, used ${accepted}.`,
      sourcesConsidered: considered,
      sourcesAccepted: accepted,
      factsCreated: facts,
      observationsProposed: proposals,
    }
  } catch (error) {
    logger.error('research.person_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
    await updateJob(supabase, jobId, {
      status: 'failed',
      failure_reason: 'exception',
      completed_at: new Date().toISOString(),
    })
    return { error: 'Research did not complete. Try again, or paste a link directly.' }
  }
}

type ResearchJobUpdate = Database['public']['Tables']['research_jobs']['Update']

async function updateJob(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string | null,
  patch: ResearchJobUpdate,
) {
  if (!jobId) return
  await supabase.from('research_jobs').update(patch).eq('id', jobId)
}

/**
 * Rank candidate URLs by likely usefulness.
 * Official company pages and conference listings beat SEO aggregators, which
 * are the main source of confidently-wrong biographical data.
 */
function rankCandidates(urls: string[]): string[] {
  const DENY = [
    'facebook.com',
    'instagram.com',
    'tiktok.com',
    'pinterest.com',
    'quora.com',
    'zoominfo.com',
    'rocketreach.co',
    'signalhire.com',
    'apollo.io',
    'lusha.com',
    'spokeo.com',
    'whitepages.com',
    'peoplefinder',
    'beenverified',
    // LinkedIn is excluded on purpose: fetching it programmatically is against
    // their terms. Users may still add a LinkedIn URL as identity metadata.
    'linkedin.com',
  ]

  const scored = urls
    .map((url) => {
      let host = ''
      let path = ''
      try {
        const parsedUrl = new URL(url)
        host = parsedUrl.hostname.toLowerCase().replace(/^www\./, '')
        path = parsedUrl.pathname.toLowerCase()
      } catch {
        return null
      }
      if (DENY.some((d) => host.includes(d))) return null

      let score = 0
      if (/\/(leadership|team|about|our-people|management|bio)\b/.test(path)) score += 5
      if (/\/(speakers?|sessions?|agenda|conference)\b/.test(path)) score += 4
      if (/\/(blog|news|press|insights|article)\b/.test(path)) score += 3
      if (host.endsWith('.edu') || host.endsWith('.gov') || host.endsWith('.org')) score += 2
      if (host === 'github.com' || host === 'youtube.com') score += 2
      // Deep aggregator-style paths are usually low quality.
      if (path.split('/').length > 6) score -= 2

      return { url, score }
    })
    .filter((x): x is { url: string; score: number } => x !== null)

  return scored.sort((a, b) => b.score - a.score).map((s) => s.url)
}

/** Mark a source as the wrong person and stop it influencing anything. */
export async function rejectSourceMatch(sourceId: string, personId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  await supabase
    .from('source_person_links')
    .update({ identity_match_status: 'no_match', reviewed_by_user: true })
    .eq('source_id', sourceId)
    .eq('person_id', personId)
    .eq('user_id', user.id)

  // Facts supported ONLY by this source lose their basis and are removed.
  await removeOrphanedFacts(supabase, personId, sourceId, user.id)

  revalidatePath(`/people/${personId}`)
  return { ok: true as const }
}

/** Confirm a source really is about this person. */
export async function confirmSourceMatch(sourceId: string, personId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  await supabase
    .from('source_person_links')
    .update({
      identity_match_status: 'confirmed',
      identity_match_confidence: 1,
      reviewed_by_user: true,
    })
    .eq('source_id', sourceId)
    .eq('person_id', personId)
    .eq('user_id', user.id)

  await supabase
    .from('sources')
    .update({ access_status: 'analyzed' })
    .eq('id', sourceId)
    .eq('user_id', user.id)

  revalidatePath(`/people/${personId}`)
  return { ok: true as const }
}

/**
 * Delete a source and clean up after it.
 *
 * Facts that had no other supporting source are removed rather than left
 * floating as unattributable claims — that is the whole point of provenance.
 * Observations the user explicitly confirmed are KEPT: the user vouched for
 * them, so they no longer depend on the source.
 */
export async function deleteSource(sourceId: string, personId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  await removeOrphanedFacts(supabase, personId, sourceId, user.id)

  // Unconfirmed proposals derived from this source lose their basis.
  const { data: derived } = await supabase
    .from('observation_sources')
    .select('observation_id')
    .eq('source_id', sourceId)
    .eq('user_id', user.id)

  const derivedIds = (derived ?? []).map((d) => d.observation_id)
  if (derivedIds.length > 0) {
    await supabase
      .from('observations')
      .delete()
      .in('id', derivedIds)
      .eq('user_id', user.id)
      .eq('status', 'proposed')
  }

  await supabase.from('sources').delete().eq('id', sourceId).eq('user_id', user.id)

  revalidatePath(`/people/${personId}`)
  return { ok: true as const }
}

async function removeOrphanedFacts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  personId: string,
  sourceId: string,
  userId: string,
) {
  const { data: links } = await supabase
    .from('fact_sources')
    .select('fact_id')
    .eq('source_id', sourceId)
    .eq('user_id', userId)

  for (const link of links ?? []) {
    const { count } = await supabase
      .from('fact_sources')
      .select('id', { count: 'exact', head: true })
      .eq('fact_id', link.fact_id)

    // This was the only source backing the fact.
    if ((count ?? 0) <= 1) {
      await supabase
        .from('professional_facts')
        .delete()
        .eq('id', link.fact_id)
        .eq('user_id', userId)
        .eq('person_id', personId)
    }
  }
}
