'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { absoluteUrl, brand } from '@/lib/brand'
import { features } from '@/lib/env'
import { logger } from '@/lib/logger'
import { track } from '@/lib/analytics'
import { formatDate } from '@/lib/format'
import { FOUNDING_OFFER, PLANS, PRO_PRICE, formatPrice } from '@/lib/billing/plans'
import { checkoutAvailable, priceMatchesOffer, proPriceId, stripe } from '@/lib/billing/stripe'
import { getEntitlements } from '@/lib/billing/entitlements'
import { hasFullAccess } from '@/lib/billing/access'
import { notifyTrial } from '@/lib/billing/notify'
import { claimTrial } from '@/lib/billing/trial-claim'
import {
  appTrialActive,
  firstChargeAt,
  isAppTrial,
  trialEligibility,
  trialEndsAt,
  type TrialRow,
} from '@/lib/billing/trial'

/**
 * CHECKOUT AND PORTAL
 * =============================================================================
 * Two server actions, both of which end in a redirect to Stripe. Neither ever
 * writes an entitlement: the webhook is the only thing that may change a paid
 * plan, because a client that can grant itself Pro by finishing a redirect has
 * no paywall at all.
 *
 * The one exception is the trial, which involves no money: `startProTrial`
 * grants it once per account through lib/billing/trial-claim, and it ends by
 * itself.
 * =============================================================================
 */

export interface BillingState {
  error?: string
  message?: string
}

const PRICE = formatPrice(PLANS.pro.monthlyPriceCents)

function trialRowOf(
  row: {
    status: string | null
    trial_ends_at: string | null
    stripe_subscription_id: string | null
  } | null,
): TrialRow | null {
  return row
    ? {
        status: row.status,
        trialEndsAt: row.trial_ends_at,
        stripeSubscriptionId: row.stripe_subscription_id,
      }
    : null
}

/**
 * Start the 14-day Pro trial: once per account, no card, nothing at Stripe.
 *
 * Offered only where subscribing works, so the trial can end in a choice.
 * Claimed in one conditional UPDATE (lib/billing/trial-claim), so two presses
 * at once start one trial; an account that has had a trial or any
 * subscription is refused.
 */
