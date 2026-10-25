/**
 * CALENDAR FRESHNESS
 * =============================================================================
 * How current a calendar connection is, and what it offers, in the same words
 * on the website and on the iPhone (audit finding 8.6).
 *
 * Atturel syncs a calendar only when somebody presses Sync now, plus once when
 * it is connected. Nothing syncs in the background. So "Connected" says
 * nothing about whether the meetings are current, and a connection that last
 * synced two months earlier read as healthy, with a time and no date. Every
 * saved connection now shows the date and time it last synced, in the
 * account's time zone, and says plainly when that is more than a day ago.
 *
 * Only a grant the provider refused needs reconnecting. A provider that was
 * busy or unreachable is `error`, and offers Try again.
 *
 * Dependency-free apart from the brand registry, so the iPhone app can share
 * it.
 * =============================================================================
 */

import { brand } from '../brand'

/** Past this, the meetings Atturel holds are flagged as possibly out of date. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000

export type CalendarState =
  | 'connected'
  | 'not_connected'
  | 'expired'
  | 'revoked'
  | 'admin_consent_required'
  | 'error'
  | 'unavailable'
  | 'plan_required'

export type CalendarTone = 'positive' | 'caution' | 'outline' | 'neutral'

/** What a connection's state is called, and the one sentence it needs. */
export const CALENDAR_STATE: Record<
  CalendarState,
  { label: string; tone: CalendarTone; detail: string }
> = {
  connected: { label: 'Connected', tone: 'positive', detail: '' },
  not_connected: {
    label: 'Not connected',
    tone: 'outline',
    detail: 'Read-only access to your upcoming meetings. Nothing is ever written back.',
  },
  expired: {
    label: 'Reconnect needed',
    tone: 'caution',
    detail:
      'Your calendar no longer accepts this connection. Reconnect to keep meetings up to date.',
  },
  revoked: {
    label: 'Reconnect needed',
    tone: 'caution',
    detail: 'Access was withdrawn in your calendar account. Reconnect to resume.',
  },
  admin_consent_required: {
    label: 'Needs approval',
    tone: 'caution',
    detail:
      'Your organization requires administrator approval before this app can read calendars. Ask your IT administrator to approve it, then reconnect.',
  },
  error: {
    label: 'Sync failed',
    tone: 'caution',
    detail:
      'The last sync did not complete because the calendar could not be reached. Try again shortly. There is no need to reconnect.',
  },
  unavailable: {
    label: 'Unavailable',
    tone: 'outline',
    detail: 'Not available yet.',
  },
  plan_required: {
    label: 'Pro',
    tone: 'outline',
    detail: `Connecting a calendar is part of Pro. Upgrade to bring your meetings into ${brand.name}.`,
  },
}

const STORED: ReadonlySet<string> = new Set([
  'connected',
  'expired',
  'revoked',
  'admin_consent_required',
  'error',
])

/**
 * The state a saved connection is shown in. The plan and the deployment come
 * first: a connection the plan no longer includes cannot sync, whatever its
 * row says. A status this code does not know reads as a failed sync, never as
 * connected.
 */
export function calendarState(input: {
  stored: string | null
  configured: boolean
  planAllows: boolean
}): CalendarState {
  if (!input.configured) return 'unavailable'
  if (!input.planAllows) return 'plan_required'
  if (input.stored === null) return 'not_connected'
  return STORED.has(input.stored) ? (input.stored as CalendarState) : 'error'
}

export interface CalendarActions {
  /** The sync button's words, or null when syncing is not offered. */
  sync: 'Sync now' | 'Try again' | null
  /** The grant has to be given again, which is done on the website. */
  reconnect: boolean
  /** Every saved connection can be disconnected, whatever its state. */
  disconnect: boolean
}

export function calendarActions(state: CalendarState, saved: boolean): CalendarActions {
  if (!saved) return { sync: null, reconnect: false, disconnect: false }
  return {
    sync: state === 'connected' ? 'Sync now' : state === 'error' ? 'Try again' : null,
    reconnect: state === 'expired' || state === 'revoked' || state === 'admin_consent_required',
    disconnect: true,
  }
}

type Parts = Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'dayPeriod', string>

function partsIn(date: Date, timeZone: string): Parts {
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  let formatter: Intl.DateTimeFormat
  try {
    formatter = format(timeZone)
  } catch {
    // A profile carrying a zone the runtime does not know still gets a date.
    formatter = format('UTC')
  }
  return Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  ) as Parts
}

/**
 * "Aug 27, 9:43 PM" in the account's time zone, with the year when it is not
 * this year. Built from parts, so the spacing is the same on every runtime.
 */
export function formatSyncTime(iso: string, timeZone: string, now: Date = new Date()): string {
  const { date, time } = dateAndTime(new Date(iso), timeZone, now)
  return `${date}, ${time}`
}

function dateAndTime(at: Date, timeZone: string, now: Date): { date: string; time: string } {
  const p = partsIn(at, timeZone)
  const thisYear = partsIn(now, timeZone).year
  return {
    date: `${p.month} ${p.day}${p.year === thisYear ? '' : `, ${p.year}`}`,
    time: `${p.hour}:${p.minute} ${p.dayPeriod}`,
  }
}

export interface CalendarFreshness {
  kind: 'fresh' | 'stale' | 'never'
  /** "Last synced Aug 27, 9:43 PM", or "Never synced". */
  label: string
  /** Over a day since the last sync, or no sync at all. */
  stale: boolean
  /**
   * Why the meetings may be out of date and what to do, for a connection that
   * can sync. Null when they are current, or when the state already says what
   * to do (reconnect, ask an administrator).
   */
  note: string | null
}

export function calendarFreshness(
  input: { state: CalendarState; lastSyncedAt: string | null },
  options: { timeZone: string; now?: Date },
): CalendarFreshness {
  const now = options.now ?? new Date()
  const at = input.lastSyncedAt ? new Date(input.lastSyncedAt) : null
  const syncable = input.state === 'connected' || input.state === 'error'

  if (!at || Number.isNaN(at.getTime())) {
    return {
      kind: 'never',
      label: 'Never synced',
      stale: true,
      note:
        input.state === 'connected'
          ? `Not synced yet. ${brand.name} syncs your calendar only when you press Sync now.`
          : null,
    }
  }

  const { date, time } = dateAndTime(at, options.timeZone, now)
  const label = `Last synced ${date}, ${time}`
  if (now.getTime() - at.getTime() <= STALE_AFTER_MS) {
    return { kind: 'fresh', label, stale: false, note: null }
  }

  return {
    kind: 'stale',
    label,
    stale: true,
    note: !syncable
      ? null
      : input.state === 'connected'
        ? `Not synced since ${date}. ${brand.name} syncs your calendar only when you press Sync now, so meetings added or changed since then are missing.`
        : `Not synced since ${date}, so meetings added or changed since then are missing.`,
  }
}

/**
 * What a press of Sync now came to, in a word the iPhone route maps to a
 * status code. The three "recent" answers are the one-minute limit: the last
 * attempt succeeded, failed, or is still running.
 */
export type CalendarSyncCode =
  | 'synced'
  | 'recently_synced'
  | 'recently_failed'
  | 'in_progress'
  | 'not_connected'
  | 'plan_required'
  | 'needs_reconnect'
  | 'admin_consent_required'
  | 'rate_limited'
  | 'unavailable'
  | 'error'
