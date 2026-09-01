import { describe, expect, it } from 'vitest'
import { billingView, priceLabel, type BillingViewInput } from './display'

/**
 * What the Plan screen says.
 *
 * The rule under test throughout: never invent a fact. A renewal date we do not
 * hold renders as nothing, not as a date computed from today — a customer who
 * reads "Renews 3 March" and is charged on the 17th has been told something
 * false by their own account screen.
 */

const base: BillingViewInput = {
  level: 'free',
  plan: 'free',
  status: null,
  interval: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  trialEndsAt: null,
  hasCustomer: false,
}

const view = (overrides: Partial<BillingViewInput> = {}) => billingView({ ...base, ...overrides })

const pro = (overrides: Partial<BillingViewInput> = {}) =>
  view({
    level: 'pro',
    plan: 'pro',
    status: 'active',
    interval: 'monthly',
    currentPeriodEnd: '2026-10-01T00:00:00.000Z',
    hasCustomer: true,
    ...overrides,
  })

describe('a free account', () => {
  it('is offered the upgrade and shown no price', () => {
    const result = view()
    expect(result.planName).toBe('Free')
    expect(result.showUpgrade).toBe(true)
    expect(result.priceLabel).toBeNull()
  })

  it('carries no status at all', () => {
    // "Active" on a free account implies a subscription that could lapse.
    expect(view().statusLabel).toBeNull()
  })

  it('names no renewal date, because there is nothing to renew', () => {
    expect(view().periodLabel).toBeNull()
  })

  it('offers no billing portal until Stripe knows who they are', () => {
    expect(view().showManage).toBe(false)
    // Someone who cancelled is back on Free but still has invoices to read.
    expect(view({ hasCustomer: true }).showManage).toBe(true)
  })
})

describe('a paying account', () => {
  it('states the monthly price for a monthly subscriber', () => {
    const result = pro()
    expect(result.planName).toBe('Pro')
    expect(result.statusLabel).toBe('Active')
    expect(result.statusTone).toBe('positive')
    expect(result.priceLabel).toBe('$19 per month')
    expect(result.periodLabel).toBe('Renews')
    expect(result.showManage).toBe(true)
    expect(result.showUpgrade).toBe(false)
    expect(result.notice).toBeNull()
  })

  it('states the ANNUAL price for an annual subscriber', () => {
    // The bug this pins: the screen read the monthly price unconditionally, so
    // somebody paying $190 a year was told they were paying $19 a month.
    expect(pro({ interval: 'yearly' }).priceLabel).toBe('$190 per year')
  })

  it('falls back to no price rather than a wrong one when the interval is lost', () => {
    expect(priceLabel('pro', null)).toBe('$19 per month')
    expect(priceLabel('free', 'monthly')).toBeNull()
  })

  it('shows a trial as a trial, with the date it ends', () => {
    const result = pro({ status: 'trialing' })
    expect(result.statusLabel).toBe('Trial')
    expect(result.periodLabel).toBe('Trial ends')
  })
})

describe('an account on its way out', () => {
  it('reads as Canceling, not Active, once cancellation is scheduled', () => {
    // Stripe holds the subscription at 'active' until the period runs out, so
    // this is only visible in the flag.
    const result = pro({ cancelAtPeriodEnd: true })
    expect(result.statusLabel).toBe('Canceling')
    expect(result.statusTone).toBe('caution')
  })

  it('relabels the date as an ending rather than a renewal', () => {
    expect(pro({ cancelAtPeriodEnd: true }).periodLabel).toBe('Access ends')
  })

  it('promises the record survives', () => {
    // Nothing is deleted when a subscription ends, and the screen where someone
    // is worrying about that is the screen that should say so.
    expect(pro({ cancelAtPeriodEnd: true }).notice).toMatch(/nothing you have recorded is deleted/i)
  })

  it('keeps them on Pro until the paid period actually ends', () => {
    // A cancellation is not a downgrade. Still Pro, still manageable.
    const result = pro({ cancelAtPeriodEnd: true })
    expect(result.planName).toBe('Pro')
    expect(result.showUpgrade).toBe(false)
  })
})

