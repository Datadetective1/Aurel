/**
 * IDENTITY RESOLUTION
 * =============================================================================
 * The highest-stakes correctness problem in the product. If Atturel attributes
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

import {
  foldText,
  isGenericEmailDomain,
  hostMatchesOrganization,
  matchName,
  matchOrganization,
  namedEmployersNear,
  sameOrganization,
} from './matching'

export type IdentityMatchStatus =
  'confirmed' | 'probable' | 'ambiguous' | 'no_match' | 'conflicting' | 'unreviewed'

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
  /** Only the distinctive word of the employer's name, e.g. "Meridian". */
  organizationPartialMatch: 0.14,
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

  const haystack = `${evidence.title ?? ''}\n${evidence.text ?? ''}`
  const host = safeHost(evidence.url)

  if (options.userSuppliedUrl) {
    signals.userSuppliedUrl = true
    score += WEIGHTS.userSuppliedUrl
  }

  // Whole words, accents folded, middle names and "Last, First" allowed. A
  // substring check linked "Jordan Averyson" as Jordan Avery and missed
  // "Jordan P. Avery" entirely; see matching.ts.
  const inTitle = matchName(subject.fullName, evidence.title)
  const inText = inTitle ?? matchName(subject.fullName, haystack)
  if (inTitle) {
    signals.exactNameInTitle = true
    score += WEIGHTS.exactNameInTitle
  }
  if (inText) {
    signals.exactNameInText = true
    score += WEIGHTS.exactNameInText
  }
  if (inText === 'variant') signals.nameVariant = true

  const org = subject.organization?.trim()
  if (org && org.length > 2) {
    const mentioned = matchOrganization(org, haystack)
    if (mentioned === 'full') {
      signals.organizationMatch = true
      score += WEIGHTS.organizationMatch
    } else if (mentioned === 'partial') {
      signals.organizationPartialMatch = true
      score += WEIGHTS.organizationPartialMatch
    }
    // The source living on the employer's own domain is strong corroboration.
    if (
      hostMatchesOrganization(host, org) ||
      matchOrganization(org, evidence.publisher) === 'full'
    ) {
      signals.organizationDomainMatch = true
      score += WEIGHTS.organizationDomainMatch
    }
  }

  const title = subject.jobTitle?.trim()
  if (title && title.length > 2 && foldText(haystack).includes(foldText(title))) {
    signals.jobTitleMatch = true
    score += WEIGHTS.jobTitleMatch
  }

  const emailDomain = subject.email?.split('@')[1]?.toLowerCase()
  if (emailDomain && !isGenericEmailDomain(emailDomain)) {
    if (host && (host === emailDomain || host.endsWith(`.${emailDomain}`))) {
      signals.emailDomainMatch = true
      score += WEIGHTS.emailDomainMatch
    }
  }

  const confidence = Math.min(1, Math.round(score * 1000) / 1000)

  // A source that names the person but contradicts their employer is a likely
  // different individual with the same name — the exact failure to avoid.
  const contradictsOrganization =
    Boolean(org) &&
    signals.exactNameInText === true &&
    !signals.organizationMatch &&
    !signals.organizationPartialMatch &&
    !signals.organizationDomainMatch &&
    hasCompetingEmployer(subject.fullName, haystack, org!)

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
      explanation: explainMatch(subject, signals),
    }
  }

  if (confidence >= AMBIGUOUS_THRESHOLD) {
    return {
      status: 'ambiguous',
      confidence,
      signals,
      explanation: `This might be ${subject.fullName}, but there is not enough to be sure. ${explainMatch(subject, signals)}`,
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
export function explainMatch(subject: IdentitySubject, signals: Record<string, boolean>): string {
  const reasons: string[] = []
  if (signals.userSuppliedUrl) reasons.push('you provided this link')
  if (signals.exactNameInTitle) reasons.push('their name is in the page title')
  else if (signals.exactNameInText) {
    reasons.push(
      signals.nameVariant
        ? 'their name appears in the page with a middle name or surname first'
        : 'their name appears in the page',
    )
  }
  if (signals.organizationDomainMatch && subject.organization) {
    reasons.push(`it is published by ${subject.organization}`)
  } else if (signals.organizationMatch && subject.organization) {
    reasons.push(`it mentions ${subject.organization}`)
  } else if (signals.organizationPartialMatch && subject.organization) {
    reasons.push(`it mentions part of the name ${subject.organization}`)
  }
  if (signals.jobTitleMatch && subject.jobTitle) reasons.push(`it mentions ${subject.jobTitle}`)
  if (signals.emailDomainMatch) reasons.push('it is on their email domain')

  if (reasons.length === 0) return 'No corroborating detail was found.'
  const last = reasons.pop()!
  return `Matched because ${reasons.length ? `${reasons.join(', ')} and ` : ''}${last}.`
}

/**
 * Does the text name a DIFFERENT employer for them?
 *
 * Only a role followed by "at <Company>" near their name counts, and only when
 * no employer named there is theirs. The earlier test -- any "at" followed by a
 * letter anywhere on the page -- called "spoke at the summit" a different
 * employer. Only used to downgrade, never to upgrade, so a false positive costs
 * a missed source rather than a wrong attribution.
 */
function hasCompetingEmployer(fullName: string, haystack: string, organization: string): boolean {
  const named = namedEmployersNear(fullName, haystack)
  if (named.length === 0) return false
  return !named.some((employer) => sameOrganization(employer, organization))
}

function safeHost(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

/** Should this assessment create a link automatically? */
export function shouldAutoLink(assessment: IdentityAssessment): boolean {
  return assessment.status === 'probable' || assessment.status === 'confirmed'
}

/** Should the user be asked to disambiguate? */
export function needsReview(assessment: IdentityAssessment): boolean {
  return assessment.status === 'ambiguous' || assessment.status === 'conflicting'
}
