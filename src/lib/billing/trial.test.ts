import { describe, expect, it } from 'vitest'
import {
  CHECKOUT_MIN_TRIAL_MS,
  TRIAL_DAYS,
  appTrialActive,
  firstChargeAt,
  isAppTrial,
  trialDaysLeft,
  trialEligibility,
  trialEndsAt,
  trialNoticeDue,
  trialState,
  type TrialRow,
} from './trial'

/**
 * THE 14-DAY PRO TRIAL, AS PURE RULES
 * =============================================================================
 * One trial per account, no card, nothing at Stripe while it runs; it ends by
 * itself; subscribing keeps the rest of it. These are the rules every surface
 * (Plan page, iPhone, emails, webhook) reads.
 * =============================================================================
 */

const NOW = new Date('2026-10-25T15:00:00Z')
const HOUR = 3_600_000
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR).toISOString()

const appTrial = (endsAt: string): TrialRow => ({
  status: 'trialing',
  trialEndsAt: endsAt,
  stripeSubscriptionId: null,
})

describe('which rows are the app’s own trial', () => {
  it('trialing, with an end and no Stripe subscription', () => {
    expect(isAppTrial(appTrial(at(24)))).toBe(true)
  })

  it('not a Stripe trial, a never-trialed Free row, or nothing', () => {
    expect(
      isAppTrial({ status: 'trialing', trialEndsAt: at(24), stripeSubscriptionId: 'sub_1' }),
    ).toBe(false)
    expect(isAppTrial({ status: null, trialEndsAt: null, stripeSubscriptionId: null })).toBe(false)
    expect(isAppTrial(null)).toBe(false)
  })
})

describe('the trial’s state', () => {
  it('runs until its end, then has ended -- by itself, with no job', () => {
    const row = appTrial(at(1))
    expect(trialState(row, NOW)).toBe('active')
    expect(appTrialActive(row, NOW)).toBe(true)
    const later = new Date(NOW.getTime() + 2 * HOUR)
    expect(trialState(row, later)).toBe('ended')
    expect(appTrialActive(row, later)).toBe(false)
  })

  it('ends exactly at its end', () => {
    expect(trialState(appTrial(NOW.toISOString()), NOW)).toBe('ended')
  })

  it('subscribed during the trial: Stripe’s trial runs to the first charge', () => {
    expect(
      trialState({ status: 'trialing', trialEndsAt: at(48), stripeSubscriptionId: 'sub_1' }, NOW),
    ).toBe('subscribed')
  })

  it('a paid subscription past its trial is not a trial', () => {
    expect(
      trialState({ status: 'active', trialEndsAt: at(-48), stripeSubscriptionId: 'sub_1' }, NOW),
    ).toBeNull()
  })
})

describe('one trial per account', () => {
  it('an account that never had one is eligible', () => {
    expect(
      trialEligibility({ status: null, trialEndsAt: null, stripeSubscriptionId: null }, false),
    ).toEqual({ eligible: true })
    expect(trialEligibility(null, false)).toEqual({ eligible: true })
  })

  it('a second start is refused, running or ended', () => {
    expect(trialEligibility(appTrial(at(24)), false)).toEqual({ eligible: false, reason: 'used' })
    expect(trialEligibility(appTrial(at(-24)), false)).toEqual({ eligible: false, reason: 'used' })
  })

  it('an account that has had any subscription is refused', () => {
    expect(
      trialEligibility(
        { status: 'canceled', trialEndsAt: null, stripeSubscriptionId: 'sub_1' },
        false,
      ),
    ).toEqual({ eligible: false, reason: 'subscribed' })
  })

  it('owner and pilot accounts already have everything', () => {
    expect(trialEligibility(null, true)).toEqual({ eligible: false, reason: 'full_access' })
  })
})

