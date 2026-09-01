import 'server-only'
import Stripe from 'stripe'
import { serverEnv, features } from '@/lib/env'
import { brand } from '@/lib/brand'
import {
  PLANS,
  foundingOfferAdvertisable,
  type BillingInterval,
  type PlanId,
  type SubscriptionStatus,
} from './plans'

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

// Re-exported so the many call sites that reach for it alongside a Stripe
// helper do not have to import from two modules.
export type { BillingInterval }

/** The configured price id for an interval, or null when it is not set up. */
export function priceIdFor(interval: BillingInterval): string | null {
  return interval === 'yearly'
    ? (serverEnv.STRIPE_PRICE_PRO_YEARLY ?? null)
    : (serverEnv.STRIPE_PRICE_PRO_MONTHLY ?? null)
}

/**
 * Every status we store, keyed by the Stripe value that produces it.
 *
 * An exhaustive table rather than a cast: Stripe adds statuses, and a value we
 * have never seen must land somewhere deliberate. Anything unknown is treated
 * as not-entitled, because the failure mode of guessing "active" is giving
 * away paid capability indefinitely.
 */
const KNOWN_STATUSES: Record<string, SubscriptionStatus> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  canceled: 'canceled',
  incomplete: 'incomplete',
  incomplete_expired: 'incomplete_expired',
  unpaid: 'unpaid',
  paused: 'paused',
}

export function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  return KNOWN_STATUSES[status] ?? 'canceled'
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
  if (priceId === serverEnv.STRIPE_PRICE_PRO_YEARLY) return 'pro'
  return 'free'
}

/** The interval a known price bills on, for display and price protection. */
export function intervalForPrice(priceId: string | null | undefined): BillingInterval | null {
  if (!priceId) return null
  if (priceId === serverEnv.STRIPE_PRICE_PRO_YEARLY) return 'yearly'
  if (priceId === serverEnv.STRIPE_PRICE_PRO_MONTHLY) return 'monthly'
  return null
}

/**
 * The subscription an invoice was raised for, or null for a one-off charge.
 *
 * In this API version an invoice no longer carries a top-level `subscription`.
 * The link moved to `parent.subscription_details.subscription`, and code
 * written against the old shape does not fail — it silently reads undefined
 * and treats every renewal as an unrelated charge. Kept in one place so there
 * is one thing to change when it moves again.
 */
export function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription
  if (!subscription) return null
  return typeof subscription === 'string' ? subscription : subscription.id
}

/**
 * Whether the founding price may actually be SOLD, as opposed to merely being
 * switched on.
 *
 * The env half of the guard that `foundingOfferAdvertisable` cannot perform,
 * because plan configuration is shared with the browser bundle and must not
 * read server env. A promotion with no price id behind it charges list price
 * while displaying a discount, which is the failure this pair exists to make
 * impossible: every founding surface asks this before rendering anything.
 *
 * There is deliberately no STRIPE_PRICE_PRO_FOUNDING today, so this is false.
 * Adding that variable and a `priceIdFor('founding')` branch is the whole of
 * what re-enabling the promotion would take.
 */
export function foundingPriceId(): string | null {
  // There is no STRIPE_PRICE_PRO_FOUNDING, and `priceIdFor` has exactly two
  // prices to choose between. This returning null is the thing that keeps
  // every founding surface silent, whatever the promotion config says.
  return null
}

export function foundingOfferSellable(): boolean {
  return foundingOfferAdvertisable(PLANS.pro) && foundingPriceId() !== null
}
