import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

/**
 * Checkout and the billing portal.
 *
 * These two actions are the entire attack surface of the paywall from a
 * browser's point of view, so what is tested is mostly what they REFUSE: an
 * arbitrary price, an account that is not a customer, a portal for somebody
 * else's Stripe customer, a second subscription for someone who already pays.
 */

const MONTHLY = 'price_test_monthly_placeholder'
const YEARLY = 'price_test_yearly_placeholder'
const UUID = '11111111-2222-4333-8444-555555555555'

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`)
  }
}

let user: { id: string; email: string | null } | null
let entitlements: { plan: string; billable: boolean }
let subscriptionRow: Record<string, unknown> | null
let profileRow: Record<string, unknown> | null
type Args = Record<string, unknown>
let createSession: Mock<(args: Args, options?: Args) => Promise<{ url: string }>>
let createPortal: Mock<(args: Args) => Promise<{ url: string }>>
let createCustomer: Mock<(args: Args, options?: Args) => Promise<{ id: string }>>
let retrieveCustomer: Mock<(id: string) => Promise<{ deleted: boolean }>>
let searchCustomers: Mock<(args: Args) => Promise<{ data: Array<{ id: string }> }>>

/** The arguments one of these mocks was called with, without the optionality
 *  noise -- every use here follows an assertion that the call happened. */
function callArgs<T extends unknown[]>(mock: { mock: { calls: T[] } }, index = 0): T {
  const call = mock.mock.calls[index]
  if (!call) throw new Error('expected the mock to have been called')
  return call
}
let billingEnabled: boolean

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirected(to)
  },
}))

vi.mock('@/lib/auth', () => ({
  requireUser: async () => {
    if (!user) throw new Redirected('/sign-in')
    return user
  },
  getOptionalUser: async () => user,
}))

vi.mock('@/lib/billing/entitlements', () => ({
  getEntitlements: async () => entitlements,
}))

vi.mock('@/lib/env', () => ({
  get features() {
    return {
      billing: billingEnabled,
      billingWebhooks: billingEnabled,
      // What the money path actually asks for: secret key, both price ids,
      // webhook secret and service role key all present.
      billingCheckout: billingEnabled,
    }
  },
  serverEnv: {},
}))

vi.mock('@/lib/analytics', () => ({ track: async () => {} }))

vi.mock('@/lib/billing/sync', () => ({ applyStripeSubscription: async () => 'applied' }))

vi.mock('@/lib/billing/checkout-intent', () => ({
  rememberCheckoutIntent: async () => {},
  intentDestination: (interval: string) => `/settings/billing?intent=${interval}`,
}))

vi.mock('@/lib/billing/stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/stripe')>()
  return {
    ...actual,
    priceIdFor: (interval: string) => (interval === 'yearly' ? YEARLY : MONTHLY),
    stripe: () => ({
      checkout: { sessions: { create: createSession } },
      billingPortal: { sessions: { create: createPortal } },
      customers: {
        create: createCustomer,
        retrieve: retrieveCustomer,
        search: searchCustomers,
      },
      subscriptions: { list: async () => ({ data: [] }) },
    }),
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === 'profiles' ? profileRow : subscriptionRow,
          }),
        }),
      }),
    }),
  }),
  createServiceRoleClient: () => ({
    from: () => ({
      update: () => ({ eq: () => ({ is: async () => ({ error: null }) }) }),
    }),
  }),
}))

async function load() {
  return import('./actions')
}

function form(entries: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

/** Runs an action that is expected to redirect, and returns where it went. */
async function destinationOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (error) {
    if (error instanceof Redirected) return error.to
    throw error
  }
  throw new Error('expected a redirect, and none happened')
}

beforeEach(() => {
  user = { id: UUID, email: 'someone@example.com' }
  entitlements = { plan: 'free', billable: true }
  subscriptionRow = { stripe_customer_id: null, plan: 'free', status: null }
  profileRow = { onboarding_completed_at: '2026-01-01T00:00:00.000Z' }
  billingEnabled = true
  createSession = vi.fn(async () => ({ url: 'https://checkout.stripe.com/c/pay/session' }))
  createPortal = vi.fn(async () => ({ url: 'https://billing.stripe.com/p/session' }))
  createCustomer = vi.fn(async () => ({ id: 'cus_created' }))
  retrieveCustomer = vi.fn(async () => ({ deleted: false }))
  searchCustomers = vi.fn(async () => ({ data: [] }))
})

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('which price gets charged', () => {
  it('uses the configured monthly price for a monthly request', async () => {
    const { startCheckout } = await load()
    await destinationOf(() => startCheckout({}, form({ interval: 'monthly' })))
    expect(callArgs(createSession)[0].line_items).toEqual([{ price: MONTHLY, quantity: 1 }])
  })

  it('uses the configured annual price for a yearly request', async () => {
    const { startCheckout } = await load()
    await destinationOf(() => startCheckout({}, form({ interval: 'yearly' })))
    expect(callArgs(createSession)[0].line_items).toEqual([{ price: YEARLY, quantity: 1 }])
  })

  it('NEVER accepts a price id from the client', async () => {
    const { startCheckout } = await load()
    await destinationOf(() =>
      startCheckout(
        {},
        form({ interval: 'monthly', price: 'price_attacker_owned', priceId: 'price_free_forever' }),
      ),
    )
    // The form said two other things. Neither reached Stripe.
    const sent = callArgs(createSession)[0]
    expect(sent.line_items).toEqual([{ price: MONTHLY, quantity: 1 }])
    expect(JSON.stringify(sent)).not.toContain('attacker')
  })

  it('falls back to monthly for an interval it does not recognise', async () => {
    const { startCheckout } = await load()
    await destinationOf(() => startCheckout({}, form({ interval: 'per-fortnight' })))
    expect(callArgs(createSession)[0].line_items).toEqual([{ price: MONTHLY, quantity: 1 }])
  })

  it('subscribes rather than taking a one-off payment', async () => {
    const { startCheckout } = await load()
    await destinationOf(() => startCheckout({}, form({ interval: 'monthly' })))
    expect(callArgs(createSession)[0].mode).toBe('subscription')
  })
})

describe('who is allowed to check out', () => {
  it('sends a signed-out visitor to sign in rather than to Stripe', async () => {
    user = null
    const { startCheckout } = await load()
    expect(await destinationOf(() => startCheckout({}, form({ interval: 'monthly' })))).toBe(
      '/sign-in',
    )
    expect(createSession).not.toHaveBeenCalled()
  })

  it('refuses an owner, who would otherwise start paying for their own product', async () => {
    entitlements = { plan: 'free', billable: false }
    const { startCheckout } = await load()
    const result = await startCheckout({}, form({ interval: 'monthly' }))
    expect(result.error).toMatch(/full access/i)
    expect(createSession).not.toHaveBeenCalled()
  })

  it('refuses somebody who already pays', async () => {
    subscriptionRow = { stripe_customer_id: 'cus_x', plan: 'pro', status: 'active' }
    const { startCheckout } = await load()
    const result = await startCheckout({}, form({ interval: 'monthly' }))
    expect(result.error).toMatch(/already on Pro/i)
  })

  it('refuses somebody mid-trial', async () => {
    subscriptionRow = { stripe_customer_id: 'cus_x', plan: 'pro', status: 'trialing' }
    const { startCheckout } = await load()
    expect((await startCheckout({}, form({ interval: 'monthly' }))).error).toMatch(
      /already on Pro/i,
    )
  })

  it('refuses somebody whose card is failing, who would end up paying twice', async () => {
    // past_due is still a live subscription that Stripe is retrying. A second
    // checkout leaves them with two.
    subscriptionRow = { stripe_customer_id: 'cus_x', plan: 'pro', status: 'past_due' }
    const { startCheckout } = await load()
    expect((await startCheckout({}, form({ interval: 'monthly' }))).error).toMatch(
      /already on Pro/i,
    )
  })

  it('lets somebody who cancelled subscribe again', async () => {
    subscriptionRow = { stripe_customer_id: 'cus_x', plan: 'free', status: 'canceled' }
    const { startCheckout } = await load()
    await destinationOf(() => startCheckout({}, form({ interval: 'monthly' })))
    expect(createSession).toHaveBeenCalled()
  })

  it('says so plainly on a deployment with no Stripe keys', async () => {
    billingEnabled = false
    const { startCheckout } = await load()
    expect((await startCheckout({}, form({ interval: 'monthly' }))).error).toMatch(/not connected/i)
  })
})

describe('mapping the session back to the account', () => {
  it('stamps the user id everywhere the webhook might look for it', async () => {
    const { startCheckout } = await load()
    await destinationOf(() => startCheckout({}, form({ interval: 'monthly' })))
    const sent = callArgs(createSession)[0]
    expect(sent.client_reference_id).toBe(UUID)
    expect(sent.metadata).toEqual({ user_id: UUID })
    expect(sent.subscription_data).toEqual({ metadata: { user_id: UUID } })
  })

  it('returns to our own origin, never to a URL from the request', async () => {
    const { startCheckout } = await load()
    await destinationOf(() =>
      startCheckout({}, form({ interval: 'monthly', next: 'https://evil.example' })),
    )
    const sent = callArgs(createSession)[0]
    expect(sent.success_url).toMatch(/^https?:\/\/[^/]+\/settings\/billing\?checkout=success$/)
    expect(sent.cancel_url).toMatch(/^https?:\/\/[^/]+\/settings\/billing\?checkout=canceled$/)
    expect(JSON.stringify(sent)).not.toContain('evil.example')
  })
})

describe('not making a second Stripe customer', () => {
  it('reuses the customer already on file', async () => {
    subscriptionRow = { stripe_customer_id: 'cus_known', plan: 'free', status: null }
    const { startCheckout } = await load()
    await destinationOf(() => startCheckout({}, form({ interval: 'monthly' })))
    expect(createCustomer).not.toHaveBeenCalled()
    expect(callArgs(createSession)[0].customer).toBe('cus_known')
  })

  it('recovers a customer a previous attempt made but never recorded', async () => {
    searchCustomers.mockResolvedValue({ data: [{ id: 'cus_orphaned' }] })
    const { startCheckout } = await load()
    await destinationOf(() => startCheckout({}, form({ interval: 'monthly' })))
    // Without this, an abandoned first attempt leaves a second customer and a
    // billing history split across both.
    expect(createCustomer).not.toHaveBeenCalled()
    expect(callArgs(createSession)[0].customer).toBe('cus_orphaned')
  })

  it('creates one under an idempotency key when there is genuinely none', async () => {
    const { startCheckout } = await load()
    await destinationOf(() => startCheckout({}, form({ interval: 'monthly' })))
    expect(createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { user_id: UUID } }),
      { idempotencyKey: `customer:${UUID}` },
    )
  })

  it('makes a new one when the stored customer was deleted in Stripe', async () => {
    subscriptionRow = { stripe_customer_id: 'cus_deleted', plan: 'free', status: null }
    retrieveCustomer.mockResolvedValue({ deleted: true })
    const { startCheckout } = await load()
    await destinationOf(() => startCheckout({}, form({ interval: 'monthly' })))
    // Passing a deleted customer to checkout fails the whole session, and the
    // customer sees that as a payment error.
    expect(createCustomer).toHaveBeenCalled()
  })

  it('survives the customer search being unavailable', async () => {
    searchCustomers.mockRejectedValue(new Error('search index not ready'))
    const { startCheckout } = await load()
    await destinationOf(() => startCheckout({}, form({ interval: 'monthly' })))
    expect(createSession).toHaveBeenCalled()
  })

  it('does not repeat one checkout session for a double submit', async () => {
    const { startCheckout } = await load()
    await destinationOf(() => startCheckout({}, form({ interval: 'monthly' })))
    const key = callArgs(createSession)[1]!.idempotencyKey as string
    expect(key).toMatch(new RegExp(`^checkout:${UUID}:monthly:\\d+$`))
    // Bucketed, not per-day: a day-long key hands somebody who cancelled and
    // came back a URL for a session Stripe has moved on from.
    const bucket = Number(key.split(':').pop())
    expect(Math.abs(bucket - Math.floor(Date.now() / 60_000))).toBeLessThanOrEqual(1)
  })
})

describe('picking a plan from the public pricing page', () => {
  it('sends a signed-out visitor to sign up, carrying the choice', async () => {
    user = null
    const { choosePlan } = await load()
    expect(await destinationOf(() => choosePlan({}, form({ interval: 'yearly' })))).toBe(
      '/sign-up?next=%2Fsettings%2Fbilling%3Fintent%3Dyearly',
    )
  })

  it('sends a half-onboarded account to finish onboarding first', async () => {
    profileRow = { onboarding_completed_at: null }
    const { choosePlan } = await load()
    expect(await destinationOf(() => choosePlan({}, form({ interval: 'monthly' })))).toBe(
      '/onboarding',
    )
    expect(createSession).not.toHaveBeenCalled()
  })

  it('sends a signed-in, onboarded customer straight to Stripe', async () => {
    const { choosePlan } = await load()
    const to = await destinationOf(() => choosePlan({}, form({ interval: 'monthly' })))
    expect(to).toBe('https://checkout.stripe.com/c/pay/session')
  })
})

describe('the billing portal', () => {
  it('opens the portal for the caller’s own customer', async () => {
    subscriptionRow = { stripe_customer_id: 'cus_mine' }
    const { openBillingPortal } = await load()
    const to = await destinationOf(() => openBillingPortal())
    expect(createPortal).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_mine' }))
    expect(to).toBe('https://billing.stripe.com/p/session')
  })

  it('takes no customer id from the caller, so there is nothing to point elsewhere', async () => {
    subscriptionRow = { stripe_customer_id: 'cus_mine' }
    const { openBillingPortal } = await load()
    // The action takes no arguments at all. That is the authorization.
    expect(openBillingPortal.length).toBe(0)
    await destinationOf(() => openBillingPortal())
    expect(callArgs(createPortal)[0].customer).toBe('cus_mine')
  })

  it('sends a signed-out visitor to sign in', async () => {
    user = null
    const { openBillingPortal } = await load()
    expect(await destinationOf(() => openBillingPortal())).toBe('/sign-in')
    expect(createPortal).not.toHaveBeenCalled()
  })

  it('says there is nothing to manage when Stripe has never seen this account', async () => {
    subscriptionRow = { stripe_customer_id: null }
    const { openBillingPortal } = await load()
    expect((await openBillingPortal()).error).toMatch(/no billing account/i)
  })

  it('names the real problem when the portal has never been configured', async () => {
    subscriptionRow = { stripe_customer_id: 'cus_mine' }
    createPortal.mockRejectedValue(
      new Error(
        'No configuration provided and your test mode default configuration has not been created.',
      ),
    )
    const { openBillingPortal } = await load()
    // Every new Stripe account fails this way once. The generic message sent
    // customers to support for something only the operator can fix.
    expect((await openBillingPortal()).error).toMatch(/not set up yet/i)
  })

  it('returns to our own origin', async () => {
    subscriptionRow = { stripe_customer_id: 'cus_mine' }
    const { openBillingPortal } = await load()
    await destinationOf(() => openBillingPortal())
    expect(callArgs(createPortal)[0].return_url).toMatch(/^https?:\/\/[^/]+\/settings\/billing$/)
  })
})

describe('reconciling after a checkout redirect', () => {
  it('reports what the database actually holds, not what it hoped for', async () => {
    // A subscription against a price that is not one of ours resolves to free.
    // The success banner reads this, so an optimistic 'pro' here would announce
    // a plan the customer does not have.
    subscriptionRow = { stripe_customer_id: 'cus_mine', plan: 'free', status: null }
    const { reconcileSubscription } = await load()
    const result = await reconcileSubscription()
    expect(result.plan).toBe('free')
    expect(result.changed).toBe(false)
  })

  it('does nothing for an account Stripe has never seen', async () => {
    subscriptionRow = { stripe_customer_id: null, plan: 'free', status: null }
    const { reconcileSubscription } = await load()
    expect(await reconcileSubscription()).toEqual({ plan: 'free', changed: false })
  })

  it('does nothing for an owner, who has no subscription to find', async () => {
    entitlements = { plan: 'free', billable: false }
    const { reconcileSubscription } = await load()
    expect(await reconcileSubscription()).toEqual({ plan: 'free', changed: false })
  })

  it('does nothing on a deployment with no Stripe keys', async () => {
    billingEnabled = false
    const { reconcileSubscription } = await load()
    expect(await reconcileSubscription()).toEqual({ plan: 'free', changed: false })
  })
})
