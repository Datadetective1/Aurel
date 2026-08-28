/**
 * Date and text formatting.
 *
 * All date helpers accept an ISO string or Date and are safe against invalid
 * input — a malformed timestamp renders as a dash rather than "Invalid Date".
 *
 * ANYTHING THAT NAMES A CALENDAR DAY TAKES A TIME ZONE, and it is required
 * rather than defaulted. A default would be a silent wrong answer for everyone
 * outside it: these helpers used to read the ambient clock, which on the server
 * is UTC, so at 21:22 in Chicago the product announced tomorrow's date. Making
 * the parameter mandatory means the type checker, not a reviewer, is what finds
 * a call site that forgot. See lib/tz.
 */

import { formatDateIn, formatDayLabelIn, formatTimeIn, relativeDayIn } from './tz'

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "Thursday, August 27", where the account holder is. */
export function formatDayLabel(value: string | Date, timeZone: string): string {
  return formatDayLabelIn(value, timeZone)
}

/** "9:30 AM", where the account holder is. */
export function formatTime(value: string | Date, timeZone: string): string {
  return formatTimeIn(value, timeZone)
}

/**
 * "27 Aug 2026" — a date in the reader's own life.
 *
 * When a note was written, when a brief was prepared, when a conversation
 * happened. These belong to the user's calendar, so they are rendered in the
 * user's zone.
 */
export function formatDate(value: string | Date | null | undefined, timeZone: string): string {
  return formatDateIn(value, timeZone)
}

/**
 * "27 Aug 2026" — a date that belongs to a document, not to the reader.
 *
 * When an article was published, when a fact was true as of. These are
 * properties of an external source and do not move with whoever is reading
 * them, so UTC is correct and no zone is taken. Keeping the two apart is the
 * point: rendering a publication date in the reader's zone would silently
 * restate the publisher's claim.
 */
export function formatPublishedDate(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * "Today" / "Tomorrow" / "3 days ago" / "In 2 weeks", reckoned where the user is.
 *
 * `now` is threaded through rather than read inside, so a server render and the
 * hydration that follows agree on which day is today even across midnight.
 */
export function relativeDay(
  value: string | Date | null | undefined,
  timeZone: string,
  now?: Date,
): string {
  return relativeDayIn(value, timeZone, now)
}

/**
 * True when a timestamp is still ahead of now.
 *
 * Exists because a person header read "Last spoke tomorrow": a debrief had
 * dated a conversation from its meeting's scheduled_at, which can be in the
 * future. Both write paths refuse a future date now, but rows written before
 * they did still carry one, so anything phrased in the past tense has to check.
 */
export function isFuture(value: string | Date | null | undefined): boolean {
  const date = toDate(value)
  return date ? date.getTime() > Date.now() : false
}

/** Days elapsed since a timestamp, or null. */
export function daysSince(value: string | Date | null | undefined): number | null {
  const date = toDate(value)
  if (!date) return null
  return Math.floor((Date.now() - date.getTime()) / 86_400_000)
}


/** Truncate on a word boundary, appending an ellipsis. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** "3 people" / "1 person" */
export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}
