'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import { requireUser } from '@/lib/auth'
import { getWorkspace } from '@/lib/workspace'
import { checkCapability, recordUsage } from '@/lib/billing/entitlements'
import {
  addHeldResults,
  ingestText,
  ingestUrl,
  readHeld,
  reholdForReview,
  withoutHeld,
} from '@/lib/research/ingest'
import { extractDocument } from '@/lib/sources/document'
import { resolveSearchProvider, researchCapability } from '@/lib/research/providers'
import {
  MAX_ANALYSED,
  MAX_CANDIDATES,
  MAX_SEARCH_REQUESTS,
  hasEnough,
  planQueries,
  rankCandidates,
} from '@/lib/research/queries'
import { canonicalUrl, detectInputKind } from '@/lib/sources/url'
import { isGenericEmailDomain } from '@/lib/research/matching'
import { resolveOrganization } from '@/lib/organizations'
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
  /** Pages read and held for the user to check: nothing from them is in the record yet. */
  sourcesHeld?: number
  needsReview?: boolean
  /**
   * Set when research ran but could not confidently identify the person --
   * as opposed to a provider outage or a quota. Names the identifying details
   * not yet on record, so the user is asked for the one thing most likely to
   * resolve it instead of being told only that nothing was found. Confidence
   * thresholds are untouched; this is recovery, not a lower bar.
   */
  identity?: { missing: IdentityDetail[] }
  /** Refused by the plan: the way forward is a plan change, not a retry. */
  upgrade?: boolean
}

/** A plan refusal, with an upgrade path only where a plan change would help. */
function refused(capability: { message?: string; plan?: string }): ResearchState {
  return { error: capability.message, upgrade: capability.plan === 'free' }
}

export type IdentityDetail = 'organization' | 'jobTitle' | 'profileUrl'

function missingIdentity(person: {
  job_title: string | null
  profile_url: string | null
  organizations: { name: string } | null
}): IdentityDetail[] {
  const missing: IdentityDetail[] = []
  if (!person.organizations?.name) missing.push('organization')
  if (!person.job_title) missing.push('jobTitle')
  if (!person.profile_url) missing.push('profileUrl')
  return missing
}

const addContextSchema = z.object({
  personId: z.string().uuid(),
  input: z.string().trim().min(3, 'Paste a link, a note or a transcript.').max(200_000),
  title: z.string().trim().max(200).optional(),
})

/**
 * Research is an active workflow: an archived person is out of it until they
 * are restored. Returns the refusal, or null to go on.
 */
