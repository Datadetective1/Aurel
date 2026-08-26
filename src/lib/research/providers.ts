import 'server-only'
import { searchProvider, serverEnv } from '@/lib/env'
import { logger } from '@/lib/logger'
import { safeFetch } from '@/lib/sources/fetch'
import { brand } from '@/lib/brand'

/**
 * RESEARCH PROVIDER ABSTRACTION
 * =============================================================================
 * Two distinct capabilities, deliberately separated because they have very
 * different dependencies:
 *
 *   SearchProvider     name -> candidate URLs.   Requires a paid API key.
 *   EnrichmentProvider name -> structured person data. Requires a licensed vendor.
 *
 * Fetching and extracting a URL requires NEITHER. That means "paste a link and
 * research this person" works with zero credentials configured, which is the
 * majority of the value. Only *discovery* is gated.
 *
 * Providers are resolved at call time from env, so adding a vendor later is a
 * new file plus a case in `resolveSearchProvider` — no caller changes.
 * =============================================================================
 */

export interface SearchResultItem {
  url: string
  title: string
  snippet: string
  /** Provider-reported rank, lower is better. */
  rank: number
}

export interface SearchQuery {
  name: string
  organization?: string | null
  jobTitle?: string | null
  /** Extra terms, e.g. "conference talk", "interview". */
  qualifiers?: string[]
  /** Company or email domain. Restricts results to that site where supported. */
  domain?: string | null
  limit?: number
}

export interface SearchProvider {
  readonly id: string
  readonly configured: boolean
  search(
    query: SearchQuery,
  ): Promise<
    | { ok: true; results: SearchResultItem[]; costUnits: number }
    | { ok: false; reason: 'not_configured' | 'rate_limited' | 'error'; detail?: string }
  >
}

export interface EnrichmentCandidate {
  fullName: string
  jobTitle: string | null
  organization: string | null
  profileUrl: string | null
  summary: string | null
  confidence: number
}

export interface EnrichmentProvider {
  readonly id: string
  readonly configured: boolean
  resolvePerson(
    query: SearchQuery,
  ): Promise<
    | { ok: true; candidates: EnrichmentCandidate[]; costUnits: number }
    | { ok: false; reason: 'not_configured' | 'no_match' | 'error'; detail?: string }
  >
}

// =============================================================================
// SEARCH PROVIDERS
// =============================================================================

/**
 * Used when no search key is configured. Reports honestly rather than
 * pretending to search — the UI turns this into "paste a link instead", which
 * is a real path to value rather than a dead end.
 */
const unconfiguredSearch: SearchProvider = {
  id: 'none',
  configured: false,
  async search() {
    return { ok: false, reason: 'not_configured' }
  },
}

/**
 * Brave Search API. Chosen as the reference implementation because it has a
 * documented independent index and a usable free tier, but nothing above this
 * line depends on that choice.
 */
function braveSearch(apiKey: string): SearchProvider {
  return {
    id: 'brave',
    configured: true,
    async search(query) {
      const terms = buildQueryString(query)
      const url = new URL('https://api.search.brave.com/res/v1/web/search')
      url.searchParams.set('q', terms)
      url.searchParams.set('count', String(Math.min(query.limit ?? 10, 20)))
      url.searchParams.set('safesearch', 'moderate')

      try {
        const response = await fetch(url, {
          headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
          signal: AbortSignal.timeout(10_000),
        })

        if (response.status === 429) return { ok: false, reason: 'rate_limited' }
        if (!response.ok) return { ok: false, reason: 'error', detail: String(response.status) }

        const payload = (await response.json()) as {
          web?: { results?: { url: string; title: string; description?: string }[] }
        }

        const results = (payload.web?.results ?? []).map((item, index) => ({
          url: item.url,
          title: item.title,
          snippet: item.description ?? '',
          rank: index,
        }))

        return { ok: true, results, costUnits: 1 }
      } catch (error) {
        logger.warn('research.search_failed', {
          provider: 'brave',
          error: error instanceof Error ? error.name : 'unknown',
        })
        return { ok: false, reason: 'error' }
      }
    },
  }
}