describe('dates', () => {
  it('a trial started now ends in 14 days', () => {
    expect(TRIAL_DAYS).toBe(14)
    expect(trialEndsAt(NOW).toISOString()).toBe('2026-11-08T15:00:00.000Z')
  })

  it('subscribing early keeps the whole rest of the trial', () => {
    expect(firstChargeAt(at(10 * 24), NOW).toISOString()).toBe(at(10 * 24))
  })

  it('subscribing in the last two days charges no earlier than Checkout allows', () => {
    const charge = firstChargeAt(at(5), NOW)
    expect(charge.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + 48 * HOUR)
    expect(charge.getTime()).toBeLessThanOrEqual(NOW.getTime() + CHECKOUT_MIN_TRIAL_MS)
  })

  it('is whole minutes, so a double-submitted form asks Stripe for the same thing', () => {
    const a = firstChargeAt(at(1), new Date(NOW.getTime() + 5_000))
    const b = firstChargeAt(at(1), new Date(NOW.getTime() + 20_000))
    expect(a.getTime()).toBe(b.getTime())
    expect(a.getTime() % 60_000).toBe(0)
  })

  it('counts a part day as a day, and never below zero', () => {
    expect(trialDaysLeft(at(14 * 24), NOW)).toBe(14)
    expect(trialDaysLeft(at(1), NOW)).toBe(1)
    expect(trialDaysLeft(at(-1), NOW)).toBe(0)
  })
})

describe('the daily notices, without a ledger', () => {
  it('"ends soon" between 72 and 48 hours before the end', () => {
    expect(trialNoticeDue(at(72), NOW)).toBe('ending')
    expect(trialNoticeDue(at(49), NOW)).toBe('ending')
    expect(trialNoticeDue(at(48), NOW)).toBeNull()
    expect(trialNoticeDue(at(73), NOW)).toBeNull()
  })

  it('"ended" in the 24 hours after the end', () => {
    expect(trialNoticeDue(at(0), NOW)).toBe('ended')
    expect(trialNoticeDue(at(-23), NOW)).toBe('ended')
    expect(trialNoticeDue(at(-24), NOW)).toBeNull()
    expect(trialNoticeDue(at(1), NOW)).toBeNull()
  })

  it('a run a day apart sends each notice exactly once, whatever the end time', () => {
    for (let offsetMinutes = 0; offsetMinutes < 24 * 60; offsetMinutes += 37) {
      const end = new Date(NOW.getTime() + 14 * 24 * HOUR + offsetMinutes * 60_000).toISOString()
      const sent: string[] = []
      for (let day = 0; day <= 16; day++) {
        const run = new Date(NOW.getTime() + day * 24 * HOUR)
        const due = trialNoticeDue(end, run)
        if (due) sent.push(due)
      }
      expect(sent).toEqual(['ending', 'ended'])
    }
  })
})

describe('one expiry rule for every reader', () => {
  it('entitlements, the trial state and the webhook guard agree to the millisecond', async () => {
    const { resolveEntitlement } = await import('./sources')
    const { trialRunning } = await import('./trial')
    const end = '2026-11-08T15:00:00.000Z'
    for (const offset of [-1, 0, 1]) {
      const now = new Date(Date.parse(end) + offset)
      const running = trialRunning(end, now)
      expect(running).toBe(offset < 0)
      expect(trialState(appTrial(end), now)).toBe(running ? 'active' : 'ended')
      expect(appTrialActive(appTrial(end), now)).toBe(running)
      expect(
        resolveEntitlement({
          stripe: null,
          apple: null,
          trial: { endsAt: end },
          tier: 'standard',
          now,
        }).plan,
      ).toBe(running ? 'pro' : 'free')
    }
  })

  it('a date that cannot be read is an ended trial, never an endless one', async () => {
    const { trialRunning } = await import('./trial')
    expect(trialRunning('not a date', NOW)).toBe(false)
    expect(trialState(appTrial('not a date'), NOW)).toBe('ended')
  })
})
