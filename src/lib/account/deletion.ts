import { brand } from '@/lib/brand'

/**
 * ACCOUNT DELETION, IN THE ORDER THAT CANNOT GO WRONG
 * =============================================================================
 *
 *   1. STOP BILLING.   Every Stripe subscription on the account's customer is
 *                      cancelled immediately and every open invoice voided.
 *                      If that fails, nothing is deleted and the user is told.
 *                      Deleting first and cancelling second is how a deleted
 *                      customer keeps being charged.
 *   2. RECORD.         A minimal audit row: who (an id), when, which plan,
 *                      what was done to billing. No relationship content.
 *   3. DELETE DATA.    The user's own rows, through the RLS-scoped function.
 *   4. DELETE LOGIN.   The auth record, with the service role.
 *
 * APPLE IS DIFFERENT. An App Store subscription cannot be cancelled by us --
 * only by the subscriber, in their Apple ID settings -- and deleting the
 * account does not stop Apple billing it. So an account with an active Apple
 * subscription is not deleted until the user has been told exactly that and
 * confirmed they understand. No Stripe logic is applied to it. (Inert today:
 * App Store subscriptions are not active; see lib/billing/sources.)
 *
 * Pure orchestration over injected dependencies, so every branch is tested.
 * =============================================================================
 */

export interface BillingSnapshot {
  plan: string
  tier: string
  stripeCustomerId: string | null
  /** Active App Store subscription (always false until StoreKit ships). */
  appleActive: boolean
}

export interface StripeOps {
  /** Subscriptions on the customer that could still bill. */
  listBillableSubscriptions(customerId: string): Promise<{ id: string; status: string }[]>
  cancelSubscription(id: string): Promise<{ status: string }>
  listOpenInvoices(customerId: string): Promise<{ id: string }[]>
  voidInvoice(id: string): Promise<void>
  /** Checkout pages still open, so one cannot be completed after deletion. */
  expireOpenCheckouts(customerId: string): Promise<number>
}

export interface AuditRow {
  deleted_user_id: string
  requested_via: 'web' | 'ios'
  plan_at_deletion: string
  access_tier_at_deletion: string
  billing_provider: 'stripe' | 'apple' | 'none'
  stripe_customer_id: string | null
  stripe_subscriptions_canceled: string[]
  stripe_invoices_voided: string[]
  billing_outcome: 'none' | 'canceled' | 'already_inactive' | 'apple_user_managed'
}

export interface DeletionDeps {
  loadBilling(): Promise<BillingSnapshot>
  /** Null when this deployment cannot reach Stripe. */
  stripe: StripeOps | null
  audit: {
    record(row: AuditRow): Promise<string | null>
    mark(id: string, field: 'data_deleted_at' | 'auth_deleted_at'): Promise<void>
  }
  deleteData(): Promise<boolean>
  deleteLogin(): Promise<boolean>
  log?: (event: string, fields: Record<string, unknown>) => void
}

export type DeletionResult =
  | { ok: true; loginDeleted: boolean }
  | {
      ok: false
      stage: 'billing' | 'apple_acknowledgement' | 'data' | 'login'
      message: string
    }

/** Where people are told to write when deletion cannot finish on its own. */
const SUPPORT = brand.email.support

const BILLABLE = new Set(['trialing', 'active', 'past_due', 'unpaid', 'incomplete', 'paused'])

export function isBillable(status: string): boolean {
  return BILLABLE.has(status)
}

