/**
 * Dates and times, reckoned where the user is -- the web's own formatters,
 * shared, so "Tomorrow" means the same day on both.
 */
export { formatDate, formatDayLabel, formatTime, relativeDay } from '@atturel/web/lib/format'

export function countdown(iso: string | null, now = new Date()): string | null {
  if (!iso) return null
  const minutes = Math.round((new Date(iso).getTime() - now.getTime()) / 60_000)
  if (Number.isNaN(minutes)) return null
  if (minutes <= -60) return 'Started earlier'
  if (minutes < 0) return `Started ${-minutes} min ago`
  if (minutes === 0) return 'Starting now'
  if (minutes < 60) return `In ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `In ${hours} ${hours === 1 ? 'hour' : 'hours'}`
  return null
}

export function firstName(name: string): string {
  return name.split(' ')[0] ?? name
}

/**
 * A moment as the wall-clock reading the web's meeting form sends,
 * "YYYY-MM-DDTHH:mm", in the account's zone. The server reads it back in
 * that same zone (wallTimeToInstant), so the instant chosen on the phone is
 * the instant stored, whatever zone the phone itself is in.
 */
export function wallTime(at: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

/**
 * The instant whose wall-clock reading in `tz` is `wall` ("YYYY-MM-DDTHH:mm").
 * Corrected by the whole difference, date included, so a zone far from UTC
 * does not land on the wrong day.
 */
export function atWallTime(wall: string, tz: string): Date {
  let at = new Date(`${wall}:00Z`)
  for (let i = 0; i < 3; i++) {
    const diff = Date.parse(`${wall}:00Z`) - Date.parse(`${wallTime(at, tz)}:00Z`)
    if (diff === 0) break
    at = new Date(at.getTime() + diff)
  }
  return at
}
