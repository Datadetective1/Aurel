import type Stripe from 'stripe'
import { serverEnv, features } from '@/lib/env'
import { logger } from '@/lib/logger'
import { intervalForPrice, planForPrice, stripe } from '@/lib/billing/stripe'
import { processStripeEvent } from '@/lib/billing/webhook'
import { supabaseBillingStore } from '@/lib/billing/webhook-store'
import { notifyBillingTransition } from '@/lib/billing/notify'

/**
 * STRIPE WEBHOOK
 * =============================================================================
 * The single writer of subscription state. Checkout redirects prove nothing --
 * a user can navigate to a success URL directly -- so entitlement changes come
 * only from a signed event delivered here.
 *
 * This file verifies the signature against the raw body and hands the event
 * to lib/billing/webhook, which owns the ledger, the ordering guard and the
 * transitions. See that file for the rules.
 * =============================================================================
 */

export const runtime = 'nodejs'
// The raw body must survive verbatim for signature verification.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!features.billingWebhooks || !features.serviceRole) {
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

  let outcome
  try {
    outcome = await processStripeEvent(event, {
      store: supabaseBillingStore(),
      processor: {
        retrieveSubscription: (id) => stripe().subscriptions.retrieve(id),
        cancelSubscription: async (id) => {
          await stripe().subscriptions.cancel(id, {}, { idempotencyKey: `deleted-account:${id}` })
        },
      },
      planForPrice,
      intervalForPrice,
      notify: notifyBillingTransition,
      log: (name, fields) => logger.info(name, { ...fields, id: event.id }),
    })
  } catch (error) {
    // The ledger itself could not be reached. Retryable by design: billing
    // does not run without idempotency.
    logger.error('billing.webhook_ledger_unavailable', {
      type: event.type,
      id: event.id,
      error: error instanceof Error ? error.message.slice(0, 80) : 'unknown',
    })
    return new Response('Handler failed.', { status: 500 })
  }

  return Response.json(outcome.body, { status: outcome.status })
}
