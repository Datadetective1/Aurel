import type Stripe from 'stripe'
import { FOUNDING_OFFER, type PlanId } from './plans'
import {
  effectivePlan,
  isEntitledStatus,
  transitionsBetween,
  type SubscriptionState,
  type SubscriptionTransition,
} from './subscription-state'

/**
 * STRIPE WEBHOOK, THE PART THAT DECIDES
 * =============================================================================
 * Everything the webhook does after the signature is verified, written against
 * two small interfaces so it can be tested without a network or a database.
 *
 * The rules:
 *
 *   1. LEDGER FIRST. Every event id is claimed in `stripe_events` before any
 *      state changes. A claimed-and-finished event is acknowledged and never
 *      applied again. One being processed elsewhere gets a retryable answer,
 *      never a 2xx -- Stripe stops retrying an event the first time any
 *      delivery succeeds, so acknowledging a duplicate while the original is
 *      still failing would lose the event.
 *
 *   2. RE-READ, DON'T REPLAY. The subscription is fetched from Stripe on every
 *      event rather than taken from the event payload, so events arriving out
 *      of order all converge on the current state. The canonical row records
 *      when that state was read, and an older read never overwrites a newer
 *      one.
 *
 *   3. ATTUREL DECIDES ENTITLEMENT. Stripe says what was paid for; the plan
 *      comes from our own price mapping, and the row in `subscriptions` is
 *      what the product reads.
 *
 *   4. TRANSITIONS FROM ROWS. Emails follow from the difference between the
 *      row before and after, so a duplicate produces no second email.
 * =============================================================================
 */

export const HANDLED_EVENTS = new Set<string>([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
])

const BILLABLE_FOR_DELETED = new Set([
  'trialing',
  'active',
  'past_due',
  'unpaid',
  'incomplete',
  'paused',
])

export type ClaimResult = 'claimed' | 'duplicate' | 'in_progress'

export interface CanonicalRow extends SubscriptionState {
  userId: string
  isFounding: boolean
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  stateAt: string | null
}

export interface ApplyInput {
  userId: string
  state: SubscriptionState
  stripeCustomerId: string
  stripeSubscriptionId: string
  stripePriceId: string | null
  trialEndsAt: string | null
  billingInterval: string | null
  founding: { is_founding: boolean; price_protected_until?: string }
  /** When this state was read from Stripe. Older reads never win. */
  stateAt: string
}

export interface BillingStore {
  claimEvent(event: {
    id: string
    type: string
    livemode: boolean
    created: number
  }): Promise<ClaimResult>
  finishEvent(
    id: string,
    outcome: {
      status: 'processed' | 'ignored' | 'failed'
      userId?: string | null
      errorCode?: string
    },
  ): Promise<void>
  getRow(userId: string): Promise<CanonicalRow | null>
  findUserByCustomer(customerId: string): Promise<string | null>
  /** False when the account no longer exists (deleted). */
  userExists(userId: string): Promise<boolean>
  /** 'stale' when a newer state was already applied. */
  apply(input: ApplyInput): Promise<'applied' | 'stale'>
  countFounding(): Promise<number>
}

export interface BillingProcessor {
  retrieveSubscription(id: string): Promise<Stripe.Subscription>
  cancelSubscription(id: string): Promise<void>
}

export interface WebhookDeps {
  store: BillingStore
  processor: BillingProcessor
  planForPrice: (priceId: string | null) => PlanId
  intervalForPrice: (priceId: string | null) => string | null
  notify: (userId: string, transition: SubscriptionTransition) => Promise<void>
  now?: () => Date
  log?: (event: string, fields: Record<string, unknown>) => void
}

export type WebhookOutcome =
  | { status: 200; body: { received: true; handled: boolean; duplicate?: boolean } }
  | { status: 409; body: { error: 'in_progress' } }
  | { status: 500; body: { error: 'failed' } }

/** The subscription an event is about, when it names one. */
export function subscriptionIdOf(event: Stripe.Event): string | null {
  const object = event.data.object as unknown as Record<string, unknown>
  const ref = (value: unknown): string | null =>
    typeof value === 'string'
      ? value
      : value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string'
        ? (value as { id: string }).id
        : null

  if (event.type === 'checkout.session.completed') return ref(object.subscription)
  if (event.type.startsWith('customer.subscription.')) return ref(object.id)
  if (event.type.startsWith('invoice.')) {
    const parent = object.parent as { subscription_details?: { subscription?: unknown } } | null
    return ref(parent?.subscription_details?.subscription) ?? ref(object.subscription)
  }
  return null
}

function userIdHint(event: Stripe.Event): string | null {
  const object = event.data.object as unknown as {
    client_reference_id?: string | null
    metadata?: Record<string, string> | null
  }
  return object.client_reference_id ?? object.metadata?.user_id ?? null
}