export async function deleteAccountCore(
  input: { userId: string; via: 'web' | 'ios'; appleAcknowledged?: boolean },
  deps: DeletionDeps,
): Promise<DeletionResult> {
  const log = deps.log ?? (() => {})
  const billing = await deps.loadBilling()

  if (billing.appleActive && !input.appleAcknowledged) {
    return {
      ok: false,
      stage: 'apple_acknowledgement',
      message:
        'Your subscription is billed by Apple, and deleting your account does not cancel it. Cancel it in Settings › Apple ID › Subscriptions, then confirm here.',
    }
  }

  // --- 1. stop billing -------------------------------------------------------
  const canceled: string[] = []
  const voided: string[] = []
  let outcome: AuditRow['billing_outcome'] = billing.appleActive ? 'apple_user_managed' : 'none'

  if (billing.stripeCustomerId) {
    if (!deps.stripe) {
      // A customer exists but this deployment cannot talk to Stripe, so it
      // cannot prove billing has stopped. Refuse rather than guess.
      log('account.delete_billing_unreachable', {})
      return {
        ok: false,
        stage: 'billing',
        message: `We could not confirm your subscription is stopped, so nothing was deleted. Try again in a moment, or email ${SUPPORT}.`,
      }
    }
    try {
      await deps.stripe.expireOpenCheckouts(billing.stripeCustomerId)
      const subscriptions = await deps.stripe.listBillableSubscriptions(billing.stripeCustomerId)
      for (const subscription of subscriptions) {
        const result = await deps.stripe.cancelSubscription(subscription.id)
        if (result.status !== 'canceled') throw new Error('cancel_not_confirmed')
        canceled.push(subscription.id)
      }
      for (const invoice of await deps.stripe.listOpenInvoices(billing.stripeCustomerId)) {
        await deps.stripe.voidInvoice(invoice.id)
        voided.push(invoice.id)
      }
      outcome = canceled.length > 0 ? 'canceled' : 'already_inactive'
    } catch (error) {
      log('account.delete_billing_failed', {
        canceled: canceled.length,
        error: error instanceof Error ? error.message.slice(0, 60) : 'unknown',
      })
      return {
        ok: false,
        stage: 'billing',
        message: `We could not stop your subscription, so nothing was deleted. Try again in a moment, or email ${SUPPORT}.`,
      }
    }
  }

  // --- 2. record -------------------------------------------------------------
  const auditId = await deps.audit
    .record({
      deleted_user_id: input.userId,
      requested_via: input.via,
      plan_at_deletion: billing.plan,
      access_tier_at_deletion: billing.tier,
      billing_provider: billing.appleActive
        ? 'apple'
        : billing.stripeCustomerId
          ? 'stripe'
          : 'none',
      stripe_customer_id: billing.stripeCustomerId,
      stripe_subscriptions_canceled: canceled,
      stripe_invoices_voided: voided,
      billing_outcome: outcome,
    })
    .catch(() => null)
  if (!auditId) {
    // The deletion is the user's right and goes ahead. The log line carries
    // the same identifiers, so a billing question can still be answered.
    log('account.delete_audit_unrecorded', {
      customer: billing.stripeCustomerId,
      canceled,
      voided,
      outcome,
    })
  }

  // --- 3. delete data --------------------------------------------------------
  if (!(await deps.deleteData())) {
    return {
      ok: false,
      stage: 'data',
      message:
        canceled.length > 0
          ? `Your subscription is cancelled, but your data could not be deleted. Email ${SUPPORT} and it will be removed.`
          : `Your data could not be deleted. Email ${SUPPORT} and nothing will be lost.`,
    }
  }
  if (auditId) await deps.audit.mark(auditId, 'data_deleted_at').catch(() => {})

  // --- 4. delete login -------------------------------------------------------
  const loginDeleted = await deps.deleteLogin().catch(() => false)
  if (auditId && loginDeleted) await deps.audit.mark(auditId, 'auth_deleted_at').catch(() => {})

  // Deleting the login is what removes the rest -- fetched sources, facts and
  // their links go with it by cascade. Reporting success without it would
  // tell someone their record is gone while part of it remains.
  if (!loginDeleted) {
    log('account.login_delete_failed', {})
    return {
      ok: false,
      stage: 'login',
      message: `Your record has been deleted, but we could not close your sign-in and remove the last of it. Email ${SUPPORT} and we will finish it.`,
    }
  }

  return { ok: true, loginDeleted }
}