describe('an account with a payment problem', () => {
  it('explains a failed card without threatening', () => {
    const result = pro({ status: 'past_due' })
    expect(result.statusLabel).toBe('Payment failed')
    expect(result.statusTone).toBe('caution')
    expect(result.notice).toMatch(/still have Pro/i)
    expect(result.showManage).toBe(true)
  })

  it('says plainly when collection has been given up on', () => {
    const result = view({
      level: 'free',
      plan: 'free',
      status: 'unpaid',
      hasCustomer: true,
    })
    // Entitlement has already dropped to free by the time this renders, so the
    // reassurance about the record surviving is the whole message.
    expect(result.notice).toMatch(/relationship record is untouched/i)
  })

  it('explains a paused subscription and how to resume it', () => {
    expect(pro({ status: 'paused' }).notice).toMatch(/resume/i)
  })

  it('explains an incomplete subscription rather than showing a bare status', () => {
    expect(pro({ status: 'incomplete' }).notice).toMatch(/one more step/i)
  })
})

describe('an internal account', () => {
  it('shows the owner an owner state, and never a price', () => {
    const result = view({ level: 'owner' })
    expect(result.planName).toBe('Owner')
    expect(result.statusLabel).toBe('Full access')
    expect(result.priceLabel).toBeNull()
    expect(result.periodLabel).toBeNull()
    expect(result.notice).toMatch(/never billed/i)
  })

  it('never offers the owner a payment button', () => {
    // An owner who upgraded would start paying for their own product and land
    // in a plan/tier combination no screen is written for.
    const result = view({ level: 'owner' })
    expect(result.showUpgrade).toBe(false)
    expect(result.showManage).toBe(false)
  })

  it('keeps owner status even when the plan row says free', () => {
    expect(view({ level: 'owner', plan: 'free', status: null }).planName).toBe('Owner')
  })

  it('keeps owner status even if a subscription somehow exists', () => {
    const result = view({
      level: 'owner',
      plan: 'pro',
      status: 'active',
      interval: 'monthly',
      currentPeriodEnd: '2026-10-01T00:00:00.000Z',
      hasCustomer: true,
    })
    expect(result.planName).toBe('Owner')
    expect(result.priceLabel).toBeNull()
    expect(result.showManage).toBe(false)
  })

  it('distinguishes a pilot from an owner', () => {
    const result = view({ level: 'pilot' })
    expect(result.planName).toBe('Pilot')
    expect(result.notice).toMatch(/nothing to pay/i)
    expect(result.showUpgrade).toBe(false)
  })
})

describe('missing data', () => {
  it('omits the renewal row entirely when there is no date', () => {
    expect(pro({ currentPeriodEnd: null }).periodLabel).toBeNull()
  })

  it('omits the price rather than guessing an interval', () => {
    // plan 'pro' with no status is not a subscription; it is a half-written row.
    expect(view({ level: 'pro', plan: 'pro', status: null }).priceLabel).toBeNull()
  })
})

describe('an account whose subscription has already ended', () => {
  const lapsed = (status: 'unpaid' | 'canceled' | 'incomplete_expired') =>
    billingView({ ...base, status, hasCustomer: true })

  it('says why Pro went away after an uncollectable payment', () => {
    expect(lapsed('unpaid').notice).toMatch(/relationship record is untouched/i)
    expect(lapsed('unpaid').noticeTone).toBe('critical')
  })

  it('reassures after a cancellation that nothing was deleted', () => {
    expect(lapsed('canceled').notice).toMatch(/nothing you recorded has been deleted/i)
  })

  it('says nothing was charged for a checkout that never completed', () => {
    expect(lapsed('incomplete_expired').notice).toMatch(/nothing was charged/i)
  })

  it('still offers the upgrade, so resubscribing is one click', () => {
    expect(lapsed('canceled').showUpgrade).toBe(true)
    expect(lapsed('canceled').showManage).toBe(true)
  })

  it('stays silent for an account that simply never subscribed', () => {
    expect(billingView({ ...base }).notice).toBeNull()
  })
})
