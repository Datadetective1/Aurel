import type Stripe from 'stripe'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { serverEnv, features } from '@/lib/env'
import { logger } from '@/lib/logger'
import { applyStripeSubscription } from '@/lib/billing/sync'
import { stripe, subscriptionIdFromInvoice } from '@/lib/billing/stripe'

/**
 * STRIPE WEBHOOK
 * =============================================================================
 * The single writer of subscription state. Checkout redirects prove nothing —
 * a user can navigate to a success URL directly — so entitlement changes come
 * only from a signed event delivered here.
 *
 * Five rules:
 *   1. Verify the signature against the RAW body before parsing anything.
 *   2. Claim the event id before handling it. Stripe delivers at least once,
 *      and a retry after a timeout is indistinguishable from a first delivery.
 *   3. Resolve the user from OUR metadata or the stored customer id, never from
 *      an email address, which is attacker-influencable and not unique.
 *   4. Apply through apply_stripe_subscription(), which holds a row lock and
 *      refuses an event older than the last one applied. Two events for the
 *      same customer arriving at two Vercel functions at once is the normal
 *      shape of a plan change, not an edge case.
 *   5. Return 2xx for anything permanently unprocessable. Stripe retries 5xx
 *      for days, and an event we will never understand should not become a
 *      retry storm.
 * =============================================================================
 */

export const runtime = 'nodejs'
// The raw body must survive verbatim for signature verification.
export const dynamic = 'force-dynamic'

const HANDLED = new Set<Stripe.Event.Type>([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  // Stripe emits `updated` alongside these, so handling them is belt and
  // braces rather than new behaviour — but a pause that only arrived as
  // `paused` would otherwise leave a paused subscription reading as active.
  'customer.subscription.paused',
  'customer.subscription.resumed',
  // A renewal, and the recovery of a past_due account after a retried charge.
  // Without it a customer whose card failed and then succeeded stays past_due
  // in our database until their next subscription change.
  'invoice.paid',
  'invoice.payment_failed',
])

/** Matches the id format the database expects, so a malformed metadata value
 *  becomes a logged skip rather than a Postgres type error and a retry loop. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  if (!features.billingWebhooks) {
    logger.warn('billing.webhook_unconfigured')
    return new Response('Billing is not configured.', { status: 503 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) return new Response('Missing signature.', { status: 400 })

  const raw = await request.text()

  let event: Stripe.Event
  try {
    event = await stripe().webhooks.constructEventAsync(
      raw,
      signature,
      serverEnv.STRIPE_WEBHOOK_SECRET as string,
    )
  } catch (error) {
    // An invalid signature is either a misconfiguration or a forgery attempt.
    // Never log the body: it contains customer details.
    logger.warn('billing.webhook_bad_signature', {
      error: error instanceof Error ? error.name : 'unknown',
    })
    return new Response('Invalid signature.', { status: 400 })
  }

  if (!HANDLED.has(event.type)) {
    // Acknowledged deliberately, and not written to the ledger: Stripe sends
    // dozens of event types, 400-ing the ones we ignore fills the dashboard
    // with false failures, and recording them would fill a table with rows
    // nothing ever reads.
    return Response.json({ received: true, handled: false })
  }

  const claim = await claimEvent(event)
  if (claim === 'duplicate') {
    logger.info('billing.webhook_duplicate', { type: event.type, id: event.id })
    return Response.json({ received: true, handled: false, duplicate: true })
  }

  let outcome: string
  try {
    outcome = await handle(event)
  } catch (error) {
    // A 500 asks Stripe to retry, which is right for a transient database
    // failure — the alternative is silently losing a paid upgrade. The ledger
    // row stays unprocessed, so the retry is allowed through rather than
    // dismissed as a duplicate.
    logger.error('billing.webhook_failed', {
      type: event.type,
      id: event.id,
      error: error instanceof Error ? error.name : 'unknown',
    })
    return new Response('Handler failed.', { status: 500 })
  }

  await markProcessed(event.id, outcome)
  return Response.json({ received: true, handled: true, outcome })
}

/**
 * Record this event id before doing anything with it.
 *
 * An existing row that was never marked processed is NOT treated as "someone
 * else has this". It means a previous attempt died mid-flight, and Stripe is
 * right to retry: every handler below is idempotent, so replaying is always
 * safer than dropping.
 */
