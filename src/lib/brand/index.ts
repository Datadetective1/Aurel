/**
 * ATTUREL — CENTRAL BRAND REGISTRY
 * =============================================================================
 * Single source of truth for every user-visible brand string in the product:
 * app UI, marketing site, transactional email, PDF exports, metadata, legal.
 *
 * The product name is configuration, not a constant scattered through the code.
 * To rename, edit `name`, `slug`, `legalEntity`, `domain` and `email` below —
 * nothing else should need to change. A unit test
 * (tests/unit/brand-centralisation.test.ts) fails the build if the name is
 * hard-coded anywhere else.
 *
 * HISTORY: shipped internally as the codename "Aurel" before the name Atturel
 * was chosen. A few stable technical identifiers still carry the old spelling
 * (see the exemptions in that test); they are deliberately left alone because
 * renaming them buys nothing and risks breaking stored data.
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
  name: 'Atturel',
  /** Lowercase machine-safe slug (cookies, analytics prefixes, storage keys). */
  slug: 'atturel',
  /**
   * The operator: the person or company that provides the service and is the
   * other party to the Terms. Today an individual operating Atturel (owner,
   * 25 Oct 2026); a company has not been formed yet. Change it only once a
   * registration is actually complete.
   */
  legalEntity: 'Amary Biton Coulibaly',
  /** Primary marketing domain, display form (no protocol). */
  domain: 'atturel.com',

  /**
   * One-line positioning statement. Used in metadata and email preheaders.
   * The name reads AT-uh-rel: attune + relational.
   */
  tagline: 'Walk into every room prepared.',

  /**
   * The product category, in the words someone would actually search for.
   *
   * The tagline is the better sentence and the wrong title tag: "Walk into
   * every room prepared" is the only thing a search result used to say about
   * us, and it does not tell a stranger — or a crawler — what this software
   * is. The tagline still opens the page; this names the category above it.
   */
  descriptor: 'Professional relationship intelligence',

  /** Short description — meta description, OG, app store style blurbs. */
  description:
    'Atturel turns the people, relationship history and context around a meeting into practical guidance for the conversations that matter.',

  /** Longer description for structured data and the about surface. */
  longDescription:
    'Atturel is a professional relationship intelligence system. It records what you learn about the people you work with, keeps that memory honest by separating confirmed facts from inference, and turns it into preparation for your next important interaction.',

  /** What the product calls its own assessment instrument. */
  assessmentName: 'Interaction Profile',

  /** What the product calls its conversational assistant. */
  assistantName: 'Ask Atturel',

  email: {
    /** Sender for transactional mail. Domain must be verified in Resend. */
    fromName: 'Atturel',
    fromAddress: 'hello@atturel.com',
    /** Where replies land. */
    replyTo: 'support@atturel.com',
    /** Public support address shown in UI and legal pages. */
    support: 'support@atturel.com',
    /** Privacy / data-rights contact required by the privacy policy. */
    privacy: 'privacy@atturel.com',
  },

  legal: {
    /**
     * Governing law and venue for the Terms. Optional; while null the Terms
     * omit the line. Never guess it. (No postal address is published: none is
     * required for the current pages, and contact is by the email addresses
     * above -- see docs/LEGAL_REVIEW_REQUIRED.md, item 3.)
     */
    jurisdiction: null as string | null,
    /**
     * The day the current Terms and Privacy took effect: the day they were
     * published. Change it with any change to either page.
     */
    policiesEffective: '26 October 2026',
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
  return page ? `${page} · ${brand.name}` : `${brand.name} · ${brand.tagline}`
}

/**
 * Title tag for the homepage and social previews.
 *
 * Separate from title() on purpose: title() composes in-product page titles,
 * where the reader already knows what this is. A search result has no such
 * context, so the entry point leads with the category. Kept under 60
 * characters so Google shows it whole.
 */
export function seoTitle(): string {
  return `${brand.name} · ${brand.descriptor}`
}

export type Brand = typeof brand
