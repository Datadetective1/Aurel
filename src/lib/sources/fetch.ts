import 'server-only'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { logger } from '@/lib/logger'
import { brand } from '@/lib/brand'
import { parseUrl } from './url'

// Re-exported so existing server callers keep a single import site.
export { parseUrl } from './url'

/**
 * SAFE OUTBOUND FETCH
 * =============================================================================
 * Ingesting a user-supplied URL turns this server into a confused deputy: it
 * will fetch whatever it is told, from inside our network, with our egress
 * privileges. Everything below exists to constrain that.
 *
 * Defences implemented here:
 *   - scheme allowlist (http/https only — no file:, gopher:, data:)
 *   - DNS resolution + private/reserved/link-local IP blocking, which covers
 *     cloud metadata endpoints (169.254.169.254) and internal services
 *   - manual redirect following, re-validating the host at EVERY hop, because a
 *     public hostname can redirect to 127.0.0.1
 *   - response size cap enforced while streaming, so a multi-gigabyte body
 *     cannot exhaust memory before Content-Length is checked
 *   - content-type allowlist
 *   - request timeout
 *   - no cookies, no credentials, no user session material of any kind
 *
 * This never executes page JavaScript. Extraction is done on raw markup.
 * =============================================================================
 */

const MAX_BYTES = 3 * 1024 * 1024 // 3 MB of markup is far more than any article
const TIMEOUT_MS = 12_000
const MAX_REDIRECTS = 4

const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'application/xhtml+xml',
  'text/plain',
  'application/json',
  'text/markdown',
  'application/pdf',
]

/** Presented to the site being fetched. Honest about what this is. */
const USER_AGENT =
  `${brand.slug}bot/1.0 (+${brand.domain}/bot; professional context research; respects robots.txt)`

export type FetchFailure =
  | 'invalid_url'
  | 'blocked_scheme'
  | 'blocked_host'
  | 'dns_failure'
  | 'too_many_redirects'
  | 'timeout'
  | 'http_error'
  | 'unsupported_content_type'
  | 'too_large'
  | 'network_error'

export interface FetchSuccess {
  ok: true
  finalUrl: string
  status: number
  contentType: string
  body: string
  bytes: number
  truncated: boolean
}

export interface FetchFailureResult {
  ok: false
  reason: FetchFailure
  status?: number
  detail?: string
}

export type SafeFetchResult = FetchSuccess | FetchFailureResult


/**
 * True for addresses that must never be reachable from a user-supplied URL:
 * loopback, private ranges, link-local (including the cloud metadata address),
 * CGNAT, and unspecified.
 */
export function isBlockedAddress(address: string): boolean {
  const version = isIP(address)

  if (version === 4) {
    const parts = address.split('.').map(Number)
    const [a, b] = parts as [number, number, number, number]
    if (parts.some((n) => Number.isNaN(n))) return true
    if (a === 0) return true // 0.0.0.0/8
    if (a === 10) return true // private
    if (a === 127) return true // loopback
    if (a === 169 && b === 254) return true // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true // private
    if (a === 192 && b === 168) return true // private
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    if (a === 192 && b === 0) return true // IETF protocol assignments
    if (a >= 224) return true // multicast + reserved
    return false
  }

  if (version === 6) {
    const normalised = address.toLowerCase().replace(/^\[|\]$/g, '')
    if (normalised === '::' || normalised === '::1') return true
    if (normalised.startsWith('fe80')) return true // link-local
    if (/^f[cd]/.test(normalised)) return true // unique local fc00::/7
    // IPv4-mapped IPv6 (::ffff:127.0.0.1) must be checked as IPv4.
    const mapped = normalised.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isBlockedAddress(mapped[1]!)
    return false
  }

  // Not a literal IP — caller resolves it first.
  return true
}

