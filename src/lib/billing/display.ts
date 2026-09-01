import {
  PLANS,
  formatPrice,
  type BillingInterval,
  type PlanId,
  type SubscriptionStatus,
} from './plans'
import type { EntitlementLevel } from './access'

/**
 * BILLING DISPLAY
 * =============================================================================
 * What the Plan screen says, worked out as pure functions over the billing
 * state rather than as conditionals threaded through JSX.
 *
 * The rule every function here obeys: NEVER INVENT A FACT. A renewal date we do
 * not have renders as nothing, not as a plausible date computed from today. A
 * customer who reads "Renews 3 March" and is charged on the 17th has been told
 * something false by their own account screen, and there is no version of that
 * which is better than an empty row.
 *
 * Kept free of server imports so the whole of it is unit-testable and so the
 * same answers are available to a client component.
 * =============================================================================
 */

export interface BillingViewInput {
  level: EntitlementLevel
  plan: PlanId
  status: SubscriptionStatus | null
  interval: BillingInterval | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  trialEndsAt: string | null
  hasCustomer: boolean
}

export type BillingTone = 'neutral' | 'accent' | 'positive' | 'caution' | 'critical' | 'info'

export interface BillingView {
  /** The plan name as a heading, e.g. "Atturel Pro". */
  planName: string
  /** Short status word for the badge, or null when there is no subscription. */
  statusLabel: string | null
  statusTone: BillingTone
  /** "$19 per month". Null when this account is not being billed anything. */
  priceLabel: string | null
  /** What the date beside `periodEnd` means. Null when there is no date. */
  periodLabel: 'Renews' | 'Access ends' | 'Trial ends' | null
  /** Whether to offer the Stripe customer portal. */
  showManage: boolean
  /** Whether to offer checkout. */
  showUpgrade: boolean
  /**
   * A sentence explaining a state that needs explaining — a failed payment, a
   * scheduled cancellation. Null when the account is simply fine.
   */
  notice: string | null
  noticeTone: BillingTone
}

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Payment failed',
  canceled: 'Canceled',
  incomplete: 'Incomplete',
  incomplete_expired: 'Expired',
  unpaid: 'Unpaid',
  paused: 'Paused',
}

const STATUS_TONE: Record<SubscriptionStatus, BillingTone> = {
  trialing: 'info',
  active: 'positive',
  past_due: 'caution',
  canceled: 'neutral',
  incomplete: 'caution',
  incomplete_expired: 'neutral',
  unpaid: 'critical',
  paused: 'caution',
}

/** "$19 per month" / "$190 per year". Null when nothing is being billed. */
export function priceLabel(plan: PlanId, interval: BillingInterval | null): string | null {
  const definition = PLANS[plan]
  if (!definition) return null

  const cents = interval === 'yearly' ? definition.yearlyPriceCents : definition.monthlyPriceCents
  if (!cents) return null

  return `${formatPrice(cents)} per ${interval === 'yearly' ? 'year' : 'month'}`
}

/**
 * Everything the Plan screen needs, decided in one place.
 *
 * Deliberately takes flat state rather than the Entitlements object, so a test
 * can construct a past_due annual subscription cancelling at period end without
 * building a database.
 */