async function claimEvent(event: Stripe.Event): Promise<'claimed' | 'duplicate'> {
  try {
    const admin = createServiceRoleClient()

    const { error } = await admin.from('stripe_webhook_events').insert({
      id: event.id,
      type: event.type,
      event_created_at: new Date(event.created * 1000).toISOString(),
    })

    if (!error) return 'claimed'

    // 23505 is a unique violation: we have seen this event id before.
    if (error.code !== '23505') {
      // A ledger that cannot be written is not a reason to drop a payment.
      // Process the event; the cost of a rare double-apply is nil, because
      // applying the same subscription state twice is the same state.
      logger.warn('billing.webhook_ledger_unavailable', { code: error.code })
      return 'claimed'
    }

    const { data } = await admin
      .from('stripe_webhook_events')
      .select('processed_at')
      .eq('id', event.id)
      .maybeSingle()

    return data?.processed_at ? 'duplicate' : 'claimed'
  } catch (error) {
    // Most likely SUPABASE_SERVICE_ROLE_KEY is missing, which createServiceRoleClient
    // throws for rather than quietly running with user-level permissions. Fall
    // through to the handler so that failure is reported once, as a logged 500
    // Stripe will retry, instead of as an unhandled exception here.
    logger.warn('billing.webhook_ledger_unavailable', {
      error: error instanceof Error ? error.name : 'unknown',
    })
    return 'claimed'
  }
}

async function markProcessed(id: string, outcome: string): Promise<void> {
  try {
    const admin = createServiceRoleClient()
    await admin
      .from('stripe_webhook_events')
      .update({ processed_at: new Date().toISOString(), outcome })
      .eq('id', id)
  } catch (error) {
    // The work is done. Failing to write the receipt only risks re-doing
    // idempotent work on a redelivery, which is not worth a 500.
    logger.warn('billing.webhook_receipt_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
  }
}

async function handle(event: Stripe.Event): Promise<string> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      // A one-off payment session has no subscription to sync. Nothing in this
      // product creates one, but the endpoint is public and the account may
      // grow other products later.
      if (session.mode !== 'subscription') return 'not_subscription'

      const userId = normaliseUserId(session.client_reference_id ?? session.metadata?.user_id)
      if (!userId || !session.subscription) return 'unmatched'

      // Re-fetch rather than trusting the embedded object: the session snapshot
      // predates any immediate proration or trial adjustment.
      const subscription = await stripe().subscriptions.retrieve(
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id,
      )
      return applyStripeSubscription(userId, subscription, event.created)
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed': {
      const subscription = event.data.object
      const userId = await resolveUserId(subscription)
      if (!userId) {
        logger.warn('billing.webhook_unmatched_customer', { type: event.type })
        return 'unmatched'
      }
      return applyStripeSubscription(userId, subscription, event.created)
    }

    case 'invoice.paid': {
      const invoice = event.data.object
      const subscriptionId = subscriptionIdFromInvoice(invoice)
      // An invoice with no subscription parent is a one-off charge.
      if (!subscriptionId) return 'not_subscription'

      // The invoice says money moved; the subscription says what that bought.
      // Re-reading it is what advances current_period_end on a renewal and
      // what lifts a recovered account back out of past_due.
      const subscription = await stripe().subscriptions.retrieve(subscriptionId)
      const userId = await resolveUserId(subscription)
      if (!userId) {
        logger.warn('billing.webhook_unmatched_customer', { type: event.type })
        return 'unmatched'
      }
      return applyStripeSubscription(userId, subscription, event.created)
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : null
      if (!customerId) return 'unmatched'

      // Status only, and only for an account currently on a paid status.
      // Access is not revoked here — Stripe moves the subscription to past_due
      // and then unpaid on its own schedule, and cutting someone off on a
      // single failed charge is how you lose a customer to an expired card.
      const admin = createServiceRoleClient()
      const { data, error } = await admin.rpc('mark_stripe_payment_failed', {
        p_stripe_customer_id: customerId,
        p_stripe_subscription_id: subscriptionIdFromInvoice(invoice),
      })

      if (error) throw new Error(`payment_failed update failed: ${error.code}`)

      logger.info('billing.payment_failed', { customer: customerId, outcome: data })
      return data ?? 'applied'
    }
  }

  return 'ignored'
}

/** Narrow a metadata value to something the database will accept as a user id. */
function normaliseUserId(value: string | null | undefined): string | null {
  if (!value) return null
  return UUID.test(value) ? value : null
}

/**
 * Find the account this subscription belongs to.
 *
 * Metadata first (we set it at checkout), then the stored customer id, then the
 * Stripe customer's own metadata — which checkout also stamps, and which is
 * what lets a subscription created by hand in the Stripe dashboard for an
 * existing customer still land on the right account.
 *
 * Email is never used: it is user-supplied, changeable, and matching on it
 * would let someone attach a subscription to an account they do not own.
 */
async function resolveUserId(subscription: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = normaliseUserId(subscription.metadata?.user_id)
  if (fromMetadata) return fromMetadata

  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id

  const admin = createServiceRoleClient()
  const { data } = await admin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  if (data?.user_id) return data.user_id

  try {
    const customer = await stripe().customers.retrieve(customerId)
    if (!customer.deleted) return normaliseUserId(customer.metadata?.user_id)
  } catch (error) {
    logger.warn('billing.customer_lookup_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
  }

  return null
}