async function archivedRefusal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  personId: string,
): Promise<ResearchState | null> {
  const { data } = await supabase
    .from('people')
    .select('archived_at')
    .eq('id', personId)
    .eq('user_id', userId)
    .maybeSingle()
  return data?.archived_at ? { error: 'Restore them first to research them.' } : null
}

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
  if (!capability.allowed) return refused(capability)

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
  const archived = await archivedRefusal(supabase, user.id, personId)
  if (archived) return archived

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
      ? ' Only the first part was read. It is a long document.'
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

  // A pasted transcript is read the same way, and against the same monthly
  // allowance, as a conversation kept from the Capture screen -- so Free can
  // do here exactly what it can do there.
  const capability = await checkCapability(
    kind === 'transcript' ? 'debrief' : 'researchPerson',
    kind === 'transcript' ? 'transcript_analysis' : 'source_ingest',
  )
  if (!capability.allowed) return refused(capability)

  const user = await requireUser()
  const { workspaceId } = await getWorkspace()
  const supabase = await createClient()
  const archived = await archivedRefusal(supabase, user.id, parsed.data.personId)
  if (archived) return archived

  try {
    const result =
      kind === 'url'
        ? await ingestUrl(parsed.data.input, {
            supabase,
            workspaceId,
            userId: user.id,
            personId: parsed.data.personId,
            userSupplied: true,
            // Read now, because the user asked, but held like any researched
            // page: adding a link is not checking what the page says.
            holdForReview: true,
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

    // A page the user marked as someone else stays that way, and the answer
    // says so rather than "added".
    if (result.reused && result.identity?.status === 'no_match') {
      return {
        error:
          'You marked that page as being about someone else, so it was not used. To use it, choose Reconsider on that page under Sources.',
      }
    }
    if (result.held) {
      return {
        ok: true,
        message:
          'Read. Check it under Sources: nothing from it is in their record until you say it is them.',
        sourcesHeld: 1,
        needsReview: true,
      }
    }
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
/** A research run longer than this is worth a look, even when it succeeds. */
const SLOW_RESEARCH_MS = 60_000

export async function researchPerson(
  personId: string,
  options: {
    /**
     * Add nothing until the user checks it: every page that may be about them
     * is read and held for review instead of being linked. The app's research
     * runs this way.
     */
    holdForReview?: boolean
  } = {},
): Promise<ResearchState> {
  const hold = options.holdForReview === true
  const capability = await checkCapability('researchPerson', 'person_research')
  if (!capability.allowed) {
    // The analytics event measures how often this happens; this line is what an
    // operator sees when a pilot user says research "stopped working".
    logger.info('research.quota_exhausted', { reason: capability.reason })
    return refused(capability)
  }

  const startedAt = Date.now()

  const user = await requireUser()
  const { workspaceId } = await getWorkspace()
  const supabase = await createClient()

  const { data: person } = await supabase
    .from('people')
    .select('id, full_name, job_title, profile_url, email, identity_locked, organizations(name)')
    .eq('id', personId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!person) return { error: 'That person could not be found.' }
  const archived = await archivedRefusal(supabase, user.id, personId)
  if (archived) return archived

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
  await track('person_research_started', { provider: resolveSearchProvider().id })
  const capabilities = researchCapability()

  let considered = 0
  let accepted = 0
  let facts = 0
  let proposals = 0
  let held = 0
  let inputTokens = 0
  let outputTokens = 0
  let usedProvider: string | undefined
  let usedModel: string | undefined
  const candidateUrls: string[] = []
  let searchRequests = 0
  let searchCostUnits = 0
  let searchFailure: 'not_configured' | 'rate_limited' | null = null

  try {
    // --- discovery -----------------------------------------------------------
    // A ladder of increasingly speculative queries rather than one broad
    // search, stopping as soon as there are enough strong candidates. On most
    // people the first rung -- name plus employer -- is the only one that runs.
    if (capabilities.canDiscover) {
      await updateJob(supabase, jobId, { stage: 'searching_sources' })
      const provider = resolveSearchProvider()

      // The email domain, when there is one and it is an employer's. Nothing
      // else narrows a search this hard: a page on the employer's own domain
      // naming the person is about as close to a primary source as public
      // research gets. A gmail.com address is not an employer, and searching
      // gmail.com for them spent one of the three requests on nothing.
      const emailDomain = person.email?.includes('@')
        ? (person.email.split('@')[1]?.toLowerCase() ?? null)
        : null
      const subject = {
        name: person.full_name,
        organization: person.organizations?.name ?? null,
        jobTitle: person.job_title,
        domain: emailDomain && !isGenericEmailDomain(emailDomain) ? emailDomain : null,
      }
      const plan = planQueries(subject)

      // Pages already settled for this person are not read again: a re-run
      // spends its reads on pages it has not seen, which is the only way a
      // second search can find anything new.
      const { known, setAside } = await knownPagesFor(supabase, personId)

      const strong: string[] = []
      let likely = 0

      for (const planned of plan) {
        if (searchRequests >= MAX_SEARCH_REQUESTS) break

        searchRequests++
        const search = await provider.search(planned.query)

        if (!search.ok) {
          // A rejected key or an exhausted quota will not improve on the next
          // rung, so stop rather than spend the remaining budget discovering
          // the same failure twice more.
          if (search.reason === 'not_configured' || search.reason === 'rate_limited') {
            searchFailure = search.reason
            break
          }
          continue
        }

        searchCostUnits += search.costUnits
        considered += search.results.length

        // Ranking runs per rung so `sufficient` counts sources worth reading,
        // not raw hits. Ten aggregator pages do not settle anything.
        const ranked = rankCandidates(search.results, subject, {
          known,
          setAside,
          canonical: (url) => canonicalUrl(url) ?? url,
        })
        const fresh = ranked.filter((candidate) => !strong.includes(candidate.url))
        strong.push(...fresh.map((candidate) => candidate.url))
        // Only results that look like them count toward stopping the ladder.
        const freshLikely = fresh.filter((candidate) => candidate.likelyThem).length
        likely += freshLikely

        if (hasEnough(planned, freshLikely, likely, MAX_CANDIDATES)) break
      }

      candidateUrls.push(...strong.slice(0, MAX_CANDIDATES))
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
        error: searchFailure
          ? searchFailure === 'rate_limited'
            ? 'Professional research has hit its rate limit for the moment. You can still paste a source.'
            : 'Professional research is temporarily unavailable. You can still paste a source.'
          : capabilities.canDiscover
            ? `I couldn't confidently identify ${person.full_name}.`
            : (capabilities.discoveryHint ?? 'Add a link to research from.'),
        ...(!searchFailure && capabilities.canDiscover
          ? { identity: { missing: missingIdentity(person) } }
          : {}),
      }
    }

    // --- ingest --------------------------------------------------------------
    await updateJob(supabase, jobId, { stage: 'reviewing_material' })

    // Deduplicated on the canonical URL, not the raw string. Discovery returned
    // both the plain Wikipedia article and `?useskin=vector` for the same
    // person: two fetches, two identity checks, two model calls, two stored
    // sources, and a footprint counting one document's evidence twice.
    const seen = new Set<string>()
    for (const url of candidateUrls) {
      const key = canonicalUrl(url) ?? url
      if (seen.has(key)) continue
      seen.add(key)

      // Each analysed page is a fetch plus a model call. The cap is what keeps
      // the cost of one research run bounded and predictable.
      if (seen.size > MAX_ANALYSED) break

      const result = await ingestUrl(url, {
        supabase,
        workspaceId,
        userId: user.id,
        personId,
        // Only the profile URL the user themselves supplied gets that trust --
        // as a strong identity signal, never as a confirmation. Its page waits
        // for the user's review on every run, the web's included: typing a
        // link in is not checking what the page says.
        userSupplied: url === person.profile_url,
        holdForReview: hold || url === person.profile_url,
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
      if (result.held) held++
    }

    await updateJob(supabase, jobId, {
      status: 'complete',
      stage: 'complete',
      completed_at: new Date().toISOString(),
      sources_considered: considered,
      sources_accepted: accepted,
      facts_created: facts,
      observations_proposed: proposals,
      cost_units: searchCostUnits,
    })

    await supabase
      .from('people')
      .update({
        last_researched_at: new Date().toISOString(),
        research_status: accepted > 0 ? 'complete' : held > 0 ? 'needs_review' : 'no_results',
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
      searchRequests,
      searchProvider: resolveSearchProvider().id,
    })
    await track('person_research_completed', {
      sourcesConsidered: considered,
      sourcesAccepted: accepted,
      factsCreated: facts,
      observationsProposed: proposals,
      sourcesHeld: held,
      searchRequests,
      searchCostUnits,
      inputTokens,
      outputTokens,
      succeeded: accepted > 0 || held > 0,
    })

    const elapsedMs = Date.now() - startedAt
    if (elapsedMs > SLOW_RESEARCH_MS) {
      // Each analysed page is a fetch plus a model call, so a slow run usually
      // means slow sources rather than a slow model. Both counts are here so
      // the difference is visible without reproducing it.
      logger.warn('research.slow_run', {
        elapsedMs,
        searchRequests,
        sourcesConsidered: considered,
        sourcesAccepted: accepted,
      })
    }

    revalidatePath(`/people/${personId}`)

    if (held > 0) {
      const check = held === 1 ? 'it' : 'each one'
      return {
        ok: true,
        message:
          accepted > 0
            ? `Reviewed ${considered} source${considered === 1 ? '' : 's'}, used ${accepted}. ${held} more may be about ${person.full_name}: nothing from ${held === 1 ? 'it' : 'them'} is in their record until you check ${check}.`
            : `Reviewed ${considered} source${considered === 1 ? '' : 's'}. ${held} may be about ${person.full_name}. Nothing is in their record until you check ${check}.`,
        sourcesConsidered: considered,
        sourcesAccepted: accepted,
        sourcesHeld: held,
        factsCreated: facts,
        observationsProposed: proposals,
        needsReview: true,
      }
    }

    if (accepted === 0) {
      return {
        ok: false,
        error: `I couldn't confidently identify ${person.full_name}. I reviewed ${considered} source${considered === 1 ? '' : 's'} and could not confirm any of them were about this person, so none were used. If they have little online, add what you know about them yourself.`,
        sourcesConsidered: considered,
        identity: { missing: missingIdentity(person) },
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
 * Pages this person's research has already settled, as canonical URLs.
 *
 * `known`: the user decided, it is in their record, or it is waiting for their
 * check -- reading any of these again adds nothing. `setAside`: the identity
 * check turned it down on its own; read again only when nothing better turns
 * up, since a sharper check may now accept it.
 */
async function knownPagesFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  personId: string,
): Promise<{ known: Set<string>; setAside: Set<string> }> {
  const known = new Set<string>()
  const setAside = new Set<string>()
  const { data } = await supabase
    .from('source_person_links')
    .select('identity_match_status, reviewed_by_user, match_signals, sources(source_url)')
    .eq('person_id', personId)
  for (const link of data ?? []) {
    const url = link.sources?.source_url
    if (!url) continue
    const key = canonicalUrl(url) ?? url
    const decided =
      link.reviewed_by_user ||
      link.identity_match_status === 'confirmed' ||
      link.identity_match_status === 'probable' ||
      readHeld(link.match_signals) !== null
    if (decided) known.add(key)
    else if (link.identity_match_status === 'no_match') setAside.add(key)
  }
  return { known, setAside }
}

/**
 * Mark a source as the wrong person and stop it influencing anything.
 *
 * The source row survives. That is the entire difference between this and
 * deleting it: the link is kept, flagged `no_match`, so the record remembers
 * that this page was checked and rejected. Research that meets the same URL
 * again knows not to attribute it to this person.
 *
 * Everything that rested on it alone is withdrawn — facts, and proposals.
 */
export async function rejectSourceMatch(sourceId: string, personId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  // What a held page would have added goes with it: "not them" leaves nothing
  // waiting to be added later.
  const { data: link } = await supabase
    .from('source_person_links')
    .select('match_signals')
    .eq('source_id', sourceId)
    .eq('person_id', personId)
    .eq('user_id', user.id)
    .maybeSingle()

  await supabase
    .from('source_person_links')
    .update({
      identity_match_status: 'no_match',
      reviewed_by_user: true,
      match_signals: withoutHeld(link?.match_signals),
    })
    .eq('source_id', sourceId)
    .eq('person_id', personId)
    .eq('user_id', user.id)

  // Facts supported ONLY by this source lose their basis and are removed.
  await removeOrphanedFacts(supabase, personId, sourceId, user.id)

  // And so do proposals drawn from it.
  //
  // This did not happen before, and deleting the source did. So a page the
  // user had explicitly said was about somebody else left its proposed
  // observations sitting in the review queue, ready to be accepted into the
  // record of a person they were never about. Saying "not them" has to mean
  // the same thing for a proposal as it does for a fact.
  //
  // Confirmed observations are kept, exactly as they are on deletion: once the
  // user has vouched for something, they are the evidence, not the page.
  await removeProposedObservations(supabase, sourceId, user.id)

  await track('research_source_rejected', {})
  revalidatePath(`/people/${personId}`)
  return { ok: true as const }
}

/**
 * Confirm a source really is about this person.
 *
 * A page held for review (research run with `holdForReview`) carries what it
 * would add; confirming is the moment that goes into the record. The results
 * are cleared from the link first, so a second confirmation adds nothing.
 */
export async function confirmSourceMatch(sourceId: string, personId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: link } = await supabase
    .from('source_person_links')
    .select('workspace_id, match_signals')
    .eq('source_id', sourceId)
    .eq('person_id', personId)
    .eq('user_id', user.id)
    .maybeSingle()
  const held = readHeld(link?.match_signals)

  await supabase
    .from('source_person_links')
    .update({
      identity_match_status: 'confirmed',
      identity_match_confidence: 1,
      reviewed_by_user: true,
      match_signals: withoutHeld(link?.match_signals),
    })
    .eq('source_id', sourceId)
    .eq('person_id', personId)
    .eq('user_id', user.id)

  await supabase
    .from('sources')
    .update({ access_status: 'analyzed' })
    .eq('id', sourceId)
    .eq('user_id', user.id)

  const added =
    held && link
      ? await addHeldResults(supabase, {
          workspaceId: link.workspace_id,
          userId: user.id,
          personId,
          sourceId,
          held,
        })
      : { factsCreated: 0, observationsProposed: 0 }

  await track('research_source_accepted', { factsAdded: added.factsCreated })
  revalidatePath(`/people/${personId}`)
  return { ok: true as const, ...added }
}

/**
 * RECONSIDER a page the user marked as someone else.
 *
 * The only way such a page is ever read for this person again: "not them"
 * holds against every later research run until the user chooses this. The
 * page is read once more from what was stored and held for review, as
 * research holds any page -- nothing reaches the record until the user says
 * it is them. Reading it is metered as one source read.
 */
export async function reconsiderSourceMatch(
  sourceId: string,
  personId: string,
): Promise<ResearchState> {
  const capability = await checkCapability('researchPerson', 'source_ingest')
  if (!capability.allowed) return refused(capability)

  const user = await requireUser()
  const { workspaceId } = await getWorkspace()
  const supabase = await createClient()
  const archived = await archivedRefusal(supabase, user.id, personId)
  if (archived) return archived

  const { data: link } = await supabase
    .from('source_person_links')
    .select('identity_match_status, reviewed_by_user, match_signals')
    .eq('source_id', sourceId)
    .eq('person_id', personId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!link || link.identity_match_status !== 'no_match' || !link.reviewed_by_user) {
    return { error: 'Only a page you marked as someone else can be reconsidered.' }
  }

  const decide = (patch: Database['public']['Tables']['source_person_links']['Update']) =>
    supabase
      .from('source_person_links')
      .update(patch)
      .eq('source_id', sourceId)
      .eq('person_id', personId)
      .eq('user_id', user.id)

  await decide({ identity_match_status: 'unreviewed', reviewed_by_user: false, match_signals: {} })

  let result: Awaited<ReturnType<typeof reholdForReview>> | null = null
  try {
    result = await reholdForReview(supabase, {
      workspaceId,
      userId: user.id,
      personId,
      sourceId,
    })
  } catch (error) {
    logger.error('research.reconsider_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
  }

  // Unless the page is now waiting for the user's check, their "not them"
  // stands exactly as it was, so no later research run can link it.
  if (!result?.held) {
    await decide({
      identity_match_status: 'no_match',
      reviewed_by_user: true,
      match_signals: link.match_signals,
    })
  }

  if (result?.usage) {
    await recordUsage({
      meter: 'source_ingest',
      subjectKind: 'source',
      subjectId: sourceId,
      provider: result.usage.provider,
      model: result.usage.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    })
  }
  await track('research_source_reconsidered', { held: Boolean(result?.held) })
  revalidatePath(`/people/${personId}`)

  if (result?.held) {
    return {
      ok: true,
      message:
        'Read again. Check it here: nothing from it is in their record until you say it is them.',
      sourcesHeld: 1,
      needsReview: true,
    }
  }
  return {
    ok: false,
    error: `${
      result
        ? (result.message ?? 'On reading it again, this page does not appear to be about them.')
        : 'That page could not be read again.'
    } It stays marked as someone else.`,
  }
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
  await removeProposedObservations(supabase, sourceId, user.id)

  await supabase.from('sources').delete().eq('id', sourceId).eq('user_id', user.id)

  revalidatePath(`/people/${personId}`)
  return { ok: true as const }
}

/**
 * Withdraw unconfirmed proposals that came from a source.
 *
 * Shared by rejection and deletion, because both mean "this page should not be
 * contributing to the record" and a proposal is a contribution. Only
 * `proposed` rows are touched: an observation the user accepted is theirs now.
 */
async function removeProposedObservations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceId: string,
  userId: string,
) {
  const { data: derived } = await supabase
    .from('observation_sources')
    .select('observation_id')
    .eq('source_id', sourceId)
    .eq('user_id', userId)

  const derivedIds = (derived ?? []).map((d) => d.observation_id)
  if (derivedIds.length === 0) return

  await supabase
    .from('observations')
    .delete()
    .in('id', derivedIds)
    .eq('user_id', userId)
    .eq('status', 'proposed')
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

const refineSchema = z.object({
  personId: z.string().uuid(),
  organizationName: z.string().trim().max(160).optional(),
  jobTitle: z.string().trim().max(120).optional(),
  profileUrl: z
    .union([z.string().trim().url('Enter a full web address, including https://'), z.literal('')])
    .optional(),
})

/**
 * IDENTITY RECOVERY: add one identifying detail, then research again.
 *
 * Reached from "I couldn't confidently identify this person". The thresholds
 * that refused the earlier sources are unchanged -- what changes is what the
 * search and the identity check have to go on: an employer, a title, or a page
 * the user vouches for. Only details actually entered are written; nothing on
 * record is cleared.
 *
 * A page the user has already marked as somebody else is refused outright,
 * because "not them" must never be undone by typing the link back in.
 */
export async function refineIdentityAndResearch(
  input: z.input<typeof refineSchema>,
): Promise<ResearchState> {
  const parsed = refineSchema.safeParse(input)
  if (!parsed.success) {
    return {
      error: z.flattenError(parsed.error).fieldErrors.profileUrl?.[0] ?? 'Check those details.',
    }
  }

  const { personId, organizationName, jobTitle, profileUrl } = parsed.data
  if (!organizationName && !jobTitle && !profileUrl) {
    return { error: 'Add a company, a role or a profile link first.' }
  }

  const user = await requireUser()
  const supabase = await createClient()
  const archived = await archivedRefusal(supabase, user.id, personId)
  if (archived) return archived

  if (profileUrl) {
    const { data: rejected } = await supabase
      .from('source_person_links')
      .select('sources(source_url)')
      .eq('user_id', user.id)
      .eq('person_id', personId)
      .eq('identity_match_status', 'no_match')
      .eq('reviewed_by_user', true)

    const target = canonicalUrl(profileUrl) ?? profileUrl
    const wasRejected = (rejected ?? []).some((row) => {
      const url = row.sources?.source_url
      return url ? (canonicalUrl(url) ?? url) === target : false
    })
    if (wasRejected) {
      return {
        error:
          'You marked that page as being about someone else, so it will not be used for this person. To use it, choose Reconsider on that page under Sources, or add a different link.',
      }
    }
  }

  const patch: Database['public']['Tables']['people']['Update'] = {}
  if (organizationName) patch.organization_id = await resolveOrganization(organizationName)
  if (jobTitle) patch.job_title = jobTitle
  if (profileUrl) patch.profile_url = profileUrl

  const { error } = await supabase
    .from('people')
    .update(patch)
    .eq('id', personId)
    .eq('user_id', user.id)

  if (error) {
    logger.warn('research.refine_identity_failed', { code: error.code })
    return { error: 'We could not save those details. Try again.' }
  }

  await track('person_identity_refined', {
    organization: Boolean(organizationName),
    jobTitle: Boolean(jobTitle),
    profileUrl: Boolean(profileUrl),
  })
  revalidatePath(`/people/${personId}`)
  return researchPerson(personId)
}
