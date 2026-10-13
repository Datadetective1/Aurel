'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { absoluteUrl, brand } from '@/lib/brand'
import { features } from '@/lib/env'
import { logger } from '@/lib/logger'
import { track } from '@/lib/analytics'
import { FOUNDING_OFFER } from '@/lib/billing/plans'
import { priceMatchesOffer, proPriceId, stripe } from '@/lib/billing/stripe'

/**
 * CHECKOUT AND PORTAL
 * =============================================================================
 * Two server actions, both of which end in a redirect to Stripe. Neither ever
 * writes an entitlement: the webhook is the only thing that may change a plan,
 * because a client that can grant itself Pro by finishing a redirect has no
 * paywall at all.
 * =============================================================================
 */

export interface BillingState {
  error?: string
}

const ENTITLED = ['trialing', 'active', 'past_due']

export async function startCheckout(
  _prev: BillingState,
  _formData: FormData,
): Promise<BillingState> {
  const unavailable = { error: 'Upgrading is not available right now. Nothing was charged.' }
  if (!features.billing) return unavailable

  const priceId = proPriceId()
  if (!priceId) return unavailable

  const user = await requireUser()
  const supabase = await createClient()

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id, plan, status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (subscription?.plan === 'pro' && ENTITLED.includes(subscription.status ?? '')) {
    return { error: 'You are already on Pro. Use Manage billing to change your plan.' }
  }

  let url: string | null = null

  try {
    // The price the page advertises is the price Stripe will charge, or
    // checkout does not start. A wrong price id in configuration must fail
    // here, loudly, and never on a customer's card.
    const price = await stripe().prices.retrieve(priceId)
    if (!priceMatchesOffer(price, FOUNDING_OFFER)) {
      logger.error('billing.price_mismatch', {
        expectedCents: FOUNDING_OFFER.monthlyPriceCents,
        currency: price.currency,
        interval: price.recurring?.interval ?? 'none',
        active: price.active,
      })
      return unavailable
    }

    const customer = await ensureCustomer(
      user.id,
      user.email ?? null,
      subscription?.stripe_customer_id,
    )

    const session = await stripe().checkout.sessions.create(
      {
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        // Always our own customer: one billing history per account, and the
        // id is known before payment, so a deletion mid-checkout can still
        // find and stop it.
        ...(customer ? { customer } : { customer_email: user.email ?? undefined }),

        // The webhook trusts this, not the redirect, to know whose plan changed.
        client_reference_id: user.id,
        subscription_data: { metadata: { user_id: user.id } },
        metadata: { user_id: user.id },

        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        automatic_tax: { enabled: false },

        success_url: absoluteUrl('/settings/billing?checkout=success'),
        cancel_url: absoluteUrl('/settings/billing?checkout=canceled'),
      },
      // Idempotent per user per day: a double-submitted form must not create
      // two sessions, let alone two subscriptions.
      { idempotencyKey: `checkout:${user.id}:${priceId}:${new Date().toISOString().slice(0, 10)}` },
    )

    url = session.url
  } catch (error) {
    logger.error('billing.checkout_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
    return { error: 'We could not start checkout. Nothing was charged. Try again in a moment.' }
  }

  if (!url) return { error: 'Checkout could not be opened. Nothing was charged.' }

  await track('checkout_started', { interval: 'monthly' })
  // Outside the try: redirect() signals by throwing, and catching it here would
  // report a successful redirect as a checkout failure.
  redirect(url)
}

/**
 * The Stripe customer for this account, created once and remembered.
 *
 * Stored on the account's subscription row (plan unchanged) so a returning
 * subscriber never accumulates duplicate customers, and so account deletion
 * can find every subscription even if a checkout completed moments before.
 * Without the service role the row cannot be written; checkout then falls
 * back to letting Stripe create the customer, as it always did.
 */
async function ensureCustomer(
  userId: string,
  email: string | null,
  existing: string | null | undefined,
): Promise<string | null> {
  if (existing) return existing
  if (!features.serviceRole) return null

  const created = await stripe().customers.create(
    { email: email ?? undefined, metadata: { user_id: userId } },
    { idempotencyKey: `customer:${userId}` },
  )
  const admin = createServiceRoleClient()
  const { error } = await admin
    .from('subscriptions')
    .upsert({ user_id: userId, stripe_customer_id: created.id }, { onConflict: 'user_id' })
  if (error) {
    logger.warn('billing.customer_store_failed', { code: error.code })
  }
  return created.id
}

/**
 * Send an existing subscriber to Stripe's billing portal.
 *
 * Card details, invoices and cancellation all live there rather than being
 * rebuilt here — handling a card number in this codebase would drag the whole
 * product into PCI scope for no user benefit.
 */
export async function openBillingPortal(): Promise<BillingState> {
  if (!features.billing) {
    return { error: 'Billing is not available right now.' }
  }

  const user = await requireUser()
  const supabase = await createClient()

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!subscription?.stripe_customer_id) {
    return { error: 'There is no billing account to manage yet.' }
  }

  let url: string
  try {
    const session = await stripe().billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: absoluteUrl('/settings/billing'),
    })
    url = session.url
  } catch (error) {
    logger.error('billing.portal_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
    return { error: `We could not open the billing portal. Email ${brand.email.support}.` }
  }

  redirect(url)
}

/**
 * How many founding places are left, or null when the offer has no cap.
 *
 * Counted from real subscriptions rather than a stored number, so the offer
 * cannot claim scarcity it does not have -- and with no approved cap, it
 * claims none at all.
 */
export async function foundingPlacesRemaining(): Promise<number | null> {
  if (!FOUNDING_OFFER.enabled || FOUNDING_OFFER.maxCustomers === null) return null

  const supabase = await createClient()
  const { count, error } = await supabase
    .from('subscriptions')
    .select('user_id', { count: 'exact', head: true })
    .eq('is_founding', true)

  if (error) return null
  return Math.max(0, FOUNDING_OFFER.maxCustomers - (count ?? 0))
}