/**
 * Exa.
 *
 * The preferred provider. Its index is embeddings-based, so a query like
 * `"Jordan Avery" "Meridian Systems"` retrieves pages that are *about* that
 * person at that company rather than pages containing those tokens — which is
 * the difference that matters when the input is a name two thousand people
 * share.
 *
 * Three deliberate choices about cost, in a feature that bills per request:
 *
 *   - `type: 'auto'`, never 'deep'. Deep search runs additional queries server
 *     side and costs a multiple. Discovery here is one cheap request per rung,
 *     and the ladder in queries.ts stops early — see MAX_SEARCH_REQUESTS.
 *   - No `contents`. Asking Exa for page text costs more AND would bypass our
 *     own fetch, which is the thing enforcing SSRF protection, size limits,
 *     paywall detection and the identity check. Discovery returns URLs; the
 *     existing pipeline reads them. A snippet must never become a fact.
 *   - `excludeDomains` for the aggregator sites we would discard anyway, so we
 *     are not paying for results destined for the deny list.
 */
function exaSearch(apiKey: string): SearchProvider {
  return {
    id: 'exa',
    configured: true,
    async search(query) {
      try {
        const response = await fetch('https://api.exa.ai/search', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: buildQueryString(query),
            type: 'auto',
            numResults: Math.min(query.limit ?? 10, 25),
            ...(query.domain ? { includeDomains: [normaliseDomain(query.domain)] } : {}),
            excludeDomains: EXCLUDED_DOMAINS,
          }),
          signal: AbortSignal.timeout(15_000),
        })

        if (response.status === 429) return { ok: false, reason: 'rate_limited' }
        if (response.status === 401 || response.status === 403) {
          // A rejected key is not a transient error, and reporting it as one
          // would have the UI suggest retrying forever.
          logger.warn('research.search_unauthorised', { provider: 'exa' })
          return { ok: false, reason: 'not_configured', detail: String(response.status) }
        }
        if (!response.ok) return { ok: false, reason: 'error', detail: String(response.status) }

        const payload = (await response.json()) as {
          results?: { url?: string; title?: string | null; text?: string | null }[]
        }

        const results = (payload.results ?? [])
          .filter((item): item is { url: string; title?: string | null } => Boolean(item.url))
          .map((item, index) => ({
            url: item.url,
            title: item.title ?? '',
            // Exa returns no snippet unless contents are requested, and we do
            // not request them. Ranking uses the URL and title; the page itself
            // is read later by the pipeline that can do it safely.
            snippet: '',
            rank: index,
          }))

        return { ok: true, results, costUnits: 1 }
      } catch (error) {
        logger.warn('research.search_failed', {
          provider: 'exa',
          error: error instanceof Error ? error.name : 'unknown',
        })
        return { ok: false, reason: 'error' }
      }
    },
  }
}

/**
 * Sites whose results are never usable, sent to the provider so we do not pay
 * for them. This mirrors the deny list applied during ranking rather than
 * replacing it — a provider that ignores the parameter must still be filtered.
 */
const EXCLUDED_DOMAINS = [
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'pinterest.com',
  'zoominfo.com',
  'rocketreach.co',
  'signalhire.com',
  'apollo.io',
  'lusha.com',
  'spokeo.com',
  'whitepages.com',
  'beenverified.com',
  // Fetching LinkedIn programmatically is against their terms. A user-supplied
  // LinkedIn URL is still useful as identity metadata; discovering one is not.
  'linkedin.com',
]

/** `https://acme.com/careers` or `someone@acme.com` -> `acme.com`. */
function normaliseDomain(value: string): string {
  const trimmed = value.trim().toLowerCase()
  const afterAt = trimmed.includes('@') ? (trimmed.split('@').pop() ?? trimmed) : trimmed
  try {
    return new URL(afterAt.includes('://') ? afterAt : `https://${afterAt}`).hostname.replace(
      /^www\./,
      '',
    )
  } catch {
    return afterAt.replace(/^www\./, '').split('/')[0] ?? afterAt
  }
}

/**
 * Deterministic provider for automated tests.
 *
 * Returns fixed candidate URLs derived from the query, so the discovery →
 * ingest → fact pipeline can be exercised without a paid key and without a
 * network call whose results change week to week.
 *
 * Refuses to run outside development. A "search provider" that invents results
 * would be a lie in production, and the whole point of this product is that its
 * evidence is real. Enabled with SEARCH_PROVIDER=mock.
 */
function mockSearch(): SearchProvider {
  if (process.env.NODE_ENV === 'production') {
    logger.warn('research.mock_provider_refused_in_production')
    return unconfiguredSearch
  }

  return {
    id: 'mock',
    configured: true,
    async search(query) {
      const slug = query.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      const org = (query.organization ?? 'example').toLowerCase().replace(/[^a-z0-9]+/g, '')
      return {
        ok: true,
        costUnits: 0,
        results: [
          {
            url: `https://${org}.example.com/team/${slug}`,
            title: `${query.name} — ${query.organization ?? 'Team'}`,
            snippet: `${query.name}${query.jobTitle ? `, ${query.jobTitle}` : ''}.`,
            rank: 0,
          },
          {
            url: `https://conference.example.com/speakers/${slug}`,
            title: `${query.name} · Speaker`,
            snippet: `Conference profile for ${query.name}.`,
            rank: 1,
          },
        ],
      }
    },
  }
}

