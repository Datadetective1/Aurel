/**
 * POST-AUTH DESTINATIONS
 * =============================================================================
 * Pure, so the middleware (which cannot import server-only modules) and the
 * server code share one rule.
 * =============================================================================
 */

/**
 * Sanitise a post-auth redirect target.
 *
 * Only same-origin, single-leading-slash paths are allowed. This blocks
 * `//evil.com` and `https://evil.com`, both of which browsers would otherwise
 * happily treat as absolute destinations. Whitespace and control characters are
 * refused too: the URL parser drops tabs and newlines, so `/<tab>/evil.com`
 * would become `//evil.com` once resolved.
 */
export function safeRedirectPath(next: string | null | undefined, fallback = '/today'): string {
  if (!next) return fallback
  if (!next.startsWith('/')) return fallback
  if (next.startsWith('//')) return fallback
  if (next.includes('\\')) return fallback
  if (/[\u0000-\u0020\u007f]/.test(next)) return fallback
  return next
}

/**
 * Where a signed-in visitor goes from the sign-in or sign-up screen: the safe
 * `next` they arrived with -- the pricing page's trial button asks for
 * Settings › Plan -- or Today. Never back to an auth screen, which would loop.
 */
export function signedInDestination(next: string | null | undefined): string {
  const target = safeRedirectPath(next, '/today')
  return /^\/(sign-in|sign-up)(?:[/?#]|$)/.test(target) ? '/today' : target
}
