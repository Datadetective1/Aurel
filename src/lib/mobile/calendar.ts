import 'server-only'
import { providerConfigured, type CalendarProviderId } from '@/lib/calendar/provider'
import {
  CALENDAR_STATE,
  calendarActions,
  calendarFreshness,
  calendarState,
} from '@/lib/calendar/freshness'
import type { CalendarConnection } from './contracts'

/**
 * A saved calendar connection, as the iPhone shows it: the website's own
 * words for its state and freshness, worked out here in the account's time
 * zone (finding 8.6). Built from the columns below and nothing else, so no
 * token can reach the app.
 */
export const CALENDAR_COLUMNS = 'provider, status, external_account_email, last_synced_at'

export interface CalendarRow {
  provider: CalendarProviderId
  status: string
  external_account_email: string | null
  last_synced_at: string | null
}

export function mobileCalendarConnection(
  row: CalendarRow,
  options: { planAllows: boolean; timeZone: string; now?: Date },
): CalendarConnection {
  const state = calendarState({
    stored: row.status,
    configured: providerConfigured(row.provider),
    planAllows: options.planAllows,
  })
  const meta = CALENDAR_STATE[state]
  const freshness = calendarFreshness(
    { state, lastSyncedAt: row.last_synced_at },
    { timeZone: options.timeZone, now: options.now },
  )
  const actions = calendarActions(state, true)
  return {
    provider: row.provider,
    status: row.status,
    accountEmail: row.external_account_email,
    lastSyncedAt: row.last_synced_at,
    view: {
      label: meta.label,
      tone: meta.tone === 'positive' || meta.tone === 'caution' ? meta.tone : 'neutral',
      detail: meta.detail,
      synced: freshness.label,
      stale: freshness.stale,
      note: freshness.note,
      sync: actions.sync,
      reconnect: actions.reconnect,
    },
  }
}
