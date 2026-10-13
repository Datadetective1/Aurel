/**
 * Route handlers the native app calls with `Authorization: Bearer <access
 * token>` instead of a cookie. Only these may authenticate that way; see
 * `bearerToken()` in lib/supabase/server. The flag header is set by the
 * middleware and only there -- any copy arriving from outside is stripped
 * first, so a client cannot opt a page or a server action into bearer auth
 * by sending the header itself.
 */
export const BEARER_PATHS = ['/api/mobile/', '/api/conversations/transcribe']
export const BEARER_FLAG = 'x-atturel-bearer-route'

export function forwardedHeaders(request: {
  headers: Headers
  nextUrl: { pathname: string }
}): Headers {
  const headers = new Headers(request.headers)
  headers.delete(BEARER_FLAG)
  if (BEARER_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))) {
    headers.set(BEARER_FLAG, '1')
  }
  return headers
}