export async function startProTrial(
  _prev: BillingState,
  _formData: FormData,
): Promise<BillingState> {
  if (!checkoutAvailable()) {
    return { error: 'The Pro trial is not available right now. Nothing has changed.' }
  }

  const user = await requireUser()
  const entitlements = await getEntitlements()
  if (entitlements.plan !== 'free') {
    return {
      error:
        entitlements.trial?.state === 'active'
          ? 'Your Pro trial is already on.'
          : 'This account is already on Pro.',
    }
  }

  const supabase = await createClient()
  const { data: row } = await supabase
    .from('subscriptions')
    .select('status, trial_ends_at, stripe_subscription_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const eligibility = trialEligibility(trialRowOf(row), hasFullAccess(entitlements.tier))
  if (!eligibility.eligible) {
    return {
      error:
        eligibility.reason === 'full_access'
          ? 'Your account already has full access.'
          : eligibility.reason === 'subscribed'
            ? 'This account has had a subscription, so the trial is not available. Subscribe to Pro to use it again.'
            : 'This account has already had its Pro trial. Subscribe to Pro to keep using it.',
    }
  }

  const endsAt = trialEndsAt().toISOString()
  const claim = await claimTrial(user.id, endsAt)
  if (claim === 'used') return { error: 'This account has already had its Pro trial.' }
  if (claim === 'failed') {
    return { error: 'The trial could not start. Nothing has changed. Try again in a moment.' }
  }

  await notifyTrial(user.id, 'started', endsAt)
  await track('trial_started', {})
  revalidatePath('/settings/billing')
  return { message: 'Your 14-day Pro trial is on. No card, nothing charged.' }
}

const ENTITLED = ['trialing', 'active', 'past_due']

/**
 * Stripe subscription statuses that mean the customer already has a live
 * subscription. Checked at Stripe, not only in our table: the table lags the
 * webhook, and writes `free` for unpaid or paused subscriptions that Stripe is
 * still billing. `incomplete` is left out on purpose -- it is an abandoned
 * payment that expires by itself, and blocking on it would lock a customer out
 * of retrying.
 */
const LIVE_AT_STRIPE = new Set(['trialing', 'active', 'past_due', 'unpaid', 'paused'])

export async function startCheckout(
  _prev: BillingState,
  _formData: FormData,
): Promise<BillingState> {
  const unavailable = { error: 'Upgrading is not available right now. Nothing was charged.' }
  // All three, or none. Checkout without the webhook (or without the service
  // role it writes with) would take a payment that nothing can turn into Pro.
  if (!features.billing || !features.billingWebhooks || !features.serviceRole) return unavailable

  const priceId = proPriceId()
  if (!priceId) return unavailable

  const user = await requireUser()
  const supabase = await createClient()

  const [{ data: subscription }, { data: profile }] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('stripe_customer_id, plan, status, trial_ends_at, stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase.from('profiles').select('timezone').eq('id', user.id).maybeSingle(),
  ])
  const trialRow = trialRowOf(subscription ?? null)

  // The app's own trial is not a subscription: subscribing is what it is for.
  if (
    !isAppTrial(trialRow) &&
    subscription?.plan === 'pro' &&
    ENTITLED.includes(subscription.status ?? '')
  ) {
    return { error: 'You are already on Pro. Use Manage billing to change your plan.' }
  }

  // Subscribing during the trial keeps the rest of it: the first charge is
  // when the trial ends (or Checkout's 48-hour minimum, if that is later).
  const now = new Date()
  const firstCharge =
    appTrialActive(trialRow, now) && trialRow?.trialEndsAt
      ? firstChargeAt(trialRow.trialEndsAt, now)
      : null
  const firstChargeOn = firstCharge
    ? formatDate(firstCharge.toISOString(), profile?.timezone ?? 'UTC')
    : null

  let url: string | null = null

  try {
    // The price the page advertises is the price Stripe will charge, or
    // checkout does not start. A wrong price id in configuration must fail
    // here, loudly, and never on a customer's card.
    const price = await stripe().prices.retrieve(priceId)
    if (!priceMatchesOffer(price, PRO_PRICE)) {
      logger.error('billing.price_mismatch', {
        expectedCents: PRO_PRICE.monthlyPriceCents,
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

    // Stripe is the source of truth for "already subscribed". A second tap
    // before the webhook lands, or an unpaid subscription our table shows as
    // free, must lead to the portal -- never to a second subscription.
    if (customer) {
      const existing = await stripe().subscriptions.list({ customer, status: 'all', limit: 20 })
      if (existing.data.some((s) => LIVE_AT_STRIPE.has(s.status))) {
        return {
          error:
            'This account already has a subscription. Use Manage billing to see it, update your card or change your plan. Nothing was charged.',
        }
      }
    }

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
        subscription_data: {
          metadata: { user_id: user.id },
          ...(firstCharge ? { trial_end: Math.floor(firstCharge.getTime() / 1000) } : {}),
        },
        metadata: { user_id: user.id },

        // The terms, on Stripe's page beside the button that agrees to them.
        custom_text: {
          submit: {
            message: firstChargeOn
              ? `Nothing is charged today. Your first charge of ${PRICE} is on ${firstChargeOn}, then ${PRICE} every month until you cancel.`
              : `You will be charged ${PRICE} today, then ${PRICE} every month until you cancel.`,
          },
        },

        // No promotion is approved; Checkout shows no code field.
        allow_promotion_codes: false,
        billing_address_collection: 'auto',
        automatic_tax: { enabled: false },

        success_url: absoluteUrl('/settings/billing?checkout=success'),
        cancel_url: absoluteUrl('/settings/billing?checkout=canceled'),
      },
      // Idempotent for ten minutes, per customer and price: a double-submitted
      // form gets the same session back. It used to be per day, and Stripe
      // replays a cached response -- error or completed session -- for the
      // whole window, so one failed or finished attempt locked the customer
      // out of checkout until midnight UTC. The duplicate-subscription guard
      // above is what actually prevents a second subscription.
      {
        idempotencyKey: `checkout:${user.id}:${customer ?? 'new'}:${priceId}:${firstCharge ? firstCharge.getTime() : 'now'}:${Math.floor(Date.now() / 600_000)}`,
      },
    )

    url = session.url
  } catch (error) {
    logger.error('billing.checkout_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
    return {
      error: `We could not start checkout. Nothing was charged. Try again in a moment, or email ${brand.email.support}.`,
    }
  }

  if (!url) return { error: 'Checkout could not be opened. Nothing was charged.' }

  await track('checkout_started', { interval: 'monthly', duringTrial: Boolean(firstCharge) })
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
    // Stop here. Carrying on would leave a Stripe customer this account cannot
    // find again, and the next checkout would create a second one. Retrying is
    // safe: the idempotency key returns this same customer.
    logger.error('billing.customer_store_failed', { code: error.code })
    throw new Error('customer_store_failed')
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
