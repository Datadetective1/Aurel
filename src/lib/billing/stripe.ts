import 'server-only'
import Stripe from 'stripe'
import { serverEnv, features } from '@/lib/env'
import { brand } from '@/lib/brand'
import type { PlanId } from './plans'

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

export type BillingInterval = 'monthly' | 'yearly'

/** The configured price id for an interval, or null when it is not set up. */
export function priceIdFor(interval: BillingInterval): string | null {
  return interval === 'yearly'
    ? (serverEnv.STRIPE_PRICE_PRO_YEARLY ?? null)
    : (serverEnv.STRIPE_PRICE_PRO_MONTHLY ?? null)
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
