/**
 * The public/private split, in one place.
 *
 * robots.ts, sitemap.ts and the SEO tests all need the same answer to "may a
 * crawler have this?", and three copies of that list would drift. Keeping it
 * here means adding a route is one edit, and the test that walks the app
 * directory can hold both lists to account.
 */

/** Marketing pages that should be indexed, in sitemap order. */
export const PUBLIC_PATHS = ['/', '/pricing', '/privacy', '/terms'] as const

/**
 * Signed-in application roots. Disallowed in robots.txt, never in the sitemap.
 * Mirrors PRIVATE_PREFIXES in middleware.ts, which enforces the redirect.
 */
export const PRIVATE_PATHS = [
  '/today',
  '/people',
  '/meetings',
  '/prepare',
  '/coach',
  '/atlas',
  '/settings',
  '/onboarding',
  '/api',
  '/auth',
] as const

/**
 * Reachable, deliberately unindexed: authentication screens. These carry
 * robots: { index: false } in their own metadata, which is the directive that
 * actually counts. They are listed here only so the SEO test can assert they
 * never appear in the sitemap.
 */
export const NOINDEX_PATHS = [
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/check-email',
] as const
