import { describe, expect, it } from 'vitest'
import { planForPrice, priceMatchesOffer } from './stripe'
import { PRO_PRICE } from './plans'

/** Checkout starts only when the Stripe price bills what the page advertises. */
const price = (over: Record<string, unknown> = {}) =>
  ({
    active: true,
    type: 'recurring',
    currency: 'usd',
    unit_amount: 2900,
    recurring: { interval: 'month', interval_count: 1 },
    ...over,
  }) as Parameters<typeof priceMatchesOffer>[0]

describe('priceMatchesOffer', () => {
  it('accepts the $29 monthly USD price', () => {
    expect(priceMatchesOffer(price(), PRO_PRICE)).toBe(true)
  })

  it.each([
    ['a different amount', { unit_amount: 4900 }],
    ['annual billing', { recurring: { interval: 'year', interval_count: 1 } }],
    ['every three months', { recurring: { interval: 'month', interval_count: 3 } }],
    ['another currency', { currency: 'eur' }],
    ['a one-time price', { type: 'one_time', recurring: null }],
    ['an archived price', { active: false }],
  ])('refuses %s', (_label, over) => {
    expect(priceMatchesOffer(price(over), PRO_PRICE)).toBe(false)
  })
})

describe('planForPrice', () => {
  it('confers nothing for a missing or unknown price', () => {
    expect(planForPrice(null)).toBe('free')
    expect(planForPrice('price_not_ours')).toBe('free')
  })
})
