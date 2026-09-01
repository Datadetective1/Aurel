'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getOptionalUser, requireUser } from '@/lib/auth'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { absoluteUrl, brand } from '@/lib/brand'
import { features } from '@/lib/env'
import { logger } from '@/lib/logger'
import { track } from '@/lib/analytics'
import { getEntitlements } from '@/lib/billing/entitlements'
import { FOUNDING_OFFER, isEntitledStatus, type BillingInterval } from '@/lib/billing/plans'
import { mapStatus, priceIdFor, stripe } from '@/lib/billing/stripe'
import { applyStripeSubscription } from '@/lib/billing/sync'
import { intentDestination, rememberCheckoutIntent } from '@/lib/billing/checkout-intent'

/**
 * CHECKOUT AND PORTAL
 * =============================================================================
 * Server actions that end in a redirect to Stripe. Neither ever writes an
 * entitlement: the webhook is the only thing that may change a plan, because a
 * client that can grant itself Pro by finishing a redirect has no paywall.
 *
 * The one thing they DO write is the Stripe customer id, and only after Stripe
 * has confirmed which customer it is. That is a record of who somebody is, not
 * of what they have bought, and storing it here rather than waiting for the
 * webhook is what stops a second checkout attempt creating a second customer.
 * =============================================================================
 */

export interface BillingState {
  error?: string
}

/**
 * The interval is the ONLY thing the client gets to say, and even that is
 * narrowed to two values before it is used. Price ids are never accepted from
 * a form: they are read from server configuration by `priceIdFor`, so a
 * crafted request cannot subscribe anybody to an arbitrary Stripe price.
 */
const intervalSchema = z.enum(['monthly', 'yearly']).catch('monthly')

