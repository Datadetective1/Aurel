import type Stripe from 'stripe'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { serverEnv, features } from '@/lib/env'
import { logger } from '@/lib/logger'
import { FOUNDING_OFFER } from '@/lib/billing/plans'
import { intervalForPrice, mapStatus, planForPrice, stripe } from '@/lib/billing/stripe'

/**
 * STRIPE WEBHOOK
 * =============================================================================
 * The single writer of subscription state. Checkout redirects prove nothing —
 * a user can navigate to a success URL directly — so entitlement changes come
 * only from a signed event delivered here.
 *
 * Three rules:
 *   1. Verify the signature against the RAW body before parsing anything.
 *   2. Resolve the user from OUR metadata or the stored customer id, never from
 *      an email address, which is attacker-influencable and not unique.
 *   3. Return 2xx for anything permanently unprocessable. Stripe retries 5xx
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
  'invoice.payment_failed',
])

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
    // Acknowledged deliberately. Stripe sends dozens of event types and
    // 400-ing the ones we ignore fills the dashboard with false failures.
    return Response.json({ received: true, handled: false })
  }

  try {
    await handle(event)
  } catch (error) {
    // A 500 asks Stripe to retry, which is right for a transient database
    // failure — the alternative is silently losing a paid upgrade.
    logger.error('billing.webhook_failed', {
      type: event.type,
      id: event.id,
      error: error instanceof Error ? error.name : 'unknown',
    })
    return new Response('Handler failed.', { status: 500 })
  }

  return Response.json({ received: true, handled: true })
}

async function handle(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const userId = session.client_reference_id ?? session.metadata?.user_id
      if (!userId || !session.subscription) return

      // Re-fetch rather than trusting the embedded object: the session snapshot
      // predates any immediate proration or trial adjustment.
      const subscription = await stripe().subscriptions.retrieve(
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id,
      )
      await syncSubscription(userId, subscription)
      return
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object
      const userId = await resolveUserId(subscription)
      if (!userId) {
        logger.warn('billing.webhook_unmatched_customer', { type: event.type })
        return
      }
      await syncSubscription(userId, subscription)
      return
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : null
      if (!customerId) return

      // Status only. Access is not revoked here — Stripe moves the subscription
      // to past_due and then unpaid on its own schedule, and cutting someone off
      // on a single failed charge is how you lose a customer to an expired card.
      const admin = createServiceRoleClient()
      await admin
        .from('subscriptions')
        .update({ status: 'past_due' })
        .eq('stripe_customer_id', customerId)

      logger.info('billing.payment_failed', { customer: customerId })
      return
    }
  }
}

/**
 * Find the account this subscription belongs to.
 *
 * Metadata first (we set it at checkout), then the stored customer id. Email is
 * never used: it is user-supplied, changeable, and matching on it would let
 * someone attach a subscription to an account they do not own.
 */
async function resolveUserId(subscription: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = subscription.metadata?.user_id
  if (fromMetadata) return fromMetadata

  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id

  const admin = createServiceRoleClient()
  const { data } = await admin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  return data?.user_id ?? null
}

async function syncSubscription(
  userId: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  const admin = createServiceRoleClient()

  const item = subscription.items.data[0]
  const priceId = item?.price?.id ?? null
  const status = mapStatus(subscription.status)

  // A cancelled or unpaid subscription drops to free regardless of which price
  // it used to carry.
  const entitled = ['trialing', 'active', 'past_due'].includes(status)
  const plan = entitled ? planForPrice(priceId) : 'free'

  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id

  const periodEnd = item?.current_period_end ?? null

  const { data: existing } = await admin
    .from('subscriptions')
    .select('is_founding, founding_number')
    .eq('user_id', userId)
    .maybeSingle()

  const founding = await resolveFounding(existing, plan)

  const { error } = await admin
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        plan,
        status: status as never,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: subscription.cancel_at_period_end,
        trial_ends_at: subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null,
        billing_interval: intervalForPrice(priceId),
        ...founding,
      },
      { onConflict: 'user_id' },
    )

  if (error) throw new Error(`subscription upsert failed: ${error.code}`)

  logger.info('billing.subscription_synced', { plan, status, founding: founding.is_founding })
}

/**
 * Assign a founding place if the promotion is open and this account has not
 * already been given one.
 *
 * Founding status is sticky: someone who joined at the founding price keeps it
 * through a lapse and a resubscribe. Taking it away for a failed card would be
 * a punitive reading of a promise made at signup.
 */
async function resolveFounding(
  existing: { is_founding: boolean | null; founding_number: number | null } | null,
  plan: string,
): Promise<{ is_founding: boolean; founding_number?: number; price_protected_until?: string }> {
  if (existing?.is_founding) return { is_founding: true }
  if (!FOUNDING_OFFER.enabled || plan === 'free') return { is_founding: false }

  const admin = createServiceRoleClient()
  const { count } = await admin
    .from('subscriptions')
    .select('user_id', { count: 'exact', head: true })
    .eq('is_founding', true)

  const taken = count ?? 0
  if (taken >= FOUNDING_OFFER.maxCustomers) return { is_founding: false }

  const protectedUntil = new Date()
  protectedUntil.setMonth(protectedUntil.getMonth() + FOUNDING_OFFER.priceProtectionMonths)

  return {
    is_founding: true,
    founding_number: taken + 1,
    price_protected_until: protectedUntil.toISOString(),
  }
}
