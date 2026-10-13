/**
 * Route handlers the native app calls with `Authorization: Bearer <access
 * token>` instead of a cookie. Only these may authenticate that way; see
 * `bearerToken()` in lib/supabase/server.
 *
 * The middleware marks those requests with a header whose VALUE is derived
 * from a server secret, and strips any copy arriving from outside. A client
 * cannot forge the mark -- not even on paths the middleware matcher skips
 * (static-looking URLs), where an incoming header would otherwise pass
 * through untouched -- because it does not know the value.
 */
export const BEARER_PATHS = ['/api/mobile/', '/api/conversations/transcribe', '/api/capture/']
export const BEARER_FLAG = 'x-atturel-bearer-route'

let flagValue: Promise<string> | null = null

/**
 * The mark's value: a hash of a secret both the middleware and the server
 * can read. Without one (a local checkout with no service key) it falls back
 * to a fixed string, which is forgeable -- acceptable only off production,
 * and every deployment that can serve real users has the service key.
 */
export function bearerFlagValue(): Promise<string> {
  flagValue ??= (async () => {
    const seed = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.CRON_SECRET ?? ''
    if (!seed) return 'unkeyed-local'
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`atturel-bearer-route:${seed}`),
    )
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  })()
  return flagValue
}

/** Synchronous so it can run inside the auth client's cookie callback; pass `await bearerFlagValue()`. */
export function forwardedHeaders(
  request: { headers: Headers; nextUrl: { pathname: string } },
  flag: string,
): Headers {
  const headers = new Headers(request.headers)
  headers.delete(BEARER_FLAG)
  if (BEARER_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))) {
    headers.set(BEARER_FLAG, flag)
  }
  return headers
}