export async function processStripeEvent(
  event: Stripe.Event,
  deps: WebhookDeps,
): Promise<WebhookOutcome> {
  const log = deps.log ?? (() => {})

  if (!HANDLED_EVENTS.has(event.type)) {
    // Acknowledged deliberately, and not ledgered: Stripe sends dozens of
    // types, and recording each one we ignore would be noise.
    return { status: 200, body: { received: true, handled: false } }
  }

  const claim = await deps.store.claimEvent({
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    created: event.created,
  })
  if (claim === 'duplicate') {
    log('billing.webhook_duplicate', { type: event.type })
    return { status: 200, body: { received: true, handled: true, duplicate: true } }
  }
  if (claim === 'in_progress') return { status: 409, body: { error: 'in_progress' } }

  try {
    const result = await handle(event, deps)
    await deps.store.finishEvent(event.id, { status: result.status, userId: result.userId })
    return { status: 200, body: { received: true, handled: result.status === 'processed' } }
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 120) : 'unknown'
    await deps.store.finishEvent(event.id, { status: 'failed', errorCode: code }).catch(() => {})
    log('billing.webhook_failed', { type: event.type, code })
    // A 500 asks Stripe to retry, which is right for a transient failure --
    // the alternative is silently losing a paid upgrade.
    return { status: 500, body: { error: 'failed' } }
  }
}

async function handle(
  event: Stripe.Event,
  deps: WebhookDeps,
): Promise<{ status: 'processed' | 'ignored'; userId: string | null }> {
  const subscriptionId = subscriptionIdOf(event)
  if (!subscriptionId) return { status: 'ignored', userId: null }

  const subscription = await deps.processor.retrieveSubscription(subscriptionId)
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id

  // Our metadata first, then the stored customer id. Never an email address:
  // it is user-supplied and would let someone attach a subscription to an
  // account they do not own.
  const userId =
    subscription.metadata?.user_id ??
    userIdHint(event) ??
    (await deps.store.findUserByCustomer(customerId))
  if (!userId) {
    deps.log?.('billing.webhook_unmatched_customer', { type: event.type })
    return { status: 'ignored', userId: null }
  }

  // An account that no longer exists. Normally the deletion already stopped
  // billing and this is its echo. If the subscription can still bill -- a
  // checkout completed in the moment of deletion -- stop it here: nobody may
  // be charged for an account they deleted.
  if (!(await deps.store.userExists(userId))) {
    if (BILLABLE_FOR_DELETED.has(subscription.status)) {
      await deps.processor.cancelSubscription(subscription.id)
      deps.log?.('billing.canceled_for_deleted_account', { type: event.type })
    }
    return { status: 'ignored', userId }
  }

  const before = await deps.store.getRow(userId)

  const item = subscription.items.data[0]
  const priceId = item?.price?.id ?? null
  const status = mapStripeStatus(subscription.status)
  const plan = isEntitledStatus(status) ? deps.planForPrice(priceId) : 'free'
  const periodEnd = item?.current_period_end ?? null

  const state: SubscriptionState = {
    plan,
    status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end || subscription.cancel_at !== null,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  }

  // One row per account, so an event about a *different* subscription must not
  // overwrite a live one. A late or retried event for an old, canceled
  // subscription -- or an abandoned second checkout -- used to replace an
  // active Pro row and drop a paying customer to Free while Stripe went on
  // charging them. A non-entitling event for another subscription is ignored
  // while the stored one still confers Pro; an entitling one is applied, so a
  // genuine move to a new subscription still lands.
  if (
    before?.stripeSubscriptionId &&
    before.stripeSubscriptionId !== subscription.id &&
    effectivePlan(before) !== 'free' &&
    plan === 'free'
  ) {
    deps.log?.('billing.webhook_superseded_subscription', { type: event.type })
    return { status: 'ignored', userId }
  }

  const founding = await resolveFounding(before, plan, deps)
  const now = (deps.now ?? (() => new Date()))()

  const applied = await deps.store.apply({
    userId,
    state,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    trialEndsAt: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
    billingInterval: deps.intervalForPrice(priceId),
    founding,
    stateAt: now.toISOString(),
  })
  if (applied === 'stale') return { status: 'processed', userId }

  for (const transition of transitionsBetween(before, state)) {
    try {
      await deps.notify(userId, transition)
    } catch {
      // A failed email must not fail the event: the state is already right,
      // and retrying the whole event would not resend it anyway.
    }
  }
  return { status: 'processed', userId }
}

/**
 * Map a Stripe status onto ours. Anything unknown is not-entitled: guessing
 * "active" would give away paid capability indefinitely.
 */
export function mapStripeStatus(status: string): string {
  switch (status) {
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'canceled':
    case 'incomplete':
    case 'incomplete_expired':
    case 'unpaid':
    case 'paused':
      return status
    default:
      return 'canceled'
  }
}

/**
 * Founding status: sticky once given, and given while the offer is open.
 * No cap and no price lock are applied unless FOUNDING_OFFER sets them.
 */
async function resolveFounding(
  existing: CanonicalRow | null,
  plan: PlanId,
  deps: WebhookDeps,
): Promise<{ is_founding: boolean; price_protected_until?: string }> {
  if (existing?.isFounding) return { is_founding: true }
  if (!FOUNDING_OFFER.enabled || plan === 'free') return { is_founding: false }

  if (FOUNDING_OFFER.maxCustomers !== null) {
    const taken = await deps.store.countFounding()
    if (taken >= FOUNDING_OFFER.maxCustomers) return { is_founding: false }
  }

  if (FOUNDING_OFFER.priceProtectionMonths) {
    const until = (deps.now ?? (() => new Date()))()
    until.setMonth(until.getMonth() + FOUNDING_OFFER.priceProtectionMonths)
    return { is_founding: true, price_protected_until: until.toISOString() }
  }
  return { is_founding: true }
}
