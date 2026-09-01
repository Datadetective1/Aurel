import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Plan resolution.
 *
 * The question "what is this account allowed to do" is answered in exactly one
 * place, and this is that place under test: a subscription row and an access
 * grant go in, a set of capabilities and quotas comes out.
 *
 * The cases that matter are the unhappy ones. A lapsed subscription must stop
 * entitling; a failed card must not; an owner must be unrestricted no matter
 * what the subscription row says.
 */

const UUID = '11111111-2222-4333-8444-555555555555'

let subscriptionRow: Record<string, unknown> | null
let grantRow: Record<string, unknown> | null
let overrideRows: Array<Record<string, unknown>>

vi.mock('@/lib/auth', () => ({
  requireUser: async () => ({ id: UUID, email: 'someone@example.com' }),
}))

vi.mock('@/lib/analytics', () => ({ track: async () => {} }))

/**
 * A query builder just real enough for the three reads getEntitlements makes.
 * `eq` is both awaitable (the overrides list) and chainable (the two singles).
 */
function builder(result: unknown) {
  const payload = { data: result, error: null }
  const chain = {
    eq: () => chain,
    is: () => chain,
    maybeSingle: async () => payload,
    then: (resolve: (value: unknown) => unknown) => resolve(payload),
  }
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => ({
      select: () => {
        if (table === 'subscriptions') return builder(subscriptionRow)
        if (table === 'access_grants') return builder(grantRow)
        if (table === 'entitlement_overrides') return builder(overrideRows)
        return builder(null)
      },
    }),
  }),
}))

async function resolve() {
  // resetModules also clears React's cache() memo, so each case is independent.
  vi.resetModules()
  const { getEntitlements } = await import('./entitlements')
  return getEntitlements()
}

const paid = (overrides: Record<string, unknown> = {}) => ({
  plan: 'pro',
  status: 'active',
  is_founding: false,
  current_period_end: '2026-10-01T00:00:00.000Z',
  cancel_at_period_end: false,
  billing_interval: 'monthly',
  trial_ends_at: null,
  stripe_customer_id: 'cus_test',
  ...overrides,
})

beforeEach(() => {
  subscriptionRow = {
    plan: 'free',
    status: null,
    is_founding: false,
    current_period_end: null,
    cancel_at_period_end: false,
    billing_interval: null,
    trial_ends_at: null,
    stripe_customer_id: null,
  }
  grantRow = null
  overrideRows = []
})

afterEach(() => {
  vi.resetModules()
})

describe('a free account', () => {
  it('resolves to the free plan and the free level', async () => {
    const result = await resolve()
    expect(result.plan).toBe('free')
    expect(result.level).toBe('free')
    expect(result.billable).toBe(true)
  })

  it('gets the free quotas, not unlimited ones', async () => {
    const result = await resolve()
    expect(result.quotas.person_research).toBe(3)
    expect(result.limits.people).toBe(5)
    expect(result.capabilities.deepResearch).toBe(false)
  })

  it('reports no billing facts at all', async () => {
    const result = await resolve()
    expect(result.billing.status).toBeNull()
    expect(result.billing.interval).toBeNull()
    expect(result.billing.currentPeriodEnd).toBeNull()
    expect(result.billing.hasCustomer).toBe(false)
  })

  it('resolves to free even with no subscription row at all', async () => {
    subscriptionRow = null
    const result = await resolve()
    expect(result.plan).toBe('free')
    expect(result.capabilities.meetingBrief).toBe(true)
  })
})

describe('a paying account', () => {
  it('resolves to Pro and unlocks the paid capabilities', async () => {
    subscriptionRow = paid()
    const result = await resolve()
    expect(result.plan).toBe('pro')
    expect(result.level).toBe('pro')
    expect(result.capabilities.deepResearch).toBe(true)
    expect(result.capabilities.relationshipAtlas).toBe(true)
    expect(result.capabilities.calendarIntegration).toBe(true)
    expect(result.limits.people).toBeNull()
  })

  it('carries the billing facts through for the account screen', async () => {
    subscriptionRow = paid({ billing_interval: 'yearly' })
    const result = await resolve()
    expect(result.billing.interval).toBe('yearly')
    expect(result.billing.currentPeriodEnd).toBe('2026-10-01T00:00:00.000Z')
    expect(result.billing.hasCustomer).toBe(true)
  })

  it('keeps Pro through a failed payment', async () => {
    // Stripe retries a declined card for weeks. Dropping entitlement on the
    // first failure turns an expired card into a cancellation.
    subscriptionRow = paid({ status: 'past_due' })
    expect((await resolve()).plan).toBe('pro')
  })

  it('keeps Pro through a trial', async () => {
    subscriptionRow = paid({ status: 'trialing' })
    expect((await resolve()).plan).toBe('pro')
  })

  it('keeps Pro after a cancellation that has not taken effect yet', async () => {
    // Stripe holds the subscription at 'active' until the period runs out.
    // Somebody who cancels on day two keeps what they paid for.
    subscriptionRow = paid({ cancel_at_period_end: true })
    const result = await resolve()
    expect(result.plan).toBe('pro')
    expect(result.billing.cancelAtPeriodEnd).toBe(true)
  })

  it('drops to free the moment the subscription is actually canceled', async () => {
    subscriptionRow = paid({ status: 'canceled' })
    const result = await resolve()
    expect(result.plan).toBe('free')
    expect(result.capabilities.deepResearch).toBe(false)
    // The status is still reported, so the screen can explain why.
    expect(result.billing.status).toBe('canceled')
  })

  it('drops to free when collection has been given up on', async () => {
    subscriptionRow = paid({ status: 'unpaid' })
    expect((await resolve()).plan).toBe('free')
  })

  it('drops to free for a subscription that never completed', async () => {
    for (const status of ['incomplete', 'incomplete_expired', 'paused']) {
      subscriptionRow = paid({ status })
      expect((await resolve()).plan, status).toBe('free')
    }
  })

  it('ignores a billing_interval it does not recognise rather than showing it', async () => {
    subscriptionRow = paid({ billing_interval: 'fortnightly' })
    expect((await resolve()).billing.interval).toBeNull()
  })
})

