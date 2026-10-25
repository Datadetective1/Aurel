/**
 * THE PRO TRIAL
 * =============================================================================
 * Fourteen days of Pro, once per account, with no card (owner decision,
 * 25 Oct 2026). Atturel grants it itself: the account's row in
 * `subscriptions` says `trialing` with a `trial_ends_at`, and there is no
 * Stripe subscription behind it.
 *
 * That is the consent rule, built in rather than policed. While the trial
 * runs there is nothing at Stripe that could start charging, so adding or
 * updating a card anywhere -- the billing portal included -- cannot turn into
 * a subscription. Only "Subscribe to Pro" does: a Stripe Checkout that names
 * the first charge date and the monthly terms, and keeps the rest of the
 * trial (`trial_end`). When the trial ends unsubscribed, the account is on
 * Free; nothing is deleted, archived or hidden.
 *
 * Pure: no network, no database.
 * =============================================================================
 */

export const TRIAL_DAYS = 14
const DAY_MS = 86_400_000

/**
 * Stripe Checkout refuses a `trial_end` less than 48 hours away. Subscribing
 * late in the trial keeps at least this much before the first charge, a
 * little more than the rest of the trial, never less.
 */
export const CHECKOUT_MIN_TRIAL_MS = 48 * 3_600_000 + 10 * 60_000

/** The fields of the canonical row the trial is read from. */
export interface TrialRow {
  status: string | null
  trialEndsAt: string | null
  stripeSubscriptionId: string | null
}

/**
 * active      the app's own trial, still running
 * ended       the app's own trial, over without a subscription: Free
 * subscribed  subscribed during the trial; Stripe's trial runs to the first
 *             charge
 */
export type TrialState = 'active' | 'ended' | 'subscribed'

/** A trial Atturel granted itself: no Stripe subscription behind the row. */
export function isAppTrial(row: TrialRow | null | undefined): boolean {
  return Boolean(row && !row.stripeSubscriptionId && row.status === 'trialing' && row.trialEndsAt)
}

export function trialState(
  row: TrialRow | null | undefined,
  now: Date = new Date(),
): TrialState | null {
  if (!row?.trialEndsAt) return null
  if (isAppTrial(row)) {
    return new Date(row.trialEndsAt).getTime() > now.getTime() ? 'active' : 'ended'
  }
  if (row.stripeSubscriptionId && row.status === 'trialing') return 'subscribed'
  return null
}

/** Whether the app's own trial is running right now. */
export function appTrialActive(row: TrialRow | null | undefined, now: Date = new Date()): boolean {
  return trialState(row, now) === 'active'
}

export type TrialEligibility =
  { eligible: true } | { eligible: false; reason: 'used' | 'subscribed' | 'full_access' }

/**
 * One trial per account. An account that has had a trial, or a Stripe
 * subscription of any kind, has had its chance to see Pro; owner and pilot
 * accounts already have everything.
 */
export function trialEligibility(
  row: TrialRow | null | undefined,
  fullAccess: boolean,
): TrialEligibility {
  if (fullAccess) return { eligible: false, reason: 'full_access' }
  if (row?.stripeSubscriptionId) return { eligible: false, reason: 'subscribed' }
  if (row?.trialEndsAt) return { eligible: false, reason: 'used' }
  return { eligible: true }
}

/** When a trial started now ends. */
export function trialEndsAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + TRIAL_DAYS * DAY_MS)
}

/**
 * The first charge when subscribing during the trial: the trial's own end,
 * unless that is closer than Checkout allows. Rounded down to the minute so a
 * double-submitted form asks Stripe for the same thing.
 */
export function firstChargeAt(trialEnd: string, now: Date = new Date()): Date {
  const end = new Date(trialEnd).getTime()
  const floor = now.getTime() + CHECKOUT_MIN_TRIAL_MS
  const at = Math.max(end, floor)
  return new Date(Math.floor(at / 60_000) * 60_000)
}

/** Whole days left, counting a part day as one: "ends in 3 days". */
export function trialDaysLeft(trialEnd: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(trialEnd).getTime() - now.getTime()) / DAY_MS))
}

const HOUR_MS = 3_600_000

/**
 * Which notice a trial is due on a daily run, without a ledger: "ends soon"
 * on the one run between 72 and 48 hours before the end, "ended" on the one
 * run in the 24 hours after it. A run a day apart lands in each window once.
 */
export function trialNoticeDue(
  trialEnd: string,
  now: Date = new Date(),
): 'ending' | 'ended' | null {
  const remaining = new Date(trialEnd).getTime() - now.getTime()
  if (remaining > 48 * HOUR_MS && remaining <= 72 * HOUR_MS) return 'ending'
  if (remaining <= 0 && remaining > -24 * HOUR_MS) return 'ended'
  return null
}
