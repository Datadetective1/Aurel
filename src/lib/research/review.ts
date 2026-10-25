import { explainMatch, type IdentitySubject } from './identity'

/**
 * REVIEWING WHAT RESEARCH FOUND
 * =============================================================================
 * Pure rules shared by the app's research screen: which state a page is in,
 * how strong its match looked, where the person's name appears on it, and why
 * it may be them -- in the identity check's own words, so the reason shown is
 * the reason the code had.
 * =============================================================================
 */

export type ReviewState = 'waiting' | 'kept' | 'rejected'

/** At or above this, the identity check would have linked the page by itself. */
export const STRONG_MATCH = 0.55

/** Pages that could actually be read; anything else was never about anyone. */
const READ = new Set(['analyzed', 'identity_uncertain'])

/**
 * Where a page stands for this person, or null when it is not worth showing:
 * unreadable, or set aside by the identity check without the user's say.
 */
export function reviewState(link: {
  status: string
  reviewed: boolean
  accessStatus: string | null
}): ReviewState | null {
  if (link.status === 'no_match') return link.reviewed ? 'rejected' : null
  if (!link.accessStatus || !READ.has(link.accessStatus)) return null
  if (link.status === 'confirmed' || link.status === 'probable') return 'kept'
  return 'waiting'
}

export function matchStrength(confidence: number | null): 'strong' | 'possible' {
  return (confidence ?? 0) >= STRONG_MATCH ? 'strong' : 'possible'
}

/** The signals that fired, without anything else kept beside them. */
function firedSignals(signals: unknown): Record<string, boolean> {
  if (!signals || typeof signals !== 'object' || Array.isArray(signals)) return {}
  return Object.fromEntries(
    Object.entries(signals).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
    ),
  )
}

/** Why it may be them, or what the user decided about it. */
export function reviewReason(
  subject: IdentitySubject,
  link: { state: ReviewState; reviewed: boolean; signals: unknown },
): string {
  if (link.state === 'rejected') return 'You said this is someone else.'
  if (link.state === 'kept' && link.reviewed) return 'You confirmed this is them.'
  const signals = firedSignals(link.signals)
  if (signals.userProvidedForPerson) return 'You added this link for them.'
  const why = explainMatch(subject, signals)
  return link.state === 'kept' ? `Linked by research: ${lowerFirst(why)}` : why
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

/**
 * Where the name appears on the page: the evidence a person can check for
 * themselves before saying it is them. The full name first, then the family
 * name; null when neither is there.
 */
export function nameExcerpt(text: string | null, fullName: string, radius = 140): string | null {
  if (!text) return null
  const flat = text.replace(/\s+/g, ' ')
  const lower = flat.toLowerCase()
  const parts = fullName.trim().split(/\s+/)
  const needles = [fullName.trim(), parts.length > 1 ? parts[parts.length - 1]! : null].filter(
    (n): n is string => Boolean(n && n.length >= 2),
  )
  for (const needle of needles) {
    const at = lower.indexOf(needle.toLowerCase())
    if (at < 0) continue
    let start = Math.max(0, at - radius)
    let end = Math.min(flat.length, at + needle.length + radius)
    // Whole words at both ends: a cut word reads like a typo.
    if (start > 0) {
      const space = flat.indexOf(' ', start)
      if (space !== -1 && space < at) start = space + 1
    }
    if (end < flat.length) {
      const space = flat.lastIndexOf(' ', end)
      if (space > at + needle.length) end = space
    }
    return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`
  }
  return null
}

export function hostOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** The label a fact is shown under, in the brief's own words. */
const FACT_LABEL: Record<string, string> = {
  current_role: 'Role',
  current_organization: 'Organisation',
  prior_role: 'Previously',
  education: 'Education',
  expertise: 'Works on',
  theme: 'Public theme',
  publication: 'Published',
  appearance: 'Public appearance',
  location: 'Based in',
  communication_signal: 'Publicly observed',
}

export function factLabel(kind: string): string {
  return FACT_LABEL[kind] ?? 'Other'
}