describe('an owner', () => {
  beforeEach(() => {
    grantRow = { tier: 'owner', revoked_at: null }
  })

  it('is unrestricted while still being commercially on Free', async () => {
    const result = await resolve()
    expect(result.plan).toBe('free')
    expect(result.tier).toBe('owner')
    expect(result.level).toBe('owner')
  })

  it('has every capability switched on', async () => {
    const result = await resolve()
    for (const [capability, enabled] of Object.entries(result.capabilities)) {
      expect(enabled, capability).toBe(true)
    }
  })

  it('has no quota ceiling anywhere', async () => {
    const result = await resolve()
    for (const [meter, limit] of Object.entries(result.quotas)) {
      expect(limit, meter).toBeNull()
    }
    expect(result.limits.people).toBeNull()
  })

  it('is never billable, so no screen offers it a price', async () => {
    expect((await resolve()).billable).toBe(false)
  })

  it('stays unrestricted even if its subscription lapsed', async () => {
    subscriptionRow = paid({ status: 'canceled' })
    const result = await resolve()
    expect(result.level).toBe('owner')
    expect(result.capabilities.deepResearch).toBe(true)
  })

  it('loses nothing that a paying account has', async () => {
    const owner = await resolve()
    grantRow = null
    subscriptionRow = paid()
    const pro = await resolve()
    for (const capability of Object.keys(pro.capabilities) as Array<
      keyof typeof pro.capabilities
    >) {
      if (!pro.capabilities[capability]) continue
      expect(owner.capabilities[capability], capability).toBe(true)
    }
  })
})

describe('a pilot', () => {
  beforeEach(() => {
    grantRow = { tier: 'pilot', revoked_at: null }
  })

  it('gets full access without being a customer', async () => {
    const result = await resolve()
    expect(result.level).toBe('pilot')
    expect(result.billable).toBe(false)
    expect(result.capabilities.deepResearch).toBe(true)
    expect(result.limits.people).toBeNull()
  })

  it('is still recorded as commercially free', async () => {
    // Metering is untouched by the tier — knowing what the pilot costs is the
    // entire reason to run one.
    expect((await resolve()).plan).toBe('free')
  })
})

describe('a standard account with a support override', () => {
  it('takes the granted limit', async () => {
    overrideRows = [
      { capability: 'person_research', limit_value: 25, enabled: true, expires_at: null },
    ]
    expect((await resolve()).quotas.person_research).toBe(25)
  })

  it('ignores an override that has expired', async () => {
    overrideRows = [
      {
        capability: 'person_research',
        limit_value: 999,
        enabled: true,
        expires_at: '2020-01-01T00:00:00.000Z',
      },
    ]
    expect((await resolve()).quotas.person_research).toBe(3)
  })

  it('can switch a capability on without changing the plan', async () => {
    overrideRows = [
      { capability: 'deepResearch', limit_value: null, enabled: true, expires_at: null },
    ]
    const result = await resolve()
    expect(result.capabilities.deepResearch).toBe(true)
    expect(result.plan).toBe('free')
  })
})

describe('a support override against a full-access account', () => {
  it('cannot switch a capability back off for an owner', async () => {
    // Overrides are applied after the tier. A stale one — written while the
    // account was still standard and then left behind — would otherwise take
    // something away from an account that is supposed to have everything.
    grantRow = { tier: 'owner', revoked_at: null }
    overrideRows = [
      { capability: 'deepResearch', limit_value: null, enabled: false, expires_at: null },
    ]
    expect((await resolve()).capabilities.deepResearch).toBe(true)
  })

  it('cannot narrow a quota the tier set to unlimited', async () => {
    grantRow = { tier: 'pilot', revoked_at: null }
    overrideRows = [
      { capability: 'person_research', limit_value: 2, enabled: true, expires_at: null },
    ]
    expect((await resolve()).quotas.person_research).toBeNull()
  })

  it('still applies to an ordinary account', async () => {
    grantRow = null
    overrideRows = [
      { capability: 'person_research', limit_value: 25, enabled: true, expires_at: null },
    ]
    expect((await resolve()).quotas.person_research).toBe(25)
  })
})
