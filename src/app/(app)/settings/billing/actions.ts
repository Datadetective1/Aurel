'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { absoluteUrl, brand } from '@/lib/brand'
import { features } from '@/lib/env'
import { logger } from '@/lib/logger'
import { track } from '@/lib/analytics'
import { FOUNDING_OFFER } from '@/lib/billing/plans'
import { priceIdFor, stripe, type BillingInterval } from '@/lib/billing/stripe'

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

const intervalSchema = z.enum(['monthly', 'yearly']).catch('monthly')

export async function startCheckout(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  if (!features.billing) {
    return { error: 'Payments are not connected on this deployment.' }
  }

  const interval: BillingInterval = intervalSchema.parse(formData.get('interval'))
  const priceId = priceIdFor(interval)
  if (!priceId) {
    return { error: 'That plan is not available yet. Contact support and we will sort it out.' }
  }

  const user = await requireUser()
  const supabase = await createClient()

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id, plan, status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (subscription?.plan === 'pro' && subscription.status === 'active') {
    return { error: 'You are already on Pro. Use Manage billing to change your plan.' }
  }

  let url: string | null = null

  try {
    const session = await stripe().checkout.sessions.create(
      {
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],

        // Reuse the customer when we have one so a returning subscriber does
        // not accumulate duplicate customer records with split billing history.
        ...(subscription?.stripe_customer_id
          ? { customer: subscription.stripe_customer_id }
          : { customer_email: user.email ?? undefined }),

        // The webhook trusts this, not the redirect, to know whose plan changed.
        client_reference_id: user.id,
        subscription_data: { metadata: { user_id: user.id } },
        metadata: { user_id: user.id },

        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        automatic_tax: { enabled: false },

        success_url: absoluteUrl('/settings/billing?checkout=success'),
        cancel_url: absoluteUrl('/settings/billing?checkout=cancelled'),
      },
      // Idempotent per user per interval per day: a double-submitted form
      // must not create two subscriptions.
      { idempotencyKey: `checkout:${user.id}:${interval}:${new Date().toISOString().slice(0, 10)}` },
    )

    url = session.url
  } catch (error) {
    logger.error('billing.checkout_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
    return { error: 'We could not start checkout. Nothing was charged. Try again in a moment.' }
  }

  if (!url) return { error: 'Stripe did not return a checkout page. Nothing was charged.' }

  await track('checkout_started', { interval })
  // Outside the try: redirect() signals by throwing, and catching it here would
  // report a successful redirect as a checkout failure.
  redirect(url)
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
    return { error: 'Payments are not connected on this deployment.' }
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
 * How many founding places are left.
 *
 * Counted from real subscriptions rather than a stored number, so the offer
 * cannot claim scarcity it does not have.
 */
export async function foundingPlacesRemaining(): Promise<number | null> {
  if (!FOUNDING_OFFER.enabled) return null

  const supabase = await createClient()
  const { count, error } = await supabase
    .from('subscriptions')
    .select('user_id', { count: 'exact', head: true })
    .eq('is_founding', true)

  if (error) return null
  return Math.max(0, FOUNDING_OFFER.maxCustomers - (count ?? 0))
}
