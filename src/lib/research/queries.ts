import type { SearchQuery } from './providers'

/**
 * QUERY STRATEGY
 * =============================================================================
 * One broad search for a person's name is the wrong shape for this problem. It
 * returns whoever shares the name and ranks highest, which is exactly the
 * mistake identity resolution then has to undo.
 *
 * So discovery runs a small ladder of increasingly speculative queries, and
 * stops as soon as it has enough strong candidates. The anchored query — name
 * plus employer — is the one that usually answers it, and on most people it is
 * the only query that runs. Every rung after it costs another request.
 *
 * Pure and separate from the provider so the cost behaviour can be tested
 * without a network call. Nothing here knows what a search vendor is.
 * =============================================================================
 */

export interface PersonSubject {
  name: string
  organization?: string | null
  jobTitle?: string | null
  /** A company or email domain, when known. Narrows a search hard. */
  domain?: string | null
}

export interface PlannedQuery {
  /** Why this rung exists, for logs and the research job record. */
  stage: 'anchored' | 'role' | 'authored' | 'speaking' | 'name_only'
  query: SearchQuery
  /**
   * Candidates from this rung that must be found before discovery may stop.
   * A rung that cannot settle the question on its own asks for more.
   */
  sufficient: number
}

/**
 * The ladder, most specific first.
 *
 * Rungs whose inputs are missing are skipped rather than degraded: a "role"
 * query with no title is just a name search wearing a costume, and running it
 * would spend a request to re-ask the question the previous rung already asked.
 */
export function planQueries(subject: PersonSubject): PlannedQuery[] {
  const plan: PlannedQuery[] = []
  const { name, organization, jobTitle, domain } = subject

  if (organization) {
    plan.push({
      stage: 'anchored',
      // Name and employer together. The single highest-signal disambiguator
      // between two people who share a name, and usually the only rung needed.
      query: { name, organization, limit: 10 },
      sufficient: 3,
    })
  }

  if (domain) {
    plan.push({
      stage: 'anchored',
      // The company's own site. An official bio outranks anything written
      // about someone by a third party.
      query: { name, domain, limit: 5 },
      sufficient: 2,
    })
  }

  if (jobTitle) {
    plan.push({
      stage: 'role',
      query: { name, jobTitle, organization, limit: 8 },
      sufficient: 3,
    })
  }

  plan.push({
    stage: 'authored',
    // Material they wrote, which is first-party evidence of how they think
    // rather than someone else's description of them.
    query: { name, organization, qualifiers: ['interview OR article OR author'], limit: 8 },
    sufficient: 2,
  })

  plan.push({
    stage: 'speaking',
    query: { name, organization, qualifiers: ['conference talk OR keynote OR podcast'], limit: 8 },
    sufficient: 2,
  })

  // Last resort, and only when there was never an employer to anchor on.
  // Without one this is a name search, so it is the rung most likely to return
  // a different person entirely — identity resolution has to carry it.
  if (!organization && !domain) {
    plan.push({ stage: 'name_only', query: { name, limit: 10 }, sufficient: 1 })
  }

  return plan
}

/**
 * Should discovery stop after this rung?
 *
 * `strongCandidates` counts results that survived ranking, not raw hits — ten
 * aggregator pages are not evidence that the question is settled.
 */
export function hasEnough(
  planned: PlannedQuery,
  strongCandidates: number,
  totalStrongCandidates: number,
  maxCandidates: number,
): boolean {
  if (totalStrongCandidates >= maxCandidates) return true
  return strongCandidates >= planned.sufficient
}

/**
 * The upper bound on requests for one research run.
 *
 * A ceiling as well as a ladder: a person with an organisation, a domain and a
 * title generates five rungs, and a provider that returns nothing useful would
 * otherwise walk all of them every time. Kept here rather than in the caller so
 * the cost of a run is legible in one place.
 */
export const MAX_SEARCH_REQUESTS = 3

/** Candidate URLs to carry into the ingest pipeline. */
export const MAX_CANDIDATES = 8

/**
 * Pages actually fetched, identity-checked and sent to extraction.
 *
 * Lower than MAX_CANDIDATES on purpose. Each one is a network fetch and a model
 * call, and six good sources say more about someone than twenty weak ones —
 * with the weak ones actively costing accuracy, because a page that is not
 * really about them is what produces a confidently wrong brief.
 */
export const MAX_ANALYSED = 5
