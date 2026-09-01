import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type Stripe from 'stripe'

/**
 * The webhook.
 *
 * It is the only writer of subscription state, it is reachable by anyone on the
 * internet, and Stripe delivers to it at least once and occasionally out of
 * order. What is tested here is the behaviour that follows from those three
 * facts: nothing is believed without a signature, nothing is done twice, and a
 * failure asks to be retried rather than swallowing a payment.
 */

const SECRET = 'whsec_test_placeholder_not_a_real_secret'

let constructEvent: Mock<(...args: unknown[]) => Promise<unknown>>
let retrieveSubscription: Mock<(...args: unknown[]) => Promise<unknown>>
let retrieveCustomer: Mock<(...args: unknown[]) => Promise<unknown>>
let applySubscription: Mock<(...args: unknown[]) => Promise<string>>
let rpc: Mock<(...args: unknown[]) => Promise<{ data: string | null; error: unknown }>>
let ledger: {
  rows: Map<string, { processed_at: string | null }>
  insertError: { code: string } | null
}
let subscriptionRow: { user_id: string } | null
/** Simulates a deployment with no SUPABASE_SERVICE_ROLE_KEY. */
let serviceRoleThrows: boolean

vi.mock('@/lib/env', () => ({
  serverEnv: { STRIPE_WEBHOOK_SECRET: SECRET },
  features: { billing: true, billingWebhooks: true },
}))

vi.mock('@/lib/billing/stripe', async (importOriginal) => {
  // The pure mapping helpers stay real — subscriptionIdFromInvoice in
  // particular is exactly the kind of thing a mock would paper over.
  const actual = await importOriginal<typeof import('@/lib/billing/stripe')>()
  return {
    ...actual,
    stripe: () => ({
      webhooks: { constructEventAsync: constructEvent },
      subscriptions: { retrieve: retrieveSubscription },
      customers: { retrieve: retrieveCustomer },
    }),
  }
})

vi.mock('@/lib/billing/sync', () => ({
  applyStripeSubscription: (...args: unknown[]) => applySubscription(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => {
    if (serviceRoleThrows) {
      throw new Error('[atturel] SUPABASE_SERVICE_ROLE_KEY is not configured')
    }
    return {
    from(table: string) {
      if (table === 'stripe_webhook_events') {
        return {
          insert: async (row: { id: string }) => {
            if (ledger.insertError) return { error: ledger.insertError }
            if (ledger.rows.has(row.id)) return { error: { code: '23505' } }
            ledger.rows.set(row.id, { processed_at: null })
            return { error: null }
          },
          select: () => ({
            eq: (_column: string, id: string) => ({
              maybeSingle: async () => ({ data: ledger.rows.get(id) ?? null }),
            }),
          }),
          update: (patch: { processed_at: string }) => ({
            eq: async (_column: string, id: string) => {
              const existing = ledger.rows.get(id)
              if (existing) existing.processed_at = patch.processed_at
              return { error: null }
            },
          }),
        }
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: subscriptionRow }) }),
        }),
      }
    },
      rpc: (...args: unknown[]) => rpc(...args),
    }
  },
}))

const UUID = '11111111-2222-4333-8444-555555555555'

function subscription(overrides: Partial<Stripe.Subscription> = {}) {
  return {
    id: 'sub_test',
    customer: 'cus_test',
    status: 'active',
    cancel_at_period_end: false,
    trial_end: null,
    metadata: { user_id: UUID },
    items: { data: [{ price: { id: 'price_monthly' }, current_period_end: 1800000000 }] },
    ...overrides,
  } as unknown as Stripe.Subscription
}

function event(type: string, object: unknown, id = 'evt_test'): Stripe.Event {
  return { id, type, created: 1_700_000_000, data: { object } } as unknown as Stripe.Event
}

function request(body = '{}', signature: string | null = 'sig') {
  return new Request('https://atturel.com/api/stripe/webhook', {
    method: 'POST',
    headers: signature ? { 'stripe-signature': signature } : {},
    body,
  })
}

async function post(body?: string, signature?: string | null) {
  const { POST } = await import('./route')
  return POST(request(body, signature === undefined ? 'sig' : signature))
}