export function billingView(input: BillingViewInput): BillingView {
  const { level, plan, status, interval, currentPeriodEnd, cancelAtPeriodEnd } = input

  // --- internal accounts ---------------------------------------------------
  // Owner and pilot are not customers, and every price, renewal date and
  // payment button below would be a statement about a transaction that does
  // not exist.
  if (level === 'owner' || level === 'pilot') {
    return {
      planName: level === 'owner' ? 'Owner' : 'Pilot',
      statusLabel: 'Full access',
      statusTone: 'accent',
      priceLabel: null,
      periodLabel: null,
      showManage: false,
      showUpgrade: false,
      notice:
        level === 'owner'
          ? 'This is an internal account. It has every capability, is not metered against a plan, and is never billed.'
          : 'You are on a pilot account. Every capability is available and there is nothing to pay.',
      noticeTone: 'accent',
    }
  }

  const definition = PLANS[plan] ?? PLANS.free
  const paying = plan !== 'free' && status !== null

  // --- free ----------------------------------------------------------------
  if (!paying) {
    // An account can arrive here two ways: it never subscribed, or its
    // subscription ended. The second one is owed an explanation. Losing Pro
    // with nothing on the screen saying why is how a recoverable card problem
    // becomes a support ticket that starts "my account broke".
    const ended = endedNotice(status)

    return {
      planName: definition.name,
      // A free account has no subscription, so it has no status. Showing
      // "Active" here would imply a subscription that could lapse.
      statusLabel: null,
      statusTone: 'neutral',
      priceLabel: null,
      periodLabel: null,
      // Someone who has cancelled still has a Stripe customer, and still needs
      // to reach their invoices.
      showManage: input.hasCustomer,
      showUpgrade: true,
      notice: ended?.text ?? null,
      noticeTone: ended?.tone ?? 'neutral',
    }
  }

  const label = status ? STATUS_LABEL[status] : null
  const tone: BillingTone = status ? STATUS_TONE[status] : 'neutral'

  // A scheduled cancellation is not a status of its own in Stripe — the
  // subscription stays 'active' until the period runs out — so it has to be
  // read off the flag, and it changes what the date beside it means.
  const canceling = cancelAtPeriodEnd && (status === 'active' || status === 'trialing')

  let periodLabel: BillingView['periodLabel'] = null
  if (currentPeriodEnd) {
    periodLabel = canceling ? 'Access ends' : status === 'trialing' ? 'Trial ends' : 'Renews'
  }

  let notice: string | null = null
  let noticeTone: BillingTone = 'neutral'

  if (canceling) {
    notice =
      'Your subscription is set to end. You keep Pro until the date above, and nothing you have recorded is deleted when it does.'
    noticeTone = 'caution'
  } else if (status === 'past_due') {
    notice =
      'The last payment did not go through. You still have Pro while the card is retried — update your payment method to keep it.'
    noticeTone = 'caution'
  } else if (status === 'unpaid') {
    notice =
      'Payment could not be collected, so this account is back on Free. Your relationship record is untouched and Pro resumes the moment a payment succeeds.'
    noticeTone = 'critical'
  } else if (status === 'paused') {
    notice =
      'This subscription is paused. Resume it from Manage subscription whenever you are ready.'
    noticeTone = 'caution'
  } else if (status === 'incomplete') {
    notice =
      'This subscription needs one more step before it starts — usually a card confirmation. Open Manage subscription to finish it.'
    noticeTone = 'caution'
  }

  return {
    planName: definition.name,
    statusLabel: canceling ? 'Canceling' : label,
    statusTone: canceling ? 'caution' : tone,
    priceLabel: priceLabel(plan, interval),
    periodLabel,
    showManage: input.hasCustomer,
    showUpgrade: false,
    notice,
    noticeTone,
  }
}
/**
 * Why a formerly-paying account is on Free.
 *
 * Nothing for an account that simply never subscribed — `status` is null there,
 * because the signup trigger writes a plan and no status at all.
 */
function endedNotice(
  status: SubscriptionStatus | null,
): { text: string; tone: BillingTone } | null {
  switch (status) {
    case 'unpaid':
      return {
        text: 'Payment could not be collected, so this account is back on Free. Your relationship record is untouched and Pro resumes the moment a payment succeeds.',
        tone: 'critical',
      }
    case 'canceled':
      return {
        text: 'Your subscription has ended and this account is on Free. Nothing you recorded has been deleted — resubscribe any time and it is all still here.',
        tone: 'neutral',
      }
    case 'incomplete_expired':
      return {
        text: 'That subscription was never completed, so nothing was charged. You can start again whenever you are ready.',
        tone: 'neutral',
      }
    default:
      return null
  }
}
