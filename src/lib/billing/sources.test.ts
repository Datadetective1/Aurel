import { describe, expect, it } from 'vitest'
import { resolveEntitlement } from './sources'
import { effectivePlan, transitionsBetween } from './subscription-state'
import { applyAccessTier } from './access'
import { PLANS, FOUNDING_OFFER, foundingProtectionBlurb } from './plans'

describe('one canonical entitlement from every provider', () => {
  it('a Free account with nothing is Free', () => {
    expect(resolveEntitlement({ stripe: null, apple: null, tier: 'standard' })).toEqual({
      plan: 'free',
      provider: 'none',
      billingProviders: [],
    })
  })

  it('an active Stripe subscription confers Pro', () => {
    expect(
      resolveEntitlement({
        stripe: { plan: 'pro', status: 'active' },
        apple: null,
        tier: 'standard',
      }),
    ).toMatchObject({
      plan: 'pro',
      provider: 'stripe',
      billingProviders: ['stripe'],
    })
  })

  it('a lapsed Stripe subscription confers Free', () => {
    for (const status of ['canceled', 'unpaid', 'incomplete_expired', 'incomplete', 'paused']) {
      expect(
        resolveEntitlement({ stripe: { plan: 'pro', status }, apple: null, tier: 'standard' }).plan,
      ).toBe('free')
    }
  })

  it('past_due keeps Pro while the card is retried', () => {
    expect(effectivePlan({ plan: 'pro', status: 'past_due' })).toBe('pro')
  })

  it('a pilot without a subscription is manual, and keeps full access', () => {
    expect(resolveEntitlement({ stripe: null, apple: null, tier: 'pilot' }).provider).toBe('manual')
    const pilot = applyAccessTier('pilot', PLANS.free)
    expect(pilot.capabilities.relationshipAtlas).toBe(true)
    expect(pilot.capabilities.calendarIntegration).toBe(true)
    expect(pilot.limits.people).toBeNull()
  })

  it('a pilot who also pays is billed by Stripe -- deletion must still stop it', () => {
    expect(
      resolveEntitlement({ stripe: { plan: 'pro', status: 'active' }, apple: null, tier: 'pilot' })
        .billingProviders,
    ).toEqual(['stripe'])
  })

  it('a lapsed Stripe plan never cancels an Apple one', () => {
    const r = resolveEntitlement({
      stripe: { plan: 'pro', status: 'canceled' },
      apple: { plan: 'pro', status: 'active' },
      tier: 'standard',
    })
    expect(r).toMatchObject({ plan: 'pro', provider: 'apple', billingProviders: ['apple'] })
  })
})

describe('the plan matrix the server enforces', () => {
  it('keeps Atlas and calendar on Pro, and Free genuinely useful', () => {
    expect(PLANS.free.capabilities.relationshipAtlas).toBe(false)
    expect(PLANS.free.capabilities.calendarIntegration).toBe(false)
    expect(PLANS.pro.capabilities.relationshipAtlas).toBe(true)
    expect(PLANS.pro.capabilities.calendarIntegration).toBe(true)
    for (const c of [
      'meetingBrief',
      'quickBrief',
      'debrief',
      'aiCoach',
      'researchPerson',
      'dataExport',
    ] as const) {
      expect(PLANS.free.capabilities[c]).toBe(true)
    }
    expect(PLANS.free.limits.people).toBe(5)
    expect(PLANS.pro.limits.people).toBeNull()
  })

  it('does not meter Quick Brief, which costs nothing to run', () => {
    expect(PLANS.free.quotas.quick_brief).toBeNull()
  })

  it('sets no transcription allowance yet on any plan', () => {
    expect(PLANS.free.quotas.transcription_seconds).toBeUndefined()
    expect(PLANS.pro.quotas.transcription_seconds).toBeUndefined()
  })

  it('prices Pro at the founding $29 a month, with no annual plan', () => {
    expect(PLANS.pro.monthlyPriceCents).toBe(2900)
    expect(PLANS.pro.yearlyPriceCents).toBeNull()
    expect(FOUNDING_OFFER).toMatchObject({
      label: 'Pro Founding',
      monthlyPriceCents: 2900,
      currency: 'usd',
    })
  })

  it('makes no founding claim that has not been approved', () => {
    expect(FOUNDING_OFFER.maxCustomers).toBeNull()
    expect(FOUNDING_OFFER.referencePriceCents).toBeNull()
    expect(FOUNDING_OFFER.priceProtectionMonths).toBeNull()
    expect(foundingProtectionBlurb()).toBeNull()
  })
})

describe('transitions', () => {
  const pro = {
    plan: 'pro' as const,
    status: 'active',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  }
  it('produces nothing for an identical state', () => {
    expect(transitionsBetween(pro, pro)).toEqual([])
  })
  it('notices a withdrawn cancellation', () => {
    expect(transitionsBetween({ ...pro, cancelAtPeriodEnd: true }, pro)).toEqual([
      { kind: 'cancellation_withdrawn' },
    ])
  })
})
