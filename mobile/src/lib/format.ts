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