beforeEach(() => {
  constructEvent = vi.fn()
  retrieveSubscription = vi.fn(async () => subscription())
  retrieveCustomer = vi.fn(async () => ({ deleted: false, metadata: {} }))
  applySubscription = vi.fn(async () => 'applied')
  rpc = vi.fn(async () => ({ data: 'applied', error: null }))
  ledger = { rows: new Map(), insertError: null }
  subscriptionRow = null
  serviceRoleThrows = false
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('before anything is believed', () => {
  it('refuses a request with no signature header', async () => {
    const response = await post('{}', null)
    expect(response.status).toBe(400)
    expect(constructEvent).not.toHaveBeenCalled()
  })

  it('refuses a request whose signature does not verify', async () => {
    constructEvent.mockRejectedValue(new Error('No signatures found matching the expected'))
    const response = await post()
    expect(response.status).toBe(400)
    expect(applySubscription).not.toHaveBeenCalled()
  })

  it('verifies against the RAW body, not a re-serialised one', async () => {
    const raw = '{"id":"evt_test","spacing":  "matters"}'
    constructEvent.mockResolvedValue(event('customer.subscription.updated', subscription()))
    await post(raw)
    expect(constructEvent).toHaveBeenCalledWith(raw, 'sig', SECRET)
  })
})

describe('events it does not act on', () => {
  it('acknowledges an unhandled type instead of failing it', async () => {
    constructEvent.mockResolvedValue(event('customer.created', {}))
    const response = await post()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ received: true, handled: false })
    // Not written to the ledger either: Stripe sends dozens of types and the
    // table would fill with rows nothing reads.
    expect(ledger.rows.size).toBe(0)
  })

  it('ignores a one-off payment session with no subscription', async () => {
    constructEvent.mockResolvedValue(
      event('checkout.session.completed', {
        mode: 'payment',
        client_reference_id: UUID,
        subscription: null,
      }),
    )
    const response = await post()
    expect(response.status).toBe(200)
    expect(applySubscription).not.toHaveBeenCalled()
  })
})

describe('duplicate delivery', () => {
  it('does the work once and acknowledges the redelivery', async () => {
    constructEvent.mockResolvedValue(event('customer.subscription.updated', subscription()))

    const first = await post()
    await expect(first.json()).resolves.toMatchObject({ handled: true })
    expect(applySubscription).toHaveBeenCalledTimes(1)

    const second = await post()
    await expect(second.json()).resolves.toMatchObject({ duplicate: true, handled: false })
    // The point of the ledger.
    expect(applySubscription).toHaveBeenCalledTimes(1)
  })

  it('retries an event whose previous attempt never finished', async () => {
    constructEvent.mockResolvedValue(event('customer.subscription.updated', subscription()))
    // A row claimed but never marked processed: the earlier attempt died.
    ledger.rows.set('evt_test', { processed_at: null })

    await post()
    // Replaying is always safer than dropping, because every handler is
    // idempotent and a dropped event is a lost subscription.
    expect(applySubscription).toHaveBeenCalledTimes(1)
  })

  it('processes the event anyway when the ledger itself is unavailable', async () => {
    ledger.insertError = { code: '08006' }
    constructEvent.mockResolvedValue(event('customer.subscription.updated', subscription()))
    await post()
    // A ledger that cannot be written is not a reason to drop a payment.
    expect(applySubscription).toHaveBeenCalledTimes(1)
  })
})

describe('a completed checkout', () => {
  it('re-fetches the subscription rather than trusting the session snapshot', async () => {
    constructEvent.mockResolvedValue(
      event('checkout.session.completed', {
        mode: 'subscription',
        client_reference_id: UUID,
        subscription: 'sub_from_session',
      }),
    )
    await post()
    expect(retrieveSubscription).toHaveBeenCalledWith('sub_from_session')
    expect(applySubscription).toHaveBeenCalledWith(UUID, expect.anything(), 1_700_000_000)
  })

  it('falls back to metadata when client_reference_id is absent', async () => {
    constructEvent.mockResolvedValue(
      event('checkout.session.completed', {
        mode: 'subscription',
        client_reference_id: null,
        metadata: { user_id: UUID },
        subscription: 'sub_x',
      }),
    )
    await post()
    expect(applySubscription).toHaveBeenCalledWith(UUID, expect.anything(), expect.any(Number))
  })

  it('refuses a user id that is not a user id', async () => {
    constructEvent.mockResolvedValue(
      event('checkout.session.completed', {
        mode: 'subscription',
        client_reference_id: "'; drop table subscriptions; --",
        subscription: 'sub_x',
      }),
    )
    const response = await post()
    expect(response.status).toBe(200)
    expect(applySubscription).not.toHaveBeenCalled()
  })
})

