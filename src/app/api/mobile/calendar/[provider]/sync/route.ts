import { mobileContext, json, planRequired } from '@/lib/mobile/route'
import { syncCalendarNow } from '@/app/(app)/calendar-actions'
import { getEntitlements } from '@/lib/billing/entitlements'
import { CALENDAR_COLUMNS, mobileCalendarConnection } from '@/lib/mobile/calendar'
import type { CalendarProviderId } from '@/lib/calendar/provider'
import type { CalendarSyncResponse } from '@/lib/mobile/contracts'

/**
 * SYNC NOW, FROM THE APP (finding 8.6)
 * =============================================================================
 * Runs only because the user pressed the button. The app never syncs on its
 * own: not on open, not in the background.
 *
 * The website's own action does the work, so it is the same code throughout:
 * the plan check, the one-minute limit (shared with the website, and held
 * when both are pressed at once), the read-only fourteen-day window, private
 * events kept private, and the tokens, which never leave the server. The
 * answer is what happened and the connection's new description, in the
 * account's time zone.
 * =============================================================================
 */

const PROVIDERS: ReadonlySet<string> = new Set<CalendarProviderId>(['microsoft', 'google'])

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response
  const { provider } = await params
  if (!PROVIDERS.has(provider)) return json({ error: 'not_found' }, 404)

  const result = await syncCalendarNow(provider as CalendarProviderId)

  // The plan's answer, not a failure: the app shows it as the plan's state,
  // with no way to buy from inside the app.
  if (result.code === 'plan_required') {
    return planRequired(result.error ?? 'Calendar sync is part of Pro.')
  }
  if (result.code === 'not_connected') return json({ error: 'not_found' }, 404)

  const [{ data: row }, entitlements] = await Promise.all([
    ctx.supabase
      .from('integration_accounts')
      .select(CALENDAR_COLUMNS)
      .eq('user_id', ctx.user.id)
      .eq('provider', provider as CalendarProviderId)
      .maybeSingle(),
    getEntitlements(),
  ])
  // Disconnected on the website while this ran.
  if (!row) return json({ error: 'not_found' }, 404)

  const body: CalendarSyncResponse = {
    outcome: {
      ok: result.ok === true,
      code: result.code ?? 'error',
      message: result.message ?? result.error ?? 'The sync did not complete. Try again shortly.',
    },
    connection: mobileCalendarConnection(row, {
      planAllows: entitlements.capabilities.calendarIntegration,
      timeZone: ctx.timeZone,
    }),
  }
  return json(body)
}
