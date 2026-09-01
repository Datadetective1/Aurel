import { afterEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'

/**
 * The translation layer between Stripe's vocabulary and ours.
 *
 * Every function here decides something a customer feels: which plan a payment
 * bought, whether a lapsed card still entitles, what a renewal date is read
 * from. They are pure given the environment, so the environment is what the
 * tests move.
 *
 * Loaded through a dynamic import after stubbing env, because the module reads
 * serverEnv at import time — the same pattern lib/ai/transcribe.test.ts uses.
 */

const MONTHLY = 'price_test_monthly_placeholder'
const YEARLY = 'price_test_yearly_placeholder'

async function load(env: Record<string, string> = {}) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return import('./stripe')
}

async function configured() {
  return load({ STRIPE_PRICE_PRO_MONTHLY: MONTHLY, STRIPE_PRICE_PRO_YEARLY: YEARLY })
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('choosing a price from an interval', () => {
  it('maps monthly and yearly onto the two configured prices', async () => {
    const { priceIdFor } = await configured()
    expect(priceIdFor('monthly')).toBe(MONTHLY)
    expect(priceIdFor('yearly')).toBe(YEARLY)
  })

  it('returns null rather than a wrong price when one is unconfigured', async () => {
    const { priceIdFor } = await load({ STRIPE_PRICE_PRO_MONTHLY: MONTHLY })
    expect(priceIdFor('monthly')).toBe(MONTHLY)
    // Checkout turns this into "that plan is not available yet" rather than
    // quietly selling the monthly price to somebody who asked for annual.
    expect(priceIdFor('yearly')).toBeNull()
  })

  it('returns null for both on a deployment with no Stripe prices', async () => {
    const { priceIdFor } = await load()
    expect(priceIdFor('monthly')).toBeNull()
    expect(priceIdFor('yearly')).toBeNull()
  })
})

describe('which plan a price grants', () => {
  it('grants Pro for either configured price', async () => {
    const { planForPrice } = await configured()
    expect(planForPrice(MONTHLY)).toBe('pro')
    expect(planForPrice(YEARLY)).toBe('pro')
  })

  it('grants nothing for a price that is not ours', async () => {
    const { planForPrice } = await configured()
    // The important one. A subscription created against some other price — by
    // hand in the dashboard, or on a different product entirely — must not
    // confer Pro just because Stripe says it is active.
    expect(planForPrice('price_someone_elses')).toBe('free')
    expect(planForPrice(null)).toBe('free')
    expect(planForPrice(undefined)).toBe('free')
  })

  it('grants nothing when no prices are configured, rather than everything', async () => {
    const { planForPrice } = await load()
    // Fails closed: with both env values undefined, a null price id must not
    // match "undefined === undefined" into a free upgrade.
    expect(planForPrice(null)).toBe('free')
    expect(planForPrice('price_anything')).toBe('free')
  })
})

describe('which interval a price bills on', () => {
  it('reads the interval back off a known price', async () => {
    const { intervalForPrice } = await configured()
    expect(intervalForPrice(MONTHLY)).toBe('monthly')
    expect(intervalForPrice(YEARLY)).toBe('yearly')
  })

  it('is null for an unknown price, so the screen shows no interval at all', async () => {
    const { intervalForPrice } = await configured()
    expect(intervalForPrice('price_unknown')).toBeNull()
    expect(intervalForPrice(null)).toBeNull()
  })
})

describe('mapping a Stripe status onto ours', () => {
  it('passes through every status the database can store', async () => {
    const { mapStatus } = await load()
    const all = [
      'trialing',
      'active',
      'past_due',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'unpaid',
      'paused',
    ] as const
    for (const status of all) {
      expect(mapStatus(status), status).toBe(status)
    }
  })

  it('treats a status Stripe adds later as not entitled', async () => {
    const { mapStatus } = await load()
    // Guessing "active" for an unknown value gives away paid capability
    // indefinitely; guessing "canceled" costs at most a support message.
    expect(mapStatus('something_new' as Stripe.Subscription.Status)).toBe('canceled')
  })
})

describe('finding the subscription behind an invoice', () => {
  const invoice = (parent: unknown) => ({ parent }) as unknown as Stripe.Invoice

  it('reads it from parent.subscription_details, where this API version puts it', async () => {
    const { subscriptionIdFromInvoice } = await load()
    expect(
      subscriptionIdFromInvoice(
        invoice({
          type: 'subscription_details',
          subscription_details: { subscription: 'sub_123' },
        }),
      ),
    ).toBe('sub_123')
  })

  it('accepts an expanded subscription object as well as an id', async () => {
    const { subscriptionIdFromInvoice } = await load()
    expect(
      subscriptionIdFromInvoice(
        invoice({ subscription_details: { subscription: { id: 'sub_456' } } }),
      ),
    ).toBe('sub_456')
  })

  it('returns null for a one-off invoice with no subscription parent', async () => {
    const { subscriptionIdFromInvoice } = await load()
    expect(subscriptionIdFromInvoice(invoice(null))).toBeNull()
    expect(
      subscriptionIdFromInvoice(invoice({ type: 'quote_details', quote_details: {} })),
    ).toBeNull()
  })

  it('does NOT read a top-level subscription field', async () => {
    const { subscriptionIdFromInvoice } = await load()
    // The shape this replaced. Code written against the old field reads
    // undefined and silently treats every renewal as an unrelated charge.
    const legacy = { subscription: 'sub_legacy', parent: null } as unknown as Stripe.Invoice
    expect(subscriptionIdFromInvoice(legacy)).toBeNull()
  })
})

describe('the founding promotion', () => {
  it('cannot be sold, because no price backs it', async () => {
    const { foundingOfferSellable, foundingPriceId } = await configured()
    expect(foundingPriceId()).toBeNull()
    expect(foundingOfferSellable()).toBe(false)
  })
})

describe('the Stripe client', () => {
  it('refuses to construct itself on a deployment with no secret key', async () => {
    const { stripe } = await load()
    // Better than a confusing failure deep inside a checkout call, and it is
    // why an unconfigured deployment still boots.
    expect(() => stripe()).toThrow(/not configured/i)
  })
})