export async function startCheckout(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  // Not `features.billing`. A deployment with a secret key but no webhook
  // secret, no service role key or no price ids will happily charge a card and
  // then never write the subscription — the customer stays on Free, cannot
  // reach the portal to cancel, and retries. Refusing to start is the only
  // honest behaviour.
  if (!features.billingCheckout) {
    return { error: 'Payments are not connected on this deployment.' }
  }

  const interval: BillingInterval = intervalSchema.parse(formData.get('interval'))
  const priceId = priceIdFor(interval)
  if (!priceId) {
    return { error: 'That plan is not available yet. Contact support and we will sort it out.' }
  }

  const user = await requireUser()
  const entitlements = await getEntitlements()

  // An owner or pilot account is not a customer. Letting one through would
  // start it paying for its own product and would leave it in a state — plan
  // 'pro' with tier 'owner' — that no screen is written for.
  if (!entitlements.billable) {
    return { error: 'This account already has full access, so there is nothing to buy.' }
  }

  const supabase = await createClient()
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id, plan, status')
    .eq('user_id', user.id)
    .maybeSingle()

  // 'trialing' and 'past_due' count as already-subscribed. Sending a past_due
  // customer to a fresh checkout would leave them paying twice: the failing
  // subscription is still there, and Stripe will keep retrying it.
  if (subscription?.plan === 'pro' && isEntitledStatus(subscription.status)) {
    return { error: 'You are already on Pro. Use Manage billing to change your plan.' }
  }

  let customerId: string
  try {
    customerId = await resolveCustomerId(user.id, user.email ?? null, subscription?.stripe_customer_id ?? null)
  } catch (error) {
    logger.error('billing.customer_resolve_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
    return { error: 'We could not reach Stripe. Nothing was charged. Try again in a moment.' }
  }

  let url: string | null = null

  try {
    const session = await stripe().checkout.sessions.create(
      {
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],

        // Always an explicit customer. `customer_email` asks Stripe to make a
        // new customer every time, so a user whose first attempt did not
        // complete came back to a second customer record and a billing history
        // split across both.
        customer: customerId,

        // The webhook trusts these, not the redirect, to know whose plan
        // changed. Stamped in three places because the three events that can
        // arrive first each carry a different one.
        client_reference_id: user.id,
        subscription_data: { metadata: { user_id: user.id } },
        metadata: { user_id: user.id },

        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        automatic_tax: { enabled: false },

        success_url: absoluteUrl('/settings/billing?checkout=success'),
        cancel_url: absoluteUrl('/settings/billing?checkout=canceled'),
      },
      // Deduplicates a double-submitted form. Bucketed to the minute rather
      // than the day: a same-key request returns the SAME session object, and
      // a day-long bucket handed somebody who cancelled and came back an hour
      // later a URL for a session Stripe had already moved on from.
      { idempotencyKey: `checkout:${user.id}:${interval}:${minuteBucket()}` },
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
 * Choose a plan from the public pricing page.
 *
 * The pricing page is statically rendered and must stay that way, so it cannot
 * ask who is looking at it. This action does the asking, which keeps one button
 * correct for all three audiences:
 *
 *   signed in and onboarded -> straight to Stripe
 *   signed in, mid-onboarding -> finish onboarding, then buy
 *   not signed in -> sign up, then buy
 *
 * The last two remember the choice in a cookie, so the intent survives the
 * confirmation email and the four minutes of onboarding in between.
 */
export async function choosePlan(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const interval: BillingInterval = intervalSchema.parse(formData.get('interval'))
  const user = await getOptionalUser()

  if (!user) {
    await rememberCheckoutIntent(interval)
    // `next` as well as the cookie: the cookie is what survives an email
    // confirmation, and `next` is what makes the immediate path exact.
    redirect(`/sign-up?next=${encodeURIComponent(intentDestination(interval))}`)
  }

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed_at')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.onboarding_completed_at) {
    await rememberCheckoutIntent(interval)
    redirect('/onboarding')
  }

  return startCheckout(_prev, formData)
}

/**
 * The Stripe customer for this account, created at most once.
 *
 * Three defences against a duplicate, in order of cost:
 *   1. the id we already stored;
 *   2. a search of Stripe for a customer stamped with this user id, which
 *      recovers the case where a previous attempt created one and the webhook
 *      never arrived to record it;
 *   3. a create carrying an idempotency key, which absorbs a double submit in
 *      the window before either of the above can see the result.
 */
async function resolveCustomerId(
  userId: string,
  email: string | null,
  storedId: string | null,
): Promise<string> {
  if (storedId) {
    // A customer deleted in the Stripe dashboard still has an id on file here,
    // and passing it to checkout fails the whole session. Fall through to
    // making a new one rather than presenting that as a payment error.
    try {
      const existing = await stripe().customers.retrieve(storedId)
      if (!existing.deleted) return storedId
    } catch {
      logger.warn('billing.stored_customer_missing')
    }
  }

  try {
    const found = await stripe().customers.search({
      query: `metadata['user_id']:'${userId}'`,
      limit: 1,
    })
    const match = found.data[0]
    if (match) {
      await persistCustomerId(userId, match.id)
      return match.id
    }
  } catch (error) {
    // Search is index-backed and briefly stale after a write. A failure here
    // is not fatal — the idempotency key below covers the same window.
    logger.warn('billing.customer_search_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
  }

  const created = await stripe().customers.create(
    {
      email: email ?? undefined,
      // What lets the webhook map a subscription created by hand in the Stripe
      // dashboard back to the right account.
      metadata: { user_id: userId },
    },
    { idempotencyKey: `customer:${userId}` },
  )

  await persistCustomerId(userId, created.id)
  return created.id
}

/**
 * Record the customer id now rather than waiting for the webhook.
 *
 * Best effort on purpose. This is an identity, not an entitlement: it grants
 * nothing, and the webhook writes it again anyway. Failing here must not fail a
 * checkout, so a deployment without a service role key simply falls back to the
 * webhook doing it a few seconds later.
 */
async function persistCustomerId(userId: string, customerId: string): Promise<void> {
  try {
    const admin = createServiceRoleClient()
    await admin
      .from('subscriptions')
      .update({ stripe_customer_id: customerId })
      .eq('user_id', userId)
      .is('stripe_customer_id', null)
  } catch (error) {
    logger.warn('billing.customer_persist_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
  }
}

/** Minute-resolution bucket for checkout idempotency keys. */
function minuteBucket(): number {
  return Math.floor(Date.now() / 60_000)
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

  // Scoped to the caller's own row, and the only identifier used is the one
  // stored against it. There is no request parameter here to point at somebody
  // else's customer.
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
    // The first live portal call fails on every new Stripe account until the
    // portal is configured once in the dashboard, and the generic message sent
    // people to support for something only the operator can fix.
    const unconfigured =
      error instanceof Error && /no configuration|default configuration/i.test(error.message)

    logger.error('billing.portal_failed', {
      unconfigured,
      error: error instanceof Error ? error.name : 'unknown',
    })

    return {
      error: unconfigured
        ? 'The billing portal is not set up yet on this deployment. We have been told; please email ' +
          `${brand.email.support} and we will sort your subscription out directly.`
        : `We could not open the billing portal. Email ${brand.email.support}.`,
    }
  }

  redirect(url)
}

/**
 * How many founding places are left.
 *
 * Counted from real subscriptions rather than a stored number, so the offer
 * cannot claim scarcity it does not have. Returns null whenever the promotion
 * is off, which is every caller's signal to render nothing at all.
 */
export async function foundingPlacesRemaining(): Promise<number | null> {
  if (!FOUNDING_OFFER.enabled) return null

  // requireUser first: this is an exported server action, which means it is an
  // endpoint, and it was the one in this file with no auth check.
  await requireUser()

  // Counted with the privileged client. The user-scoped one is bound by
  // `subscriptions: read own`, so it could see at most the caller's own row --
  // the count was therefore 0 for everyone who was not themselves a founding
  // customer, and the offer would have advertised all 250 places as available
  // forever. Exactly the scarcity-with-nothing-behind-it this function's own
  // comment says it exists to prevent.
  const { count, error } = await createServiceRoleClient()
    .from('subscriptions')
    .select('user_id', { count: 'exact', head: true })
    .eq('is_founding', true)

  if (error) return null
  return Math.max(0, FOUNDING_OFFER.maxCustomers - (count ?? 0))
}

/**
 * Ask Stripe what this account's subscription actually is, and write it down.
 *
 * Called when somebody comes back from a successful checkout. The redirect
 * itself proves nothing — anyone can type the success URL — so this does not
 * trust it: it takes the customer id already on file, asks STRIPE what
 * subscriptions that customer has, and applies the answer through exactly the
 * same database function the webhook uses.
 *
 * The webhook remains the normal path and the authority. This exists because
 * the webhook is asynchronous, and a customer who has just paid should not be
 * looking at a screen that says Free while they wait for a delivery they cannot
 * see. Both writers are idempotent and both are ordered by event time, so
 * whichever lands second is a no-op or an update, never a regression.
 */
export async function reconcileSubscription(): Promise<{ plan: string; changed: boolean }> {
  const user = await requireUser()

  if (!features.billingCheckout) return { plan: 'free', changed: false }

  const before = await getEntitlements()
  if (!before.billable) return { plan: before.plan, changed: false }

  const supabase = await createClient()
  const { data: row } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const customerId = row?.stripe_customer_id
  if (!customerId) return { plan: before.plan, changed: false }

  try {
    const list = await stripe().subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 10,
    })

    // The one that actually entitles, preferred over the most recent: a
    // customer who resubscribed after cancelling has both on file, and the
    // cancelled one is not the answer.
    const subscription =
      list.data.find((candidate) => isEntitledStatus(mapStatus(candidate.status))) ?? list.data[0]

    if (!subscription) return { plan: before.plan, changed: false }

    await applyStripeSubscription(user.id, subscription)
  } catch (error) {
    logger.warn('billing.reconcile_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
    return { plan: before.plan, changed: false }
  }

  // Read back what was actually written, rather than assuming it said 'pro'.
  // A subscription against a price that is not one of ours resolves to free —
  // see planForPrice — and the success banner must not announce a plan the
  // database does not hold.
  //
  // Re-read directly: getEntitlements is request-cached, so calling it again
  // here would return the value from before the write.
  const { data: after } = await supabase
    .from('subscriptions')
    .select('plan')
    .eq('user_id', user.id)
    .maybeSingle()

  const plan = after?.plan ?? before.plan
  return { plan, changed: plan !== before.plan }
}
