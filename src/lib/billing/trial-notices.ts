import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { logger } from '@/lib/logger'
import { hourIn } from '@/lib/tz'
import { notifyTrial, type TrialNotice } from './notify'
import { trialNoticeDue } from './trial'

/**
 * THE TRIAL'S DAILY NOTICES
 * =============================================================================
 * For a trial that was not subscribed: "Your Pro trial ends on …" two to
 * three days before the end, and "Your Pro trial has ended" the day after.
 *
 * For a trial that was subscribed and not canceled: "Your first Pro charge is
 * on …" in the same window, so the first charge never arrives unannounced --
 * the confirmation that named it may be two weeks old by then. A canceled one
 * gets nothing: it will not be charged.
 *
 * Run once a day from the scheduled follow-through job (service role: there
 * is no session). The windows in `trialNoticeDue` replace a ledger, so the job
 * must run them once a day and not on a manual re-run.
 * =============================================================================
 */

const HOUR_MS = 3_600_000

/**
 * Whether this run of the follow-through job sends the trial notices: the
 * scheduled daily run, never a manual one (which passes `?mode=`), and only at
 * 13:00 UTC if the job is ever made hourly. The windows rely on it.
 */
export function trialNoticesRun(input: {
  query: string | null
  mode: 'daily' | 'hourly'
  now: Date
}): boolean {
  return input.query === null && (input.mode === 'daily' || hourIn('UTC', input.now) === 13)
}

export async function sendTrialNotices(
  admin: SupabaseClient<Database>,
  now: Date,
  notify: (userId: string, notice: TrialNotice, endsAt: string) => Promise<boolean> = notifyTrial,
): Promise<{ ending: number; ended: number; charge_soon: number; failed: number }> {
  const tally = { ending: 0, ended: 0, charge_soon: 0, failed: 0 }
  // Both kinds of trial: the app's own (no Stripe subscription) and Stripe's,
  // whose `trial_ends_at` the webhook keeps as the first charge.
  const { data, error } = await admin
    .from('subscriptions')
    .select('user_id, trial_ends_at, stripe_subscription_id, cancel_at_period_end')
    .eq('status', 'trialing')
    .gt('trial_ends_at', new Date(now.getTime() - 24 * HOUR_MS).toISOString())
    .lte('trial_ends_at', new Date(now.getTime() + 72 * HOUR_MS).toISOString())
    .limit(5000)
  if (error) {
    logger.warn('trial_notices.list_failed', { code: error.code })
    return tally
  }

  for (const row of data ?? []) {
    if (!row.trial_ends_at) continue
    const due = trialNoticeDue(row.trial_ends_at, now)
    const notice = !row.stripe_subscription_id
      ? due
      : due === 'ending' && !row.cancel_at_period_end
        ? 'charge_soon'
        : null
    if (!notice) continue
    const sent = await notify(row.user_id, notice, row.trial_ends_at)
    if (!sent) tally.failed++
    else tally[notice]++
  }
  return tally
}
