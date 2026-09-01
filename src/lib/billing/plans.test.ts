import { describe, expect, it } from 'vitest'
import {
  ENTITLED_STATUSES,
  FOUNDING_OFFER,
  PLANS,
  annualSavingPercent,
  formatPrice,
  foundingOfferAdvertisable,
  isEntitledStatus,
  monthlyEquivalentCents,
} from './plans'

/**
 * Commercial policy, asserted.
 *
 * Prices are the one kind of configuration where a typo is a legal problem
 * rather than a bug, so the numbers the business actually sells at are pinned
 * here. Changing a price should require changing this file too — that is the
 * point of it.
 */

describe('the price list', () => {
  it('sells Pro at $19 a month and $190 a year', () => {
    expect(PLANS.pro.monthlyPriceCents).toBe(1900)
    expect(PLANS.pro.yearlyPriceCents).toBe(19000)
  })

  it('renders those as whole dollars, with no stray cents', () => {
    expect(formatPrice(PLANS.pro.monthlyPriceCents)).toBe('$19')
    expect(formatPrice(PLANS.pro.yearlyPriceCents)).toBe('$190')
  })

  it('keeps Free free, and says so in words', () => {
    expect(PLANS.free.monthlyPriceCents).toBe(0)
    expect(formatPrice(0)).toBe('Free')
  })

  it('leaves Teams as a conversation rather than a number', () => {
    expect(PLANS.team.monthlyPriceCents).toBeNull()
    expect(formatPrice(null)).toBe('Contact us')
  })

  it('makes the annual price an actual saving', () => {
    const annual = PLANS.pro.yearlyPriceCents as number
    const twelveMonths = (PLANS.pro.monthlyPriceCents as number) * 12
    expect(annual).toBeLessThan(twelveMonths)
    // Two months free, stated as a rounded-down percentage so the page can
    // never claim a bigger saving than it gives.
    expect(annualSavingPercent(PLANS.pro)).toBe(16)
  })

  it('states the monthly equivalent of the annual price', () => {
    // $190 / 12 = $15.83. Shown because "$190 a year" and "$19 a month" are
    // otherwise not comparable at a glance.
    expect(monthlyEquivalentCents(PLANS.pro)).toBe(1583)
    expect(formatPrice(monthlyEquivalentCents(PLANS.pro))).toBe('$15.83')
  })

  it('offers no annual saving where there is no annual price', () => {
    expect(annualSavingPercent(PLANS.team)).toBeNull()
    expect(monthlyEquivalentCents(PLANS.team)).toBeNull()
  })
})

/**
 * The founding promotion charged list price while displaying a discount,
 * because there has never been a Stripe price behind it. These are the two
 * assertions that stop that shipping again.
 */
describe('the founding promotion', () => {
  it('is off', () => {
    expect(FOUNDING_OFFER.enabled).toBe(false)
    expect(foundingOfferAdvertisable(PLANS.pro)).toBe(false)
  })

  it('cannot be advertised at or above the price it claims to discount', () => {
    // The state the repricing created: a "founding price" of $29 against a
    // list price of $19. Switching `enabled` on alone must not resurrect it.
    const pretendEnabled = { ...PLANS.pro, monthlyPriceCents: FOUNDING_OFFER.monthlyPriceCents - 1 }
    expect(foundingOfferAdvertisable(pretendEnabled)).toBe(false)

    const genuinelyCheaper = {
      ...PLANS.pro,
      monthlyPriceCents: FOUNDING_OFFER.monthlyPriceCents + 1,
    }
    // Still false, because the promotion itself is off. Both halves must agree.
    expect(foundingOfferAdvertisable(genuinelyCheaper)).toBe(false)
  })
})

describe('which statuses keep a paid plan alive', () => {
  it('entitles trialing, active and past_due, and nothing else', () => {
    expect([...ENTITLED_STATUSES]).toEqual(['trialing', 'active', 'past_due'])
  })

  it('keeps a customer whose card just failed', () => {
    // Stripe retries for weeks. Cutting access on the first decline turns an
    // expired card into a cancellation.
    expect(isEntitledStatus('past_due')).toBe(true)
  })

  it('drops canceled, unpaid, paused and the incomplete pair', () => {
    for (const status of ['canceled', 'unpaid', 'paused', 'incomplete', 'incomplete_expired']) {
      expect(isEntitledStatus(status), status).toBe(false)
    }
  })

  it('treats absent and unrecognised as not entitled', () => {
    expect(isEntitledStatus(null)).toBe(false)
    expect(isEntitledStatus(undefined)).toBe(false)
    expect(isEntitledStatus('')).toBe(false)
    expect(isEntitledStatus('something_stripe_added_later')).toBe(false)
  })
})

describe('what Free and Pro actually differ on', () => {
  it('gives Free a real product, not a preview', () => {
    // Free must be able to research a person, build a brief and debrief, or it
    // demonstrates nothing worth paying for.
    expect(PLANS.free.capabilities.researchPerson).toBe(true)
    expect(PLANS.free.capabilities.meetingBrief).toBe(true)
    expect(PLANS.free.capabilities.debrief).toBe(true)
    expect(PLANS.free.capabilities.dataExport).toBe(true)
  })

  it('reserves the expensive capabilities for Pro', () => {
    for (const capability of [
      'deepResearch',
      'relationshipAtlas',
      'calendarIntegration',
    ] as const) {
      expect(PLANS.free.capabilities[capability], capability).toBe(false)
      expect(PLANS.pro.capabilities[capability], capability).toBe(true)
    }
  })

  it('never meters storing a person', () => {
    // The moat is relationship memory, and charging per person attacks it.
    expect(PLANS.pro.limits.people).toBeNull()
    expect(Object.keys(PLANS.pro.quotas)).not.toContain('person_stored')
  })

  it('states a Free quota for every capability Free can reach', () => {
    // A capability that is on with a quota of 0, or on with no quota row at
    // all, is a promise the product cannot keep.
    const metered: Array<[keyof typeof PLANS.free.capabilities, string]> = [
      ['researchPerson', 'person_research'],
      ['meetingBrief', 'meeting_brief'],
      ['documentAnalysis', 'document_analysis'],
      ['aiCoach', 'ai_coach_message'],
    ]
    for (const [capability, meter] of metered) {
      if (!PLANS.free.capabilities[capability]) continue
      const quota = PLANS.free.quotas[meter as keyof typeof PLANS.free.quotas]
      expect(quota, `${capability} is on for Free but ${meter} allows nothing`).not.toBe(0)
      expect(quota, `${capability} is on for Free but ${meter} has no quota`).toBeDefined()
    }
  })
})
