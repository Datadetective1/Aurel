import 'server-only'
import Stripe from 'stripe'
import { serverEnv, features } from '@/lib/env'
import { brand } from '@/lib/brand'
import type { PlanId } from './plans'
import { mapStripeStatus } from './webhook'

/**
 * STRIPE
 * =============================================================================
 * Everything that knows about Stripe lives here or in the webhook. The rest of
 * the product asks `getEntitlements()` and never learns that payments exist.
 *
 * The client is constructed lazily. Building it at module scope would make an
 * unconfigured deployment crash on import rather than degrade — and running
 * without payments is a supported state, not an error.
 * =============================================================================
 */

let client: Stripe | null = null

export function stripe(): Stripe {
  if (!features.billing) {
    throw new Error('[atturel] Stripe is not configured on this deployment.')
  }
  if (!client) {
    client = new Stripe(serverEnv.STRIPE_SECRET_KEY as string, {
      appInfo: { name: brand.name },
      // Retries are safe here because every call this product makes is either a
      // read or carries an idempotency key.
      maxNetworkRetries: 2,
      timeout: 15_000,
    })
  }
  return client
}

export type BillingInterval = 'monthly'

/** The configured Pro price id, or null when it is not set up. */
export function proPriceId(): string | null {
  return serverEnv.STRIPE_PRICE_PRO_MONTHLY ?? null
}

/**
 * Whether subscribing works end to end on this deployment: Checkout, the
 * price, the webhook that records the subscription, and the service role it
 * writes with. Subscribe to Pro is offered only then -- a button that can only
 * fail is not an offer -- and so is the trial, so it can always end in a real
 * choice.
 */
export function checkoutAvailable(): boolean {
  return Boolean(
    features.billing && features.billingWebhooks && features.serviceRole && proPriceId(),
  )
}

/**
 * Whether a new 14-day trial may be started or advertised: subscribing works,
 * and the deployment has opted in (`PRO_TRIAL_OFFER=on`). Turning it off is
 * the rollback switch, and never touches a trial already running.
 */
export function trialOfferOpen(): boolean {
  return features.proTrialOffer && checkoutAvailable()
}

/**
 * Whether a Stripe price is the one this product sells at the advertised
 * amount: monthly, recurring, in the offer's currency, at the offer's price.
 *
 * Checked before checkout so a misconfigured price id cannot charge a
 * customer something other than what the pricing page told them.
 */
export function priceMatchesOffer(
  price: Pick<Stripe.Price, 'unit_amount' | 'currency' | 'type' | 'active'> & {
    recurring: { interval: string; interval_count: number } | null
  },
  offer: { monthlyPriceCents: number; currency: string },
): boolean {
  return (
    price.active &&
    price.type === 'recurring' &&
    price.recurring?.interval === 'month' &&
    price.recurring.interval_count === 1 &&
    price.currency === offer.currency &&
    price.unit_amount === offer.monthlyPriceCents
  )
}

/**
 * Map a Stripe subscription status onto our own.
 *
 * Kept as an explicit switch rather than a cast: Stripe adds statuses, and a
 * value we have never seen must land somewhere deliberate. Anything unknown is
 * treated as not-entitled, because the failure mode of guessing "active" is
 * giving away paid capability indefinitely.
 */
export function mapStatus(status: Stripe.Subscription.Status): string {
  return mapStripeStatus(status)
}

/**
 * Which plan a price grants.
 *
 * Driven by env rather than by product metadata in Stripe: a price id that is
 * not one of ours must not silently confer Pro, and reading the answer from a
 * remote object we do not control is exactly how that happens.
 */
export function planForPrice(priceId: string | null | undefined): PlanId {
  if (!priceId) return 'free'
  if (priceId === serverEnv.STRIPE_PRICE_PRO_MONTHLY) return 'pro'
  // Recognised so an existing subscription on it is never silently dropped to
  // free. Not offered: there is no annual plan in this launch.
  if (serverEnv.STRIPE_PRICE_PRO_YEARLY && priceId === serverEnv.STRIPE_PRICE_PRO_YEARLY) {
    return 'pro'
  }
  return 'free'
}

/** The interval a known price bills on, for display. */
export function intervalForPrice(priceId: string | null | undefined): 'monthly' | 'yearly' | null {
  if (!priceId) return null
  if (serverEnv.STRIPE_PRICE_PRO_YEARLY && priceId === serverEnv.STRIPE_PRICE_PRO_YEARLY) {
    return 'yearly'
  }
  if (priceId === serverEnv.STRIPE_PRICE_PRO_MONTHLY) return 'monthly'
  return null
}
