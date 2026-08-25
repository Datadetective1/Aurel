/**
 * AUREL — CENTRAL BRAND REGISTRY
 * =============================================================================
 * Single source of truth for every user-visible brand string in the product:
 * app UI, marketing site, transactional email, PDF exports, metadata, legal.
 *
 * "Aurel" is a WORKING CODENAME. To rename the product, edit `name`,
 * `legalEntity`, `domain` and `email` below — nothing else should need to change.
 *
 * RULE: never hard-code the product name, a URL, a support address or a sender
 * name anywhere else in the codebase. Import from here.
 * =============================================================================
 */

const rawSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000')

/** Absolute site origin, never with a trailing slash. */
export const siteUrl = rawSiteUrl.replace(/\/+$/, '')

/** Build an absolute URL from a site-relative path. */
export function absoluteUrl(path = '/'): string {
  return `${siteUrl}${path.startsWith('/') ? path : `/${path}`}`
}

export const brand = {
  /** Product name as shown to users. */
  name: 'Aurel',
  /** Lowercase machine-safe slug (cookies, analytics prefixes, storage keys). */
  slug: 'aurel',
  /** Registered company name used in legal copy and email footers. */
  legalEntity: 'Aurel Labs',
  /** Primary marketing domain, display form (no protocol). */
  domain: 'aurel.app',

  /** One-line positioning statement. Used in metadata + email preheaders. */
  tagline: 'Walk into every room prepared.',

  /** Short description — meta description, OG, app store style blurbs. */
  description:
    'Aurel turns the people, relationship history and context around a meeting into practical guidance for the conversations that matter.',

  /** Longer description for structured data and the about surface. */
  longDescription:
    'Aurel is a professional relationship intelligence system. It records what you learn about the people you work with, keeps that memory honest by separating confirmed facts from inference, and turns it into preparation for your next important interaction.',

  /** What the product calls its own assessment instrument. */
  assessmentName: 'Interaction Profile',

  /** What the product calls its conversational assistant. */
  assistantName: 'Ask Aurel',

  email: {
    /** Sender for transactional mail. Domain must be verified in Resend. */
    fromName: 'Aurel',
    fromAddress: 'hello@aurel.app',
    /** Where replies land. */
    replyTo: 'support@aurel.app',
    /** Public support address shown in UI and legal pages. */
    support: 'support@aurel.app',
    /** Privacy / data-rights contact required by the privacy policy. */
    privacy: 'privacy@aurel.app',
  },

  legal: {
    /** Placeholder — replace once the entity and jurisdiction are settled. */
    entityAddress: '[Registered address — pending]',
    jurisdiction: '[Governing jurisdiction — pending]',
    /** Year the policies were last reviewed by a human. */
    policiesLastUpdated: '2026-08-24',
    /** Set true only after a lawyer has reviewed Terms + Privacy. */
    policiesLegallyReviewed: false,
  },

  social: {
    /** Left empty until the accounts exist; UI hides empty entries. */
    x: '',
    linkedin: '',
  },
} as const

/** Formatted RFC 5322 sender string for the email transport. */
export const emailFrom = `${brand.email.fromName} <${brand.email.fromAddress}>`

/** Canonical page-title builder. `title()` → bare brand name. */
export function title(page?: string): string {
  return page ? `${page} · ${brand.name}` : `${brand.name} — ${brand.tagline}`
}

export type Brand = typeof brand
