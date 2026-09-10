import { hourIn, safeZone, todayIn, weekdayOf } from '@/lib/tz'

/**
 * WHEN TO SEND
 * =============================================================================
 * Pure decisions about the clock. The job that runs them is thin.
 *
 * Two schedules are supported, because the platform's plans differ:
 *
 *   hourly  the job runs every hour and sends to each user the first time
 *           their local hour reaches their preferred hour. A missed run is
 *           caught up by the next one, never doubled, because the ledger
 *           says whether today was served.
 *   daily   the job runs once a day and sends to everyone not yet served
 *           today. The preferred hour cannot be honoured and is not pretended
 *           to be.
 *
 * "Today" is always the user's own calendar day. Two users on either side of
 * the date line are served different days by the same run, correctly.
 * =============================================================================
 */

export type ScheduleMode = 'hourly' | 'daily'

export interface LocalClock {
  /** YYYY-MM-DD where the user is. */
  date: string
  /** 0-23 where the user is. */
  hour: number
  /** 0 = Sunday, where the user is. */
  weekday: number
  timeZone: string
}

/**
 * The user's own clock, from any zone string. An unrecognised or missing zone
 * falls back to UTC rather than throwing: a bad preference must not stop the
 * whole run for everyone after it.
 */
export function localClock(now: Date, timeZone: string | null | undefined): LocalClock {
  const zone = safeZone(timeZone)
  const date = todayIn(zone, now)
  return { date, hour: hourIn(zone, now), weekday: weekdayOf(date), timeZone: zone }
}

export interface SendDecision {
  send: boolean
  reason:
    | 'send'
    | 'no_email'
    | 'opted_out'
    | 'not_onboarded'
    | 'already_sent_today'
    | 'before_preferred_hour'
}

export function shouldSendNow(input: {
  mode: ScheduleMode
  clock: LocalClock
  preferredHour: number
  emailNotifications: boolean
  followThroughEmail: boolean
  onboarded: boolean
  hasEmail: boolean
  alreadySentToday: boolean
}): SendDecision {
  if (!input.hasEmail) return { send: false, reason: 'no_email' }
  if (!input.onboarded) return { send: false, reason: 'not_onboarded' }
  if (!input.emailNotifications || !input.followThroughEmail) {
    return { send: false, reason: 'opted_out' }
  }
  if (input.alreadySentToday) return { send: false, reason: 'already_sent_today' }
  if (input.mode === 'hourly' && input.clock.hour < clampHour(input.preferredHour)) {
    return { send: false, reason: 'before_preferred_hour' }
  }
  return { send: true, reason: 'send' }
}

export function clampHour(hour: number | null | undefined): number {
  if (hour === null || hour === undefined || !Number.isFinite(hour)) return 8
  return Math.min(23, Math.max(0, Math.round(hour)))
}

/**
 * Which mode a request is running in. The cron path may say so explicitly;
 * failing that, the schedule header Vercel sends tells us whether it fires
 * every hour or once a day.
 */
export function modeFor(input: { query: string | null; scheduleHeader: string | null }): ScheduleMode {
  if (input.query === 'hourly' || input.query === 'daily') return input.query
  if (input.scheduleHeader && /^\s*\S+\s+\*\s+\*\s+\*\s+\*\s*$/.test(input.scheduleHeader)) {
    // "0 * * * *": the hour field is a wildcard, so it fires every hour.
    return 'hourly'
  }
  return 'daily'
}

/** "8:00 AM" for the settings screen. */
export function hourLabel(hour: number): string {
  const h = clampHour(hour)
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve}:00 ${h < 12 ? 'AM' : 'PM'}`
}
