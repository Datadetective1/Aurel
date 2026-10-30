import { canonicalUrl } from '@/lib/sources/url'
import { explainMatch, type IdentitySubject } from './identity'
import { foldText, matchName } from './matching'

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

/** A page the app's research holds for review: what it would add waits on its link. */
export function isHeld(signals: unknown): boolean {
  return Boolean(
    signals && typeof signals === 'object' && !Array.isArray(signals) && 'held' in signals,
  )
}

/**
 * Whether a linked page may be given to Ask and briefs as a public source:
 * one that was actually read and is accepted as this person -- confirmed by
 * the user, or linked by research -- and never one held for review, still
 * waiting for a check, or marked as someone else.
 */
export function countsAsPublicSource(link: {
  accessStatus: string | null
  status: string | null
  signals: unknown
}): boolean {
  return (
    link.accessStatus === 'analyzed' &&
    (link.status === 'confirmed' || link.status === 'probable') &&
    !isHeld(link.signals)
  )
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
 * Page furniture that mentions everyone: skip links, tickers, share and
 * sign-in bars. A news site's menu and its "BREAKING" strip name whoever is
 * in the news, so a sentence from them is no evidence about this page.
 */
const CHROME = [
  /\bskip (?:to )?(?:the )?(?:main )?(?:content|navigation|nav)\b/i,
  /^(?:breaking(?: news)?|live|watch|listen|trending|related|read more|recommended|sponsored|advertisement|ad)\b\s*[:|\-–—]?/i,
  /\b(?:sign in|sign up|log in|subscribe now|newsletter|cookie|privacy policy|terms of (?:use|service)|all rights reserved)\b/i,
]

/** Words of a line, punctuation aside. */
function lineWords(line: string): string[] {
  return line.split(/\s+/).filter((word) => /[a-z]/i.test(word))
}

/** Furniture rather than writing: a menu, a ticker, a breadcrumb trail. */
function isChrome(line: string): boolean {
  if (CHROME.some((re) => re.test(line))) return true
  // Breadcrumbs and share bars run on separators.
  return (line.match(/[|•»›]/g) ?? []).length >= 2
}

/**
 * Written sentence rather than a run of menu labels. Menus are strings of
 * Capitalised Words; a sentence has small words between its names.
 */
function isProse(line: string): boolean {
  const words = lineWords(line)
  if (words.length < 5) return false
  const lower = words.filter((word) => /^[("“‘']?[a-z]/.test(word)).length
  return lower / words.length >= 0.3
}

/** The page's own headline, without the " | Site" or " - Site" after it. */
function headline(title: string | null | undefined): string | null {
  if (!title) return null
  const core = title.split(/\s+[|\-–—]\s+/)[0]?.trim()
  return core && core.length >= 8 ? foldText(core) : null
}

/**
 * The sentences of a page, block by block, in order. A block that opens with
 * the headline loses it first: a headline ending in "?" would otherwise split
 * off as a sentence and leave its tail glued to the article's first one.
 */
function sentencesOf(text: string, title: string | null): string[] {
  return text
    .split(/\n+/)
    .flatMap((raw) => {
      let block = raw.replace(/\s+/g, ' ').trim()
      if (title && foldText(block).startsWith(title)) block = afterHeadline(block, title)
      return block.split(/(?<=[.!?…])\s+(?=["“‘'(]?[A-Z0-9])/)
    })
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

/**
 * What follows the headline on a line that opens with it. Folding drops
 * apostrophes and accents, so the cut is found by folding, not by length.
 */
function afterHeadline(line: string, title: string): string {
  for (let end = 1; end <= line.length; end++) {
    if (foldText(line.slice(0, end)) === title) {
      return line.slice(end).replace(/^[\s:|\-–—.]+/, '')
    }
  }
  return line
}

function namesSurname(fullName: string, sentence: string): boolean {
  const parts = foldText(fullName)
    .split(/[^a-z0-9-]+/)
    .filter(Boolean)
  const surname = parts.length > 1 ? parts[parts.length - 1]! : null
  if (!surname || surname.length < 2) return false
  return new RegExp(
    `(?<![a-z0-9])${surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`,
  ).test(foldText(sentence))
}

/** A long sentence, cut at whole words around where the name is. */
function around(sentence: string, fullName: string, maxLength: number): string {
  if (sentence.length <= maxLength) return sentence
  const folded = foldText(sentence)
  const parts = foldText(fullName).split(/\s+/)
  const at = Math.max(0, folded.indexOf(parts[parts.length - 1] ?? ''))
  let start = Math.max(0, at - Math.floor(maxLength / 2))
  let end = Math.min(sentence.length, start + maxLength)
  start = Math.max(0, end - maxLength)
  // Whole words at both ends: a cut word reads like a typo.
  if (start > 0) {
    const space = sentence.indexOf(' ', start)
    if (space !== -1 && space < at) start = space + 1
  }
  if (end < sentence.length) {
    const space = sentence.lastIndexOf(' ', end)
    if (space > at) end = space
  }
  return `${start > 0 ? '…' : ''}${sentence.slice(start, end).trim()}${end < sentence.length ? '…' : ''}`
}

/**
 * Where the name appears on the page: the evidence a person can check for
 * themselves before saying it is them.
 *
 * The first sentence of the article's own writing that names them. Extracted
 * text opens with the headline and whatever menus and tickers the page
 * carried, and on a news site those name everyone in the news, so the
 * headline, page furniture and runs of menu labels are passed over. In order
 * of preference: a written sentence with the full name, one with the family
 * name, then a short line with the full name (a speaker list, a byline).
 * Null when the page offers none of these.
 */
export function nameExcerpt(
  text: string | null,
  fullName: string,
  options: { title?: string | null; maxLength?: number } = {},
): string | null {
  if (!text || !fullName.trim()) return null
  const maxLength = options.maxLength ?? 280
  const title = headline(options.title)
  const candidates = sentencesOf(text, title).filter((line) => !isChrome(line))

  const prose = candidates.filter(isProse)
  const pick =
    prose.find((line) => matchName(fullName, line)) ??
    prose.find((line) => namesSurname(fullName, line)) ??
    candidates.find((line) => lineWords(line).length <= 12 && matchName(fullName, line))
  return pick ? around(pick, fullName, maxLength) : null
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const DAY_MS = 24 * 60 * 60 * 1000
const MONTH = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?'

/** "Sep 03, 2026", "3 September 2026" or "2026-09-03" as a UTC midnight. */
function parseWrittenDate(text: string): number | null {
  const monthFirst = text.match(
    new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'i'),
  )
  const dayFirst = text.match(
    new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH},?\\s+(\\d{4})\\b`, 'i'),
  )
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  let parts: [number, number, number] | null = null
  if (monthFirst) {
    parts = [
      Number(monthFirst[3]),
      MONTHS.indexOf(monthFirst[1]!.toLowerCase()),
      Number(monthFirst[2]),
    ]
  } else if (dayFirst) {
    parts = [Number(dayFirst[3]), MONTHS.indexOf(dayFirst[2]!.toLowerCase()), Number(dayFirst[1])]
  } else if (iso) {
    parts = [Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])]
  }
  if (!parts) return null
  const [year, month, day] = parts
  if (month < 0 || month > 11 || day < 1 || year < 1990) return null
  const ms = Date.UTC(year, month, day)
  // 31 February is not a date, and Date.UTC would quietly roll it into March.
  return ms < Date.UTC(year, month + 1, 1) ? ms : null
}

/**
 * When the page says it was last updated, if it says so near the top.
 *
 * Publishers keep a guide's original date in the page's metadata and print
 * "Updated by ... | Sep 03, 2026" over the article, so the stored date can be
 * a year behind what the reader sees. Only the opening of the page is read,
 * where bylines are, and only a date after publication and not in the
 * future is taken: anywhere else "updated" is as likely to be about
 * something the article reports.
 */
export function updatedDate(
  text: string | null,
  publishedAt: string | null,
  now: Date = new Date(),
): string | null {
  if (!text) return null
  const head = text.slice(0, 2000)
  const published = publishedAt ? Date.parse(publishedAt) : Number.NaN
  for (const match of head.matchAll(/\b(?:last\s+)?updated\b([^\n]{0,80})/gi)) {
    const ms = parseWrittenDate(match[1] ?? '')
    if (ms === null) continue
    if (ms > now.getTime() + DAY_MS) continue
    if (!Number.isNaN(published) && ms < published - DAY_MS) continue
    if (!Number.isNaN(published) && ms <= published + DAY_MS) return null
    return new Date(ms).toISOString()
  }
  return null
}

/** Ways one document turns up twice: its address, or its headline on one site. */
function documentKeys(page: { url: string | null; title: string; host: string | null }): string[] {
  const keys: string[] = []
  if (page.url) keys.push(`url:${canonicalUrl(page.url) ?? page.url}`)
  const title = headline(page.title)
  if (page.host && title) keys.push(`title:${page.host}:${title}`)
  return keys
}

/**
 * One card per document. The same page reached twice, by a tracking link or
 * with and without a trailing slash, or a site's article under two
 * addresses, is shown once: the copy the user decided on, else the one in
 * the record, else the strongest match.
 */
export function dropDuplicatePages<
  T extends {
    url: string | null
    title: string
    host: string | null
    state: ReviewState
    reviewed: boolean
    confidence: number
  },
>(pages: T[]): T[] {
  const precedence = (page: T) =>
    page.reviewed && page.state !== 'waiting'
      ? 0
      : page.state === 'kept'
        ? 1
        : page.state === 'rejected'
          ? 2
          : 3
  const ranked = [...pages].sort(
    (a, b) => precedence(a) - precedence(b) || b.confidence - a.confidence,
  )
  const seen = new Set<string>()
  const keep = new Set<T>()
  for (const page of ranked) {
    const keys = documentKeys(page)
    if (keys.some((key) => seen.has(key))) continue
    keys.forEach((key) => seen.add(key))
    keep.add(page)
  }
  return pages.filter((page) => keep.has(page))
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
