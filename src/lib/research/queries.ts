import type { SearchQuery, SearchResultItem } from './providers'
import { hostMatchesOrganization, matchName, matchOrganization } from './matching'

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

// =============================================================================
// RANKING CANDIDATES
// =============================================================================

/**
 * Sites never worth reading: people-search aggregators, social networks that
 * render nothing to a fetch, and LinkedIn, which may not be fetched under its
 * terms. A user may still add a LinkedIn URL as identity metadata.
 */
const DENY_HOSTS = [
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
  'linkedin.com',
]

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000

/** No more than this many pages from one site in the pages that get read. */
export const MAX_PER_HOST = 2

export interface RankedCandidate {
  url: string
  score: number
  /**
   * The search result itself suggests this is them: their name in its title,
   * snippet or address, or it is on their employer's site. Only these count
   * toward stopping the query ladder; a list of pages that never name them has
   * not settled anything.
   */
  likelyThem: boolean
}

export interface RankContext {
  /** Canonical URLs already decided, kept or waiting for this person. Never read again. */
  known?: ReadonlySet<string>
  /** Canonical URLs the identity check set aside before. Read again only if nothing better. */
  setAside?: ReadonlySet<string>
  /** Turns a URL into the key `known` and `setAside` hold. */
  canonical?: (url: string) => string
  /** For judging how old a dated page is. */
  now?: Date
}

/**
 * Order search results by how likely each is to be a useful page about THIS
 * person, before any of them is fetched.
 *
 * Every page read is a fetch and a model call, and only MAX_ANALYSED are read,
 * so the order is the budget. The earlier version looked only at the URL path:
 * a speaker page for someone else outranked a bio naming them, a re-run spent
 * its five reads on pages already decided, and five pages from one site could
 * crowd out everything else. This weighs what the result says about the person
 * (title, snippet, address, site), skips what is already known, prefers recent
 * dated pages, and spreads reads across sites.
 */
export function rankCandidates(
  results: SearchResultItem[],
  subject: PersonSubject,
  context: RankContext = {},
): RankedCandidate[] {
  const canonical = context.canonical ?? ((url: string) => url)
  const now = context.now ?? new Date()
  const domain = subject.domain?.toLowerCase().replace(/^www\./, '') ?? null

  const scored: (RankedCandidate & { order: number })[] = []
  results.forEach((result, order) => {
    let host = ''
    let path = ''
    try {
      const parsed = new URL(result.url)
      host = parsed.hostname.toLowerCase().replace(/^www\./, '')
      path = decodeURIComponent(parsed.pathname).toLowerCase()
    } catch {
      return
    }
    if (DENY_HOSTS.some((d) => host.includes(d))) return
    const key = canonical(result.url)
    if (context.known?.has(key)) return

    let score = 0

    // What kind of page, from its address.
    if (/\/(leadership|team|about|our-people|people|management|bio|staff|faculty)\b/.test(path)) {
      score += 5
    }
    if (/\/(speakers?|sessions?|agenda|conference|talks?|episodes?)\b/.test(path)) score += 4
    if (/\/(blog|news|press|insights|articles?|interviews?|posts?)\b/.test(path)) score += 3
    if (host.endsWith('.edu') || host.endsWith('.gov') || host.endsWith('.org')) score += 2
    if (host === 'github.com' || host === 'youtube.com') score += 2
    // Deep aggregator-style paths are usually low quality.
    if (path.split('/').length > 6) score -= 2

    // What the result says about the person.
    const slug = path.replace(/[-_/.]+/g, ' ')
    const nameInTitle = matchName(subject.name, result.title)
    const nameInSnippet = matchName(subject.name, result.snippet)
    const nameInSlug = matchName(subject.name, slug)
    if (nameInTitle) score += 6
    else if (nameInSlug) score += 4
    if (nameInSnippet) score += 2
    // A titled result that names neither them nor their page is a weak bet.
    if (result.title && !nameInTitle && !nameInSlug && !nameInSnippet) score -= 2

    const orgOnPage = matchOrganization(subject.organization, `${result.title}\n${result.snippet}`)
    if (orgOnPage === 'full') score += 3
    else if (orgOnPage === 'partial') score += 1

    const ownSite =
      (domain !== null && (host === domain || host.endsWith(`.${domain}`))) ||
      hostMatchesOrganization(host, subject.organization)
    if (ownSite) score += 4

    // A year in the address dates the page. Recent beats old for "what they
    // are working on now"; an old page is still read when nothing newer is.
    // Age in whole years from the middle of that year: a page's year is all
    // the address says, so nothing finer than a year is pretended here.
    const year = Number(path.match(/\/((?:19|20)\d{2})\//)?.[1] ?? NaN)
    if (Number.isFinite(year)) {
      const age = Math.round((now.getTime() - Date.UTC(year, 6, 1)) / YEAR_MS)
      if (age <= 2) score += 1
      else if (age >= 6) score -= 2
    }

    // The provider's own order is a tie-breaker, not a verdict.
    score += Math.max(0, 2 - result.rank * 0.25)

    if (context.setAside?.has(key)) score -= 6

    scored.push({
      url: result.url,
      score,
      likelyThem: Boolean(nameInTitle || nameInSnippet || nameInSlug || ownSite),
      order,
    })
  })

  scored.sort((a, b) => b.score - a.score || a.order - b.order)

  // Spread reads across sites: a third page from one site goes to the back.
  const perHost = new Map<string, number>()
  const first: RankedCandidate[] = []
  const overflow: RankedCandidate[] = []
  for (const { order: _order, ...candidate } of scored) {
    const host = new URL(candidate.url).hostname.replace(/^www\./, '')
    const count = perHost.get(host) ?? 0
    perHost.set(host, count + 1)
    ;(count < MAX_PER_HOST ? first : overflow).push(candidate)
  }
  return [...first, ...overflow]
}
