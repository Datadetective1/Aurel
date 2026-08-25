/**
 * IDENTITY RESOLUTION
 * =============================================================================
 * The highest-stakes correctness problem in the product. If Aurel attributes
 * John Smith at Boeing's career to John Smith at Lockheed, every downstream
 * brief is confidently wrong about a real person.
 *
 * The design principle is that AMBIGUITY IS A VALID OUTCOME. This module will
 * happily return `ambiguous` and refuse to link. Guessing is never the safe
 * default here, so the thresholds below are deliberately conservative.
 *
 * Scoring is a transparent weighted sum over independent signals rather than a
 * model judgement, so a wrong link can always be explained and corrected.
 * =============================================================================
 */

export type IdentityMatchStatus =
  | 'confirmed'
  | 'probable'
  | 'ambiguous'
  | 'no_match'
  | 'conflicting'
  | 'unreviewed'

export interface IdentitySubject {
  fullName: string
  organization?: string | null
  jobTitle?: string | null
  email?: string | null
  profileUrl?: string | null
}

export interface IdentityEvidence {
  /** Title of the candidate source. */
  title?: string | null
  /** Extracted text from the candidate source. */
  text?: string | null
  /** URL of the candidate source. */
  url?: string | null
  /** Publisher/site name. */
  publisher?: string | null
}

export interface IdentityAssessment {
  status: IdentityMatchStatus
  /** 0..1. Only meaningful alongside `signals`. */
  confidence: number
  /** Which signals fired. Rendered in the UI as the reason. */
  signals: Record<string, boolean>
  /** Plain-language explanation shown to the user. */
  explanation: string
}

/**
 * Signal weights.
 *
 * A URL the user supplied themselves is near-decisive: they are asserting the
 * identity. An employer match on a company-owned domain is the next strongest,
 * because organisations rarely publish biographies of people who do not work
 * there. A name match alone is worth very little — that is the whole problem.
 */
const WEIGHTS = {
  userSuppliedUrl: 0.55,
  exactNameInTitle: 0.18,
  exactNameInText: 0.1,
  organizationMatch: 0.28,
  organizationDomainMatch: 0.22,
  jobTitleMatch: 0.14,
  emailDomainMatch: 0.2,
} as const

/** Above this a link is created automatically. */
const PROBABLE_THRESHOLD = 0.55
/** Above this the user is asked to choose rather than being told nothing. */
const AMBIGUOUS_THRESHOLD = 0.25

export function assessIdentity(
  subject: IdentitySubject,
  evidence: IdentityEvidence,
  options: { userSuppliedUrl?: boolean } = {},
): IdentityAssessment {
  const signals: Record<string, boolean> = {}
  let score = 0

  const haystack = `${evidence.title ?? ''}\n${evidence.text ?? ''}`.toLowerCase()
  const name = subject.fullName.trim().toLowerCase()

  if (options.userSuppliedUrl) {
    signals.userSuppliedUrl = true
    score += WEIGHTS.userSuppliedUrl
  }

  if (name) {
    const nameInTitle = (evidence.title ?? '').toLowerCase().includes(name)
    if (nameInTitle) {
      signals.exactNameInTitle = true
      score += WEIGHTS.exactNameInTitle
    }
    if (haystack.includes(name)) {
      signals.exactNameInText = true
      score += WEIGHTS.exactNameInText
    }
  }

  const org = subject.organization?.trim().toLowerCase()
  if (org && org.length > 2) {
    if (haystack.includes(org)) {
      signals.organizationMatch = true
      score += WEIGHTS.organizationMatch
    }
    // The source living on the employer's own domain is strong corroboration.
    const host = safeHost(evidence.url)
    const publisher = (evidence.publisher ?? '').toLowerCase()
    const orgToken = org.replace(/[^a-z0-9]/g, '')
    if (
      orgToken.length > 2 &&
      ((host && host.replace(/[^a-z0-9]/g, '').includes(orgToken)) || publisher.includes(org))
    ) {
      signals.organizationDomainMatch = true
      score += WEIGHTS.organizationDomainMatch
    }
  }

  const title = subject.jobTitle?.trim().toLowerCase()
  if (title && title.length > 2 && haystack.includes(title)) {
    signals.jobTitleMatch = true
    score += WEIGHTS.jobTitleMatch
  }

  const emailDomain = subject.email?.split('@')[1]?.toLowerCase()
  if (emailDomain && !isGenericEmailDomain(emailDomain)) {
    const host = safeHost(evidence.url)
    if (host && (host === emailDomain || host.endsWith(`.${emailDomain}`))) {
      signals.emailDomainMatch = true
      score += WEIGHTS.emailDomainMatch
    }
  }

  const confidence = Math.min(1, Math.round(score * 1000) / 1000)

  // A source that names the person but contradicts their employer is a likely
  // different individual with the same name — the exact failure to avoid.
  const contradictsOrganization =
    Boolean(org) && signals.exactNameInText === true && !signals.organizationMatch && hasCompetingEmployer(haystack, org!)

  if (contradictsOrganization && !options.userSuppliedUrl) {
    return {
      status: 'conflicting',
      confidence,
      signals,
      explanation: `This source mentions ${subject.fullName} but appears to describe someone at a different organisation.`,
    }
  }

  if (!signals.exactNameInTitle && !signals.exactNameInText && !options.userSuppliedUrl) {
    return {
      status: 'no_match',
      confidence,
      signals,
      explanation: `This source does not mention ${subject.fullName}.`,
    }
  }

  if (confidence >= PROBABLE_THRESHOLD) {
    return {
      status: 'probable',
      confidence,
      signals,
      explanation: explain(subject, signals),
    }
  }

  if (confidence >= AMBIGUOUS_THRESHOLD) {
    return {
      status: 'ambiguous',
      confidence,
      signals,
      explanation: `This might be ${subject.fullName}, but there is not enough to be sure. ${explain(subject, signals)}`,
    }
  }

  return {
    status: 'no_match',
    confidence,
    signals,
    explanation: `Not enough matching detail to associate this with ${subject.fullName}.`,
  }
}

