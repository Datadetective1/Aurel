import 'server-only'
import { serverEnv } from '@/lib/env'
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
  limit?: number
}

export interface SearchProvider {
  readonly id: string
  readonly configured: boolean
  search(query: SearchQuery): Promise<
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
  resolvePerson(query: SearchQuery): Promise<
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
          body: JSON.stringify({ q: buildQueryString(query), num: Math.min(query.limit ?? 10, 20) }),
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

export function resolveSearchProvider(): SearchProvider {
  const provider = serverEnv.SEARCH_PROVIDER
  if (provider === 'brave' && serverEnv.BRAVE_SEARCH_API_KEY) {
    return braveSearch(serverEnv.BRAVE_SEARCH_API_KEY)
  }
  if (provider === 'serper' && serverEnv.SERPER_API_KEY) {
    return serperSearch(serverEnv.SERPER_API_KEY)
  }
  return unconfiguredSearch
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
    /** Can Aurel discover sources from just a name? */
    canDiscover: search.configured,
    /** Can Aurel analyse a URL the user provides? Always yes. */
    canAnalyseUrls: true,
    searchProvider: search.id,
    enrichmentProvider: enrichment.id,
    /** Shown in the UI when discovery is unavailable. */
    discoveryHint: search.configured
      ? null
      : `Automatic source discovery is not configured. Paste a link — a company bio, a talk, an article — and ${brand.name} will analyse it.`,
  } as const
}
