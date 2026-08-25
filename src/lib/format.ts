/**
 * Date and text formatting.
 *
 * All date helpers accept an ISO string or Date and are safe against invalid
 * input — a malformed timestamp renders as a dash rather than "Invalid Date".
 */

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "Monday, 24 August" */
export function formatDayLabel(value: string | Date): string {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/** "09:30" */
export function formatTime(value: string | Date): string {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** "24 Aug 2026" */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * "Today" / "Tomorrow" / "3 days ago" / "In 2 weeks".
 * Uses Intl.RelativeTimeFormat so the phrasing localises.
 */
export function relativeDay(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'

  const startOfDay = (d: Date) => {
    const copy = new Date(d)
    copy.setHours(0, 0, 0, 0)
    return copy
  }

  const days = Math.round(
    (startOfDay(date).getTime() - startOfDay(new Date()).getTime()) / 86_400_000,
  )

  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (Math.abs(days) < 7) return capitalise(rtf.format(days, 'day'))
  if (Math.abs(days) < 31) return capitalise(rtf.format(Math.round(days / 7), 'week'))
  if (Math.abs(days) < 365) return capitalise(rtf.format(Math.round(days / 30), 'month'))
  return capitalise(rtf.format(Math.round(days / 365), 'year'))
}

/** Days elapsed since a timestamp, or null. */
export function daysSince(value: string | Date | null | undefined): number | null {
  const date = toDate(value)
  if (!date) return null
  return Math.floor((Date.now() - date.getTime()) / 86_400_000)
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
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
