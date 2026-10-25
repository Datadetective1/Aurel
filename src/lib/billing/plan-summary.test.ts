import { describe, expect, it } from 'vitest'
import { KEPT_ON_FREE, SUBSCRIBE_LABEL, planSummary, type PlanSummaryInput } from './plan-summary'

/**
 * WHAT THE PLAN PAGE AND THE IPHONE SAY, STATE BY STATE
 * =============================================================================
 * Every state says when the first or next charge is and what it repeats, or
 * that nothing will be charged; and that returning to Free deletes nothing.
 * Dates are the account's zone (Chicago here).
 * =============================================================================
 */

const NOW = new Date('2026-10-25T15:00:00Z')

const base: PlanSummaryInput = {
  plan: 'free',
  fullAccess: false,
  trial: null,
  subscription: null,
  trialOffered: true,
  canSubscribe: true,
  timeZone: 'America/Chicago',
  now: NOW,
}

describe('a Free account that never had a trial', () => {
  it('is offered the trial and an explicit, priced subscribe action', () => {
    const s = planSummary(base)
    expect(s.label).toBe('Free')
    expect(s.offerTrial).toBe(true)
    expect(s.subscribe).toEqual({
      label: 'Subscribe to Pro — $29/month',
      terms: 'You will be charged $29 today, then $29 every month until you cancel.',
    })
    expect(SUBSCRIBE_LABEL).toBe('Subscribe to Pro — $29/month')
  })

  it('is not offered the trial where subscribing does not work', () => {
    const s = planSummary({ ...base, trialOffered: false, canSubscribe: false })
    expect(s.offerTrial).toBe(false)
    expect(s.subscribe).toBeNull()
  })
})

describe('during the trial', () => {
  const trial = { state: 'active' as const, endsAt: '2026-11-08T15:00:00Z' }

  it('names the end date in the account’s zone, the days left, and that there is no card', () => {
    const s = planSummary({ ...base, plan: 'pro', trial })
    expect(s.label).toBe('Pro trial')
    expect(s.shortLabel).toBe('Pro trial · ends 8 Nov 2026')
    expect(s.lines[0]).toBe(
      'Your 14-day trial ends on 8 Nov 2026 (14 days left). No card, nothing charged.',
    )
    expect(s.lines[1]).toContain('returns to Free, unless you subscribe')
    expect(s.lines[1]).toContain(KEPT_ON_FREE)
    expect(s.offerTrial).toBe(false)
  })

  it('subscribing keeps the rest of the trial and shows the first charge date', () => {
    const s = planSummary({ ...base, plan: 'pro', trial })
    expect(s.subscribe?.label).toBe('Subscribe to Pro — $29/month')
    expect(s.subscribe?.terms).toBe(
      'The rest of your trial is kept. Your first charge of $29 is on 8 Nov 2026, then $29 every month until you cancel.',
    )
  })

  it('a day before the end, the first charge moves to Checkout’s two-day minimum', () => {
    const s = planSummary({
      ...base,
      plan: 'pro',
      trial: { state: 'active', endsAt: '2026-10-26T15:00:00Z' },
    })
    expect(s.lines[0]).toContain('(1 day left)')
    expect(s.subscribe?.terms).toContain('first charge of $29 is on 27 Oct 2026')
  })

  it('the date is the account’s day, not UTC’s', () => {
    // 03:00 UTC on 9 Nov is still 8 Nov in Chicago.
    const s = planSummary({
      ...base,
      plan: 'pro',
      trial: { state: 'active', endsAt: '2026-11-09T03:00:00Z' },
    })
    expect(s.shortLabel).toBe('Pro trial · ends 8 Nov 2026')
  })
})

describe('subscribed during the trial', () => {
  const trial = { state: 'subscribed' as const, endsAt: '2026-11-08T15:00:00Z' }

  it('says when the first charge is and what repeats', () => {
    const s = planSummary({
      ...base,
      plan: 'pro',
      trial,
      subscription: {
        status: 'trialing',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: trial.endsAt,
      },
    })
    expect(s.label).toBe('Pro')
    expect(s.shortLabel).toBe('Pro · first charge 8 Nov 2026')
    expect(s.lines).toEqual([
      'Subscribed. Your first charge of $29 is on 8 Nov 2026, then $29 every month until you cancel.',
    ])
    expect(s.subscribe).toBeNull()
    expect(s.offerTrial).toBe(false)
  })

  it('canceled before the first charge: nothing will be charged', () => {
    const s = planSummary({
      ...base,
      plan: 'pro',
      trial,
      subscription: { status: 'trialing', cancelAtPeriodEnd: true, currentPeriodEnd: trial.endsAt },
    })
    expect(s.shortLabel).toBe('Pro until 8 Nov 2026')
    expect(s.lines[0]).toContain('you will not be charged')
    expect(s.lines[0]).toContain(KEPT_ON_FREE)
  })
})

describe('the trial ended without a subscription', () => {
  it('is Free, says nothing was charged and nothing deleted, and offers no second trial', () => {
    const s = planSummary({
      ...base,
      trialOffered: false,
      trial: { state: 'ended', endsAt: '2026-10-20T15:00:00Z' },
    })
    expect(s.label).toBe('Free')
    expect(s.shortLabel).toBe('Free')
    expect(s.lines).toEqual([
      `Your Pro trial ended on 20 Oct 2026. Nothing was charged. ${KEPT_ON_FREE}`,
    ])
    expect(s.offerTrial).toBe(false)
    expect(s.subscribe?.terms).toBe(
      'You will be charged $29 today, then $29 every month until you cancel.',
    )
  })

  it('never offers a second trial, even if asked to', () => {
    const s = planSummary({ ...base, trial: { state: 'ended', endsAt: '2026-10-20T15:00:00Z' } })
    expect(s.offerTrial).toBe(false)
  })
})

describe('paying', () => {
  it('names the renewal date and price', () => {
    const s = planSummary({
      ...base,
      plan: 'pro',
      subscription: {
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: '2026-11-25T15:00:00Z',
      },
    })
    expect(s.lines).toEqual(['Renews on 25 Nov 2026 at $29.'])
    expect(s.subscribe).toBeNull()
  })

  it('canceled: Pro until the end of the period, then Free, nothing deleted', () => {
    const s = planSummary({
      ...base,
      plan: 'pro',
      subscription: {
        status: 'active',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: '2026-11-25T15:00:00Z',
      },
    })
    expect(s.lines[0]).toBe(
      'Canceled. Pro stays on until 25 Nov 2026, then the account moves to Free. Nothing is deleted.',
    )
  })
})

describe('owner and pilot accounts', () => {
  it('show Full access with no offer', () => {
    const s = planSummary({ ...base, fullAccess: true })
    expect(s.shortLabel).toBe('Full access')
    expect(s).toMatchObject({ offerTrial: false, subscribe: null, lines: [] })
  })

  it('a paying pilot still sees the next charge', () => {
    const s = planSummary({
      ...base,
      fullAccess: true,
      plan: 'pro',
      subscription: {
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: '2026-11-25T15:00:00Z',
      },
    })
    expect(s.shortLabel).toBe('Pro')
    expect(s.lines).toEqual(['Renews on 25 Nov 2026 at $29.'])
  })
})