describe('subscription lifecycle events', () => {
  const lifecycle = [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.paused',
    'customer.subscription.resumed',
  ]

  for (const type of lifecycle) {
    it(`applies ${type}`, async () => {
      constructEvent.mockResolvedValue(event(type, subscription(), `evt_${type}`))
      const response = await post()
      expect(response.status).toBe(200)
      expect(applySubscription).toHaveBeenCalledWith(UUID, expect.anything(), 1_700_000_000)
    })
  }

  it('finds the account by stored customer id when metadata is missing', async () => {
    subscriptionRow = { user_id: UUID }
    constructEvent.mockResolvedValue(
      event('customer.subscription.updated', subscription({ metadata: {} })),
    )
    await post()
    expect(applySubscription).toHaveBeenCalledWith(UUID, expect.anything(), expect.any(Number))
  })

  it('falls back to the Stripe customer’s own metadata', async () => {
    subscriptionRow = null
    retrieveCustomer.mockResolvedValue({ deleted: false, metadata: { user_id: UUID } })
    constructEvent.mockResolvedValue(
      event('customer.subscription.updated', subscription({ metadata: {} })),
    )
    await post()
    // What lets a subscription created by hand in the Stripe dashboard for an
    // existing customer still land on the right account.
    expect(applySubscription).toHaveBeenCalledWith(UUID, expect.anything(), expect.any(Number))
  })

  it('acknowledges, without acting, a subscription it cannot map to an account', async () => {
    subscriptionRow = null
    retrieveCustomer.mockResolvedValue({ deleted: false, metadata: {} })
    constructEvent.mockResolvedValue(
      event('customer.subscription.updated', subscription({ metadata: {} })),
    )
    const response = await post()
    expect(response.status).toBe(200)
    expect(applySubscription).not.toHaveBeenCalled()
  })
})

describe('invoices', () => {
  it('re-syncs the subscription when a renewal is paid', async () => {
    constructEvent.mockResolvedValue(
      event('invoice.paid', {
        customer: 'cus_test',
        parent: { subscription_details: { subscription: 'sub_renewed' } },
      }),
    )
    await post()
    // This is what advances the renewal date, and what lifts a recovered
    // account back out of past_due.
    expect(retrieveSubscription).toHaveBeenCalledWith('sub_renewed')
    expect(applySubscription).toHaveBeenCalled()
  })

  it('ignores a paid invoice that has no subscription behind it', async () => {
    constructEvent.mockResolvedValue(event('invoice.paid', { customer: 'cus_test', parent: null }))
    await post()
    expect(applySubscription).not.toHaveBeenCalled()
  })

  it('marks a failed payment past_due through the narrow status-only path', async () => {
    constructEvent.mockResolvedValue(
      event('invoice.payment_failed', {
        customer: 'cus_test',
        parent: { subscription_details: { subscription: 'sub_test' } },
      }),
    )
    const response = await post()
    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('mark_stripe_payment_failed', {
      p_stripe_customer_id: 'cus_test',
      p_stripe_subscription_id: 'sub_test',
    })
    // A failed payment must never rewrite plan, price or period.
    expect(applySubscription).not.toHaveBeenCalled()
  })

  it('does not revoke access on a failed payment', async () => {
    constructEvent.mockResolvedValue(
      event('invoice.payment_failed', { customer: 'cus_test', parent: null }),
    )
    await post()
    const [, args] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>]
    // past_due stays entitled. Stripe retries for weeks, and cutting somebody
    // off on one decline is how an expired card becomes a cancellation.
    expect(args.p_stripe_subscription_id).toBeNull()
  })
})

describe('when something goes wrong', () => {
  it('asks Stripe to retry rather than losing a paid upgrade', async () => {
    applySubscription.mockRejectedValue(new Error('database unreachable'))
    constructEvent.mockResolvedValue(event('customer.subscription.updated', subscription()))

    const response = await post()
    expect(response.status).toBe(500)
  })

  it('leaves the failed event unprocessed so the retry is let through', async () => {
    applySubscription.mockRejectedValue(new Error('database unreachable'))
    constructEvent.mockResolvedValue(event('customer.subscription.updated', subscription()))
    await post()
    expect(ledger.rows.get('evt_test')?.processed_at).toBeNull()

    // And the retry now succeeds rather than being dismissed as a duplicate.
    applySubscription.mockResolvedValue('applied')
    const retry = await post()
    expect(retry.status).toBe(200)
    expect(ledger.rows.get('evt_test')?.processed_at).toBeTruthy()
  })
})

describe('a deployment missing its service role key', () => {
  it('reports it as a retryable 500, not as an unhandled exception', async () => {
    // createServiceRoleClient throws rather than quietly running with
    // user-level permissions, and the ledger write is the first thing to hit
    // that -- before the handler's own error boundary. Stripe retries for
    // three days, so setting the key replays the backlog.
    serviceRoleThrows = true
    applySubscription.mockRejectedValue(new Error('service role key missing'))
    constructEvent.mockResolvedValue(event('customer.subscription.updated', subscription()))

    const response = await post()
    expect(response.status).toBe(500)
  })
})