/** Serper (Google SERP proxy). Second implementation, proving the seam works. */
function serperSearch(apiKey: string): SearchProvider {
  return {
    id: 'serper',
    configured: true,
    async search(query) {
      try {
        const response = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            q: buildQueryString(query),
            num: Math.min(query.limit ?? 10, 20),
          }),
          signal: AbortSignal.timeout(10_000),
        })

        if (response.status === 429) return { ok: false, reason: 'rate_limited' }
        if (!response.ok) return { ok: false, reason: 'error', detail: String(response.status) }

        const payload = (await response.json()) as {
          organic?: { link: string; title: string; snippet?: string }[]
        }

        const results = (payload.organic ?? []).map((item, index) => ({
          url: item.link,
          title: item.title,
          snippet: item.snippet ?? '',
          rank: index,
        }))

        return { ok: true, results, costUnits: 1 }
      } catch (error) {
        logger.warn('research.search_failed', {
          provider: 'serper',
          error: error instanceof Error ? error.name : 'unknown',
        })
        return { ok: false, reason: 'error' }
      }
    },
  }
}

/**
 * Build the query string.
 *
 * Quoting the name keeps results anchored to the person rather than to two
 * common words, and adding the employer is the single highest-signal
 * disambiguator between people who share a name.
 */
function buildQueryString(query: SearchQuery): string {
  const parts = [`"${query.name.replace(/"/g, '')}"`]
  if (query.organization) parts.push(`"${query.organization.replace(/"/g, '')}"`)
  if (query.jobTitle) parts.push(query.jobTitle)
  if (query.qualifiers?.length) parts.push(...query.qualifiers)
  return parts.join(' ')
}

/**
 * The active provider.
 *
 * Which one is active is decided in env.ts by `searchProvider`, so the key that
 * is present is the provider that runs. This function only builds it.
 */
export function resolveSearchProvider(): SearchProvider {
  switch (searchProvider) {
    case 'exa':
      return serverEnv.EXA_API_KEY ? exaSearch(serverEnv.EXA_API_KEY) : unconfiguredSearch
    case 'brave':
      return serverEnv.BRAVE_SEARCH_API_KEY
        ? braveSearch(serverEnv.BRAVE_SEARCH_API_KEY)
        : unconfiguredSearch
    case 'serper':
      return serverEnv.SERPER_API_KEY
        ? serperSearch(serverEnv.SERPER_API_KEY)
        : unconfiguredSearch
    case 'mock':
      return mockSearch()
    default:
      return unconfiguredSearch
  }
}

// =============================================================================
// ENRICHMENT
// =============================================================================

/**
 * No licensed enrichment vendor is configured. The interface exists so a vendor
 * can be added without touching the research agent; implementing an
 * unauthorised scraper here would be exactly the thing the product must not do.
 */
const unconfiguredEnrichment: EnrichmentProvider = {
  id: 'none',
  configured: false,
  async resolvePerson() {
    return { ok: false, reason: 'not_configured' }
  },
}

export function resolveEnrichmentProvider(): EnrichmentProvider {
  return unconfiguredEnrichment
}

// =============================================================================
// FETCH PROVIDER — always available, no credentials required
// =============================================================================

export interface FetchProvider {
  readonly id: string
  readonly configured: true
  fetchUrl: typeof safeFetch
}

/** The default fetcher. Always configured; this is why URL research always works. */
export function resolveFetchProvider(): FetchProvider {
  return { id: 'safe-fetch', configured: true, fetchUrl: safeFetch }
}

/** What the UI needs to explain the current research capability honestly. */
export function researchCapability() {
  const search = resolveSearchProvider()
  const enrichment = resolveEnrichmentProvider()
  return {
    /** Can Atturel discover sources from just a name? */
    canDiscover: search.configured,
    /** Can Atturel analyse a URL the user provides? Always yes. */
    canAnalyseUrls: true,
    searchProvider: search.id,
    enrichmentProvider: enrichment.id,
    /** Shown in the UI when discovery is unavailable. */
    discoveryHint: search.configured
      ? null
      : `Automatic source discovery is not configured. Paste a link — a company bio, a talk, an article — and ${brand.name} will analyse it.`,
  } as const
}
