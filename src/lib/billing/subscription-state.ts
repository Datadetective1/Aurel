import type { PlanId } from './plans'

/**
 * SUBSCRIPTION STATE, AS ATTUREL HOLDS IT
 * =============================================================================
 * Pure functions over the canonical row in `subscriptions`. Stripe (and, later,
 * the App Store) are where money moves; this row is what the product reads to
 * decide what an account may do. Nothing here talks to a network.
 * =============================================================================
 */

/** Statuses under which a paid plan is honoured. `past_due` keeps access
 *  while the processor retries the card: cutting someone off on one failed
 *  charge is how a product loses a customer to an expired card. */
export const ENTITLED_STATUSES = ['trialing', 'active', 'past_due'] as const

export function isEntitledStatus(status: string | null | undefined): boolean {
  return Boolean(status && (ENTITLED_STATUSES as readonly string[]).includes(status))
}

/** The fields of the canonical row a processor event can change. */
export interface SubscriptionState {
  plan: PlanId
  status: string | null
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
}

/** The plan a row actually confers: a lapsed paid plan confers Free. */
export function effectivePlan(state: Pick<SubscriptionState, 'plan' | 'status'> | null): PlanId {
  if (!state) return 'free'
  if (state.plan === 'free') return 'free'
  return isEntitledStatus(state.status) ? state.plan : 'free'
}

export type SubscriptionTransition =
  /** `firstChargeAt` when subscribed during the trial: nothing is charged until then. */
  | { kind: 'activated'; firstChargeAt?: string | null }
  /** `inTrial` when nothing has been charged yet, so nothing will be. */
  | { kind: 'cancellation_scheduled'; endsAt: string | null; inTrial?: boolean }
  | { kind: 'cancellation_withdrawn' }
  | { kind: 'ended'; reason: 'canceled' | 'payment' }
  | { kind: 'payment_problem' }
  | { kind: 'payment_recovered' }

/**
 * What changed for the customer between two states of the canonical row.
 *
 * Computed from the row, not from the event type, so a duplicate or a
 * replayed event -- which produces the same row -- produces no transition,
 * and therefore no second email.
 */
export function transitionsBetween(
  before: SubscriptionState | null,
  after: SubscriptionState,
): SubscriptionTransition[] {
  const was = effectivePlan(before) !== 'free'
  const is = effectivePlan(after) !== 'free'
  const out: SubscriptionTransition[] = []

  if (!was && is) {
    out.push({
      kind: 'activated',
      // Stripe's trial runs to the first charge, and its period ends there.
      firstChargeAt: after.status === 'trialing' ? after.currentPeriodEnd : null,
    })
    return out
  }

  if (was && !is) {
    out.push({
      kind: 'ended',
      reason: after.status === 'unpaid' || before?.status === 'past_due' ? 'payment' : 'canceled',
    })
    return out
  }

  if (was && is) {
    if (!before?.cancelAtPeriodEnd && after.cancelAtPeriodEnd) {
      out.push({
        kind: 'cancellation_scheduled',
        endsAt: after.currentPeriodEnd,
        inTrial: after.status === 'trialing',
      })
    } else if (before?.cancelAtPeriodEnd && !after.cancelAtPeriodEnd) {
      out.push({ kind: 'cancellation_withdrawn' })
    }
    if (before?.status !== 'past_due' && after.status === 'past_due') {
      out.push({ kind: 'payment_problem' })
    } else if (before?.status === 'past_due' && after.status === 'active') {
      out.push({ kind: 'payment_recovered' })
    }
  }

  return out
}
