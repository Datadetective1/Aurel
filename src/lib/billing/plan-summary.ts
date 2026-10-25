import { formatDateIn } from '@/lib/tz'
import { PLANS, formatPrice, type PlanId } from './plans'
import { firstChargeAt, trialDaysLeft, type TrialState } from './trial'

/**
 * WHAT THE PLAN PAGE SAYS
 * =============================================================================
 * The plan, the trial and the next charge, in the words the Plan page and the
 * iPhone's Account screen both use. Every date is the account's own time zone.
 * Pure, so each state can be tested on its own.
 *
 * The rule throughout: say when the first or next charge is and what it
 * repeats, or say plainly that nothing will be charged; and say that nothing
 * is deleted when an account returns to Free.
 * =============================================================================
 */

export interface PlanSummaryInput {
  plan: PlanId
  fullAccess: boolean
  trial: { state: TrialState; endsAt: string } | null
  subscription: {
    status: string | null
    cancelAtPeriodEnd: boolean
    currentPeriodEnd: string | null
  } | null
  /** Eligible for the trial, and billing works so it can end in a choice. */
  trialOffered: boolean
  /** Billing is configured, so Subscribe can open Checkout. */
  canSubscribe: boolean
  timeZone: string
  now?: Date
}

export interface PlanSummary {
  /** "Pro trial", "Pro" or "Free". */
  label: string
  /** One line for the iPhone: "Pro trial · ends 8 Nov 2026". */
  shortLabel: string
  /** What happens next, under the plan name. */
  lines: string[]
  /** Show "Start your 14-day Pro trial". */
  offerTrial: boolean
  /** The explicit subscribe action and the terms shown beside it. */
  subscribe: { label: string; terms: string } | null
}

const PRICE = formatPrice(PLANS.pro.monthlyPriceCents)
export const SUBSCRIBE_LABEL = `Subscribe to Pro — ${PRICE}/month`
export const KEPT_ON_FREE =
  'Nothing is deleted: on Free you can still read, edit and export everyone and everything. Adding a sixth person, the Relationship Atlas and the larger monthly allowances need Pro.'

export function planSummary(input: PlanSummaryInput): PlanSummary {
  const now = input.now ?? new Date()
  const on = (iso: string) => formatDateIn(iso, input.timeZone)
  const trial = input.trial

  // Owner and pilot accounts have everything, unless they also pay: a paying
  // pilot still needs to see when the next charge is.
  const paying =
    trial?.state === 'subscribed' || (input.plan !== 'free' && trial?.state !== 'active')
  if (input.fullAccess && !paying) {
    return {
      label: PLANS[input.plan].name,
      shortLabel: 'Full access',
      lines: [],
      offerTrial: false,
      subscribe: null,
    }
  }

  if (trial?.state === 'active') {
    const left = trialDaysLeft(trial.endsAt, now)
    const firstCharge = on(firstChargeAt(trial.endsAt, now).toISOString())
    return {
      label: 'Pro trial',
      shortLabel: `Pro trial · ends ${on(trial.endsAt)}`,
      lines: [
        `Your 14-day trial ends on ${on(trial.endsAt)} (${left} ${left === 1 ? 'day' : 'days'} left). No card, nothing charged.`,
        `When it ends your account returns to Free, unless you subscribe. ${KEPT_ON_FREE}`,
      ],
      offerTrial: false,
      subscribe: input.canSubscribe
        ? {
            label: SUBSCRIBE_LABEL,
            terms: `The rest of your trial is kept. Your first charge of ${PRICE} is on ${firstCharge}, then ${PRICE} every month until you cancel.`,
          }
        : null,
    }
  }

  if (trial?.state === 'subscribed') {
    const canceled = input.subscription?.cancelAtPeriodEnd ?? false
    return {
      label: PLANS.pro.name,
      shortLabel: canceled
        ? `Pro until ${on(trial.endsAt)}`
        : `Pro · first charge ${on(trial.endsAt)}`,
      lines: [
        canceled
          ? `Canceled. Pro stays on until ${on(trial.endsAt)} and you will not be charged; then the account moves to Free. ${KEPT_ON_FREE}`
          : `Subscribed. Your first charge of ${PRICE} is on ${on(trial.endsAt)}, then ${PRICE} every month until you cancel.`,
      ],
      offerTrial: false,
      subscribe: null,
    }
  }

  if (input.plan !== 'free') {
    const end = input.subscription?.currentPeriodEnd
    return {
      label: PLANS[input.plan].name,
      shortLabel: PLANS[input.plan].name,
      lines: end
        ? [
            input.subscription?.cancelAtPeriodEnd
              ? `Canceled. Pro stays on until ${on(end)}, then the account moves to Free. Nothing is deleted.`
              : `Renews on ${on(end)} at ${PRICE}.`,
          ]
        : [],
      offerTrial: false,
      subscribe: null,
    }
  }

  // Free: never trialed, or the trial ended without a subscription.
  const ended = trial?.state === 'ended'
  return {
    label: PLANS.free.name,
    shortLabel: PLANS.free.name,
    lines: ended
      ? [`Your Pro trial ended on ${on(trial.endsAt)}. Nothing was charged. ${KEPT_ON_FREE}`]
      : [],
    offerTrial: input.trialOffered && !ended,
    subscribe: input.canSubscribe
      ? {
          label: SUBSCRIBE_LABEL,
          terms: `You will be charged ${PRICE} today, then ${PRICE} every month until you cancel.`,
        }
      : null,
  }
}