/** Turn the fired signals into a sentence a user can evaluate. */
function explain(subject: IdentitySubject, signals: Record<string, boolean>): string {
  const reasons: string[] = []
  if (signals.userSuppliedUrl) reasons.push('you provided this link')
  if (signals.exactNameInTitle) reasons.push('their name is in the page title')
  else if (signals.exactNameInText) reasons.push('their name appears in the page')
  if (signals.organizationDomainMatch && subject.organization) {
    reasons.push(`it is published by ${subject.organization}`)
  } else if (signals.organizationMatch && subject.organization) {
    reasons.push(`it mentions ${subject.organization}`)
  }
  if (signals.jobTitleMatch && subject.jobTitle) reasons.push(`it mentions ${subject.jobTitle}`)
  if (signals.emailDomainMatch) reasons.push('it is on their email domain')

  if (reasons.length === 0) return 'No corroborating detail was found.'
  const last = reasons.pop()!
  return `Matched because ${reasons.length ? `${reasons.join(', ')} and ` : ''}${last}.`
}

/**
 * Heuristic: does the text name a DIFFERENT employer prominently?
 * Only used to downgrade, never to upgrade, so a false positive costs a missed
 * source rather than a wrong attribution.
 */
function hasCompetingEmployer(haystack: string, organization: string): boolean {
  const patterns = [
    /\b(?:vp|vice president|director|head|chief|senior|lead|manager|engineer)\s+(?:of\s+)?[a-z ]{2,30}\s+at\s+([a-z0-9&.\- ]{3,40})/gi,
    /\bat\s+([A-Z][A-Za-z0-9&.\-]{2,30}(?:\s+[A-Z][A-Za-z0-9&.\-]{2,30}){0,2})\b/g,
  ]
  for (const pattern of patterns) {
    for (const match of haystack.matchAll(pattern)) {
      const employer = match[1]?.trim().toLowerCase()
      if (!employer) continue
      if (employer.includes(organization) || organization.includes(employer)) return false
    }
  }
  // Only claim a conflict when some employer was named and none matched.
  return /\bat\s+[a-z]/i.test(haystack)
}

function safeHost(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

/** Free-mail domains carry no organisational signal. */
function isGenericEmailDomain(domain: string): boolean {
  return [
    'gmail.com',
    'googlemail.com',
    'outlook.com',
    'hotmail.com',
    'live.com',
    'yahoo.com',
    'icloud.com',
    'me.com',
    'proton.me',
    'protonmail.com',
    'aol.com',
    'gmx.com',
    'mail.com',
  ].includes(domain)
}

/** Should this assessment create a link automatically? */
export function shouldAutoLink(assessment: IdentityAssessment): boolean {
  return assessment.status === 'probable' || assessment.status === 'confirmed'
}

/** Should the user be asked to disambiguate? */
export function needsReview(assessment: IdentityAssessment): boolean {
  return assessment.status === 'ambiguous' || assessment.status === 'conflicting'
}