/** Resolve a hostname and reject if ANY resolved address is blocked. */
async function assertPublicHost(hostname: string): Promise<{ ok: true } | FetchFailureResult> {
  // A literal IP in the URL skips DNS entirely.
  if (isIP(hostname)) {
    return isBlockedAddress(hostname) ? { ok: false, reason: 'blocked_host' } : { ok: true }
  }

  // Reject obvious internal names before paying for DNS.
  const lower = hostname.toLowerCase()
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.internal')) {
    return { ok: false, reason: 'blocked_host' }
  }

  try {
    const results = await lookup(hostname, { all: true, verbatim: true })
    if (results.length === 0) return { ok: false, reason: 'dns_failure' }
    // ALL resolved addresses must be public: a DNS rebinding attack returns one
    // public and one private answer.
    for (const { address } of results) {
      if (isBlockedAddress(address)) return { ok: false, reason: 'blocked_host' }
    }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'dns_failure' }
  }
}

/**
 * Fetch a public URL safely. Follows redirects manually so each hop is
 * re-validated, and streams the body so the size cap is enforced as bytes
 * arrive rather than trusting Content-Length.
 */
export async function safeFetch(rawUrl: string): Promise<SafeFetchResult> {
  const parsed = parseUrl(rawUrl)
  if (!parsed) return { ok: false, reason: 'invalid_url' }

  let current = parsed
  let redirects = 0

  while (true) {
    const hostCheck = await assertPublicHost(current.hostname)
    if ('reason' in hostCheck) return hostCheck

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,text/plain,application/pdf;q=0.9,*/*;q=0.5',
          'accept-language': 'en',
        },
        // Never attach ambient credentials to an outbound research request.
        credentials: 'omit',
        cache: 'no-store',
      })
    } catch (error) {
      clearTimeout(timer)
      const aborted = error instanceof Error && error.name === 'AbortError'
      logger.warn('source.fetch_failed', { aborted })
      return { ok: false, reason: aborted ? 'timeout' : 'network_error' }
    }
    clearTimeout(timer)

    // Manual redirect handling: validate the next hop before following it.
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) return { ok: false, reason: 'http_error', status: response.status }
      if (redirects >= MAX_REDIRECTS) return { ok: false, reason: 'too_many_redirects' }

      let next: URL
      try {
        next = new URL(location, current)
      } catch {
        return { ok: false, reason: 'invalid_url' }
      }
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        return { ok: false, reason: 'blocked_scheme' }
      }
      current = next
      redirects++
      continue
    }

    if (!response.ok) {
      return { ok: false, reason: 'http_error', status: response.status }
    }

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
    const baseType = contentType.split(';')[0]?.trim() ?? ''
    if (!ALLOWED_CONTENT_TYPES.includes(baseType)) {
      return { ok: false, reason: 'unsupported_content_type', detail: baseType }
    }

    // Reject early when the server is honest about an oversized body.
    const declared = Number(response.headers.get('content-length') ?? '0')
    if (declared > MAX_BYTES) return { ok: false, reason: 'too_large' }

    const read = await readCapped(response, MAX_BYTES)
    if (!read) return { ok: false, reason: 'network_error' }

    return {
      ok: true,
      finalUrl: current.toString(),
      status: response.status,
      contentType: baseType,
      body: read.text,
      bytes: read.bytes,
      truncated: read.truncated,
    }
  }
}

/** Stream a response body, stopping once the cap is reached. */
async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; bytes: number; truncated: boolean } | null> {
  if (!response.body) {
    const text = await response.text().catch(() => null)
    if (text === null) return null
    return { text: text.slice(0, maxBytes), bytes: text.length, truncated: text.length > maxBytes }
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let truncated = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        chunks.push(value.slice(0, value.byteLength - (total - maxBytes)))
        truncated = true
        break
      }
      chunks.push(value)
    }
  } catch {
    return null
  } finally {
    await reader.cancel().catch(() => {})
  }

  const merged = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  return {
    text: new TextDecoder('utf-8', { fatal: false }).decode(merged),
    bytes: Math.min(total, maxBytes),
    truncated,
  }
}
