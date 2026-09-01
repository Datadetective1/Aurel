import 'server-only'
import type Stripe from 'stripe'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { trackFor } from '@/lib/analytics'
import { FOUNDING_OFFER, isEntitledStatus } from './plans'
import { intervalForPrice, mapStatus, planForPrice } from './stripe'

/**
 * SUBSCRIPTION SYNC
 * =============================================================================
 * The one function that turns a Stripe subscription into a row.
 *
 * Two callers, and it matters that they share this rather than each having a
 * version: the webhook, which is the normal path, and the post-checkout
 * reconciliation, which exists only so a customer who has just paid is not
 * shown "Free" while an asynchronous delivery is in flight.
 *
 * All the ordering, locking and founding-place logic lives in the database
 * function this calls — see migration 0017. This side only translates Stripe's
 * vocabulary into ours.
 * =============================================================================
 */

export async function applyStripeSubscription(
  userId: string,
  subscription: Stripe.Subscription,
  /**
   * Stripe's `event.created`, in seconds. Omitted by the reconciliation path,
   * which is not reacting to an event but reading live state — and live state
   * read now is by definition not older than any event already applied.
   */
  eventCreatedSeconds?: number,
): Promise<string> {
  const admin = createServiceRoleClient()

  const item = subscription.items.data[0]
  const priceId = item?.price?.id ?? null
  const status = mapStatus(subscription.status)

  // A cancelled or unpaid subscription drops to free regardless of which price
  // it used to carry.
  const plan = isEntitledStatus(status) ? planForPrice(priceId) : 'free'

  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id

  // In this API version the period lives on the subscription ITEM, not on the
  // subscription. Reading subscription.current_period_end here returns
  // undefined and silently blanks the renewal date.
  const periodEnd = item?.current_period_end ?? null

  const eventAt = eventCreatedSeconds
    ? new Date(eventCreatedSeconds * 1000).toISOString()
    : new Date().toISOString()

  const { data, error } = await admin.rpc('apply_stripe_subscription', {
    p_user_id: userId,
    p_event_at: eventAt,
    p_plan: plan,
    p_status: status as never,
    p_stripe_customer_id: customerId,
    p_stripe_subscription_id: subscription.id,
    p_stripe_price_id: priceId,
    p_current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    p_cancel_at_period_end: subscription.cancel_at_period_end,
    p_trial_ends_at: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
    p_billing_interval: intervalForPrice(priceId),
    // The promotion is configuration, and the database is told the answer
    // rather than holding a second copy of it. 0 switches it off entirely.
    p_founding_max: FOUNDING_OFFER.enabled ? FOUNDING_OFFER.maxCustomers : 0,
    p_founding_protection_months: FOUNDING_OFFER.priceProtectionMonths,
  })

  if (error) throw new Error(`subscription apply failed: ${error.code}`)

  logger.info('billing.subscription_synced', { plan, status, outcome: data })

  // The bottom of the funnel. checkout_started was recorded and nothing
  // recorded what came of it, so the one number the $19/$190 reprice has to be
  // judged by -- started to subscribed -- could not be computed.
  //
  // Only on a transition into a paid plan. The database says which of those
  // this was -- 'upgraded' rather than 'applied' -- because otherwise every
  // subsequent subscription.updated on a Pro account would count as another new
  // subscription, and a stale event the ordering guard refused would count as
  // one too. Scalars only, consistent with the privacy contract.
  if (data === 'upgraded') {
    await trackFor(userId, 'subscription_created', {
      plan,
      status,
      interval: intervalForPrice(priceId) ?? 'unknown',
    })
  }

  return data ?? 'applied'
}
