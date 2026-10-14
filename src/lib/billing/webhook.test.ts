import { describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import {
  processStripeEvent,
  subscriptionIdOf,
  type ApplyInput,
  type BillingStore,
  type CanonicalRow,
  type ClaimResult,
  type WebhookDeps,
} from './webhook'
import type { SubscriptionTransition } from './subscription-state'

/**
 * The webhook's rules, exercised against an in-memory ledger and canonical
 * row. The store mirrors the SQL: claim_stripe_event's three answers, and the
 * conditional update that refuses an older read.
 */

const PRO_PRICE = 'price_pro_founding'
const USER = '11111111-1111-4111-8111-111111111111'

class MemoryStore implements BillingStore {
  events = new Map<string, { status: string; claimedAt: number }>()
  rows = new Map<string, CanonicalRow & { stripePriceId: string | null }>()
  customers = new Map<string, string>()
  existing = new Set([USER])
  applyCalls = 0

  async claimEvent(event: { id: string }): Promise<ClaimResult> {
    const found = this.events.get(event.id)
    if (!found) {
      this.events.set(event.id, { status: 'processing', claimedAt: Date.now() })
      return 'claimed'
    }
    if (found.status === 'processed' || found.status === 'ignored') return 'duplicate'
    if (found.status === 'processing') return 'in_progress'
    found.status = 'processing'
    return 'claimed'
  }
  async finishEvent(id: string, outcome: { status: string }) {
    this.events.set(id, { status: outcome.status, claimedAt: Date.now() })
  }
  async getRow(userId: string) {
    return this.rows.get(userId) ?? null
  }
  async findUserByCustomer(customerId: string) {
    return this.customers.get(customerId) ?? null
  }
  async userExists(userId: string) {
    return this.existing.has(userId)
  }
  async apply(input: ApplyInput) {
    this.applyCalls++
    const current = this.rows.get(input.userId)
    if (current?.stateAt && current.stateAt >= input.stateAt) return 'stale' as const
    this.rows.set(input.userId, {
      userId: input.userId,
      ...input.state,
      isFounding: input.founding.is_founding,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripePriceId: input.stripePriceId,
      stateAt: input.stateAt,
    })
    this.customers.set(input.stripeCustomerId, input.userId)
    return 'applied' as const
  }
  async countFounding() {
    return [...this.rows.values()].filter((r) => r.isFounding).length
  }
}

function subscription(
  overrides: Partial<Stripe.Subscription> & { price?: string } = {},
): Stripe.Subscription {
  const { price = PRO_PRICE, ...rest } = overrides
  return {
    id: 'sub_1',
    object: 'subscription',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    cancel_at: null,
    trial_end: null,
    metadata: { user_id: USER },
    items: {
      object: 'list',
      data: [
        {
          price: { id: price },
          current_period_end: 1_800_000_000,
        } as unknown as Stripe.SubscriptionItem,
      ],
      has_more: false,
      url: '',
    },
    ...rest,
  } as unknown as Stripe.Subscription
}

function event(id: string, type: string, object: Record<string, unknown>): Stripe.Event {
  return {
    id,
    type,
    livemode: false,
    created: 1_760_000_000,
    data: { object },
  } as unknown as Stripe.Event
}

function setup(remote: { current: Stripe.Subscription }) {
  const store = new MemoryStore()
  const notified: SubscriptionTransition['kind'][] = []
  let clock = 1_760_000_000_000
  const cancelSubscription = vi.fn(async () => {})
  const deps: WebhookDeps = {
    store,
    processor: { retrieveSubscription: async () => remote.current, cancelSubscription },
    planForPrice: (p) => (p === PRO_PRICE ? 'pro' : 'free'),
    intervalForPrice: () => 'monthly',
    notify: async (_u, t) => {
      notified.push(t.kind)
    },
    now: () => new Date((clock += 1000)),
  }
  return { store, notified, deps, cancelSubscription }
}

const checkout = (id = 'evt_checkout') =>
  event(id, 'checkout.session.completed', { client_reference_id: USER, subscription: 'sub_1' })
const updated = (id: string) =>
  event(id, 'customer.subscription.updated', { id: 'sub_1', customer: 'cus_1' })

describe('checkout and subscription creation', () => {
  it('turns Pro on from a completed checkout, re-reading the subscription', async () => {
    const remote = { current: subscription() }
    const { store, notified, deps } = setup(remote)
    const out = await processStripeEvent(checkout(), deps)
    expect(out.status).toBe(200)
    expect(store.rows.get(USER)).toMatchObject({ plan: 'pro', status: 'active' })
    expect(notified).toEqual(['activated'])
  })

  it('assigns no founding status while no founding offer is defined', async () => {
    const remote = { current: subscription() }
    const { store, deps } = setup(remote)
    await processStripeEvent(checkout(), deps)
    expect(store.rows.get(USER)?.isFounding).toBe(false)
  })

  it('never confers Pro for a price that is not ours', async () => {
    const remote = { current: subscription({ price: 'price_someone_elses' }) }
    const { store, notified, deps } = setup(remote)
    await processStripeEvent(checkout(), deps)
    expect(store.rows.get(USER)?.plan).toBe('free')
    expect(notified).toEqual([])
  })
})

describe('idempotency', () => {
  it('applies a duplicate delivery of the same event once, and emails once', async () => {
    const remote = { current: subscription() }
    const { store, notified, deps } = setup(remote)
    await processStripeEvent(checkout('evt_dup'), deps)
    const second = await processStripeEvent(checkout('evt_dup'), deps)
    expect(second).toEqual({
      status: 200,
      body: { received: true, handled: true, duplicate: true },
    })
    expect(store.applyCalls).toBe(1)
    expect(notified).toEqual(['activated'])
  })

  it('answers a concurrent duplicate with a retryable status, never 2xx', async () => {
    const remote = { current: subscription() }
    const { store, deps } = setup(remote)
    store.events.set('evt_busy', { status: 'processing', claimedAt: Date.now() })
    const out = await processStripeEvent(checkout('evt_busy'), deps)
    expect(out.status).toBe(409)
    expect(store.applyCalls).toBe(0)
  })

  it('a replayed state under a new event id changes nothing and sends nothing', async () => {
    const remote = { current: subscription() }
    const { notified, deps } = setup(remote)
    await processStripeEvent(checkout('evt_a'), deps)
    await processStripeEvent(updated('evt_b'), deps)
    expect(notified).toEqual(['activated'])
  })

  it('retries a failed event: the ledger lets a failed claim be taken again', async () => {
    const remote = { current: subscription() }
    const { store, deps } = setup(remote)
    const failing = {
      ...deps,
      processor: {
        ...deps.processor,
        retrieveSubscription: async () => {
          throw new Error('stripe down')
        },
      },
    }
    const first = await processStripeEvent(checkout('evt_retry'), failing)
    expect(first.status).toBe(500)
    expect(store.events.get('evt_retry')?.status).toBe('failed')
    const second = await processStripeEvent(checkout('evt_retry'), deps)
    expect(second.status).toBe(200)
    expect(store.rows.get(USER)?.plan).toBe('pro')
  })

  it('does not ledger event types it ignores', async () => {
    const remote = { current: subscription() }
    const { store, deps } = setup(remote)
    const out = await processStripeEvent(event('evt_x', 'customer.created', {}), deps)
    expect(out.body).toEqual({ received: true, handled: false })
    expect(store.events.size).toBe(0)
  })
})

describe('ordering', () => {
  it('never lets an older read overwrite a newer one', async () => {
    const remote = { current: subscription() }
    const { store, deps } = setup(remote)
    await processStripeEvent(checkout('evt_1'), deps)
    const applied = store.rows.get(USER)!
    // A delivery whose read predates the one already applied.
    const stale = { ...deps, now: () => new Date(Date.parse(applied.stateAt!) - 60_000) }
    remote.current = subscription({ status: 'canceled' })
    await processStripeEvent(updated('evt_old'), stale)
    expect(store.rows.get(USER)?.status).toBe('active')
  })

  it('converges on the current state whatever order events arrive in', async () => {
    // "created" arrives after "deleted": both re-read Stripe, which says canceled.
    const remote = { current: subscription({ status: 'canceled' }) }
    const { store, deps } = setup(remote)
    await processStripeEvent(
      event('evt_del', 'customer.subscription.deleted', { id: 'sub_1' }),
      deps,
    )
    await processStripeEvent(
      event('evt_created', 'customer.subscription.created', { id: 'sub_1' }),
      deps,
    )
    expect(store.rows.get(USER)).toMatchObject({ plan: 'free', status: 'canceled' })
  })
})

describe('renewal, cancellation and failed payment', () => {
  it('a renewal keeps Pro and sends nothing', async () => {
    const remote = { current: subscription() }
    const { notified, deps } = setup(remote)
    await processStripeEvent(checkout(), deps)
    remote.current = subscription({
      items: {
        object: 'list',
        data: [{ price: { id: PRO_PRICE }, current_period_end: 1_802_600_000 } as never],
        has_more: false,
        url: '',
      },
    })
    await processStripeEvent(
      event('evt_paid', 'invoice.paid', {
        parent: { subscription_details: { subscription: 'sub_1' } },
      }),
      deps,
    )
    expect(notified).toEqual(['activated'])
  })

  it('a scheduled cancellation keeps access and says when it ends', async () => {
    const remote = { current: subscription() }
    const { store, notified, deps } = setup(remote)
    await processStripeEvent(checkout(), deps)
    remote.current = subscription({ cancel_at_period_end: true })
    await processStripeEvent(updated('evt_cancel'), deps)
    expect(store.rows.get(USER)).toMatchObject({ plan: 'pro', cancelAtPeriodEnd: true })
    expect(notified).toEqual(['activated', 'cancellation_scheduled'])
  })

  it('the end of the subscription drops the account to Free', async () => {
    const remote = { current: subscription() }
    const { store, notified, deps } = setup(remote)
    await processStripeEvent(checkout(), deps)
    remote.current = subscription({ status: 'canceled' })
    await processStripeEvent(
      event('evt_end', 'customer.subscription.deleted', { id: 'sub_1' }),
      deps,
    )
    expect(store.rows.get(USER)?.plan).toBe('free')
    expect(notified).toEqual(['activated', 'ended'])
  })

  it('a failed payment keeps access while the card is retried, then recovers', async () => {
    const remote = { current: subscription() }
    const { store, notified, deps } = setup(remote)
    await processStripeEvent(checkout(), deps)
    remote.current = subscription({ status: 'past_due' })
    await processStripeEvent(
      event('evt_fail', 'invoice.payment_failed', { subscription: 'sub_1' }),
      deps,
    )
    expect(store.rows.get(USER)).toMatchObject({ plan: 'pro', status: 'past_due' })
    remote.current = subscription({ status: 'active' })
    await processStripeEvent(event('evt_recover', 'invoice.paid', { subscription: 'sub_1' }), deps)
    expect(notified).toEqual(['activated', 'payment_problem', 'payment_recovered'])
  })

  it('an unpaid subscription ends Pro, attributed to payment', async () => {
    const remote = { current: subscription() }
    const { deps } = setup(remote)
    const seen: SubscriptionTransition[] = []
    const watch = {
      ...deps,
      notify: async (_u: string, t: SubscriptionTransition) => void seen.push(t),
    }
    await processStripeEvent(checkout(), watch)
    remote.current = subscription({ status: 'unpaid' })
    await processStripeEvent(updated('evt_unpaid'), watch)
    expect(seen.at(-1)).toEqual({ kind: 'ended', reason: 'payment' })
  })
})

describe('deleted accounts', () => {
  it('cancels a still-billable subscription that arrives for a deleted account', async () => {
    const remote = { current: subscription() }
    const { store, cancelSubscription, deps } = setup(remote)
    store.existing.clear()
    const out = await processStripeEvent(checkout('evt_late'), deps)
    expect(out.status).toBe(200)
    expect(cancelSubscription).toHaveBeenCalledWith('sub_1')
    expect(store.rows.size).toBe(0)
  })

  it('treats the echo of a deletion as nothing to do', async () => {
    const remote = { current: subscription({ status: 'canceled' }) }
    const { store, cancelSubscription, deps } = setup(remote)
    store.existing.clear()
    await processStripeEvent(
      event('evt_echo', 'customer.subscription.deleted', { id: 'sub_1' }),
      deps,
    )
    expect(cancelSubscription).not.toHaveBeenCalled()
  })
})

describe('subscriptionIdOf', () => {
  it('reads the subscription from each event shape', () => {
    expect(subscriptionIdOf(checkout())).toBe('sub_1')
    expect(subscriptionIdOf(updated('e'))).toBe('sub_1')
    expect(
      subscriptionIdOf(
        event('e', 'invoice.paid', { parent: { subscription_details: { subscription: 'sub_9' } } }),
      ),
    ).toBe('sub_9')
    expect(subscriptionIdOf(event('e', 'invoice.paid', { subscription: { id: 'sub_8' } }))).toBe(
      'sub_8',
    )
  })
})
