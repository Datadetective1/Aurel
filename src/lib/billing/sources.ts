import type { AccessTier } from './access'
import type { PlanId } from './plans'
import { effectivePlan } from './subscription-state'

/**
 * WHERE AN ACCOUNT'S ACCESS COMES FROM
 * =============================================================================
 * One canonical answer, fed by any number of providers:
 *
 *   stripe   web subscriptions, written only by the signed webhook into
 *            `subscriptions`
 *   apple    App Store subscriptions -- NOT ACTIVE. The slot exists so the
 *            resolution rule is decided now; nothing writes it yet. See
 *            docs/STOREKIT.md for the table and server notifications it needs.
 *   manual   owner and pilot grants in `access_grants`, and support overrides
 *   trial    the 14-day Pro trial Atturel grants itself, with no card and no
 *            Stripe subscription (lib/billing/trial). Never a billing provider:
 *            there is nothing to stop when it ends, or when the account goes.
 *
 * The rule: the most generous ACTIVE source wins, and the product never asks
 * which one it was except to show where to manage billing. A pilot who also
 * pays keeps full access; a lapsed Stripe plan never cancels an Apple one.
 * =============================================================================
 */

export type EntitlementProvider = 'stripe' | 'apple' | 'trial' | 'manual' | 'none'

export interface ProviderState {
  plan: PlanId
  status: string | null
}

export interface EntitlementSources {
  stripe: ProviderState | null
  /** Always null until App Store subscriptions are activated. */
  apple: ProviderState | null
  /** The app's own trial and when it ends, when the account has one. */
  trial?: { endsAt: string } | null
  tier: AccessTier
  now?: Date
}

const RANK: Record<PlanId, number> = { free: 0, pro: 1, team: 2 }

export interface ResolvedEntitlement {
  plan: PlanId
  /** Which provider confers the plan; 'manual' when only a grant lifts it. */
  provider: EntitlementProvider
  /** Every provider currently billing this account -- each one must be
   *  stopped on deletion, and each is stopped differently. */
  billingProviders: Exclude<EntitlementProvider, 'manual' | 'none'>[]
}

export function resolveEntitlement(sources: EntitlementSources): ResolvedEntitlement {
  const stripePlan = effectivePlan(sources.stripe)
  const applePlan = effectivePlan(sources.apple)
  const now = (sources.now ?? new Date()).getTime()
  // A trial confers Pro until it ends, and nothing after.
  const trialPlan: PlanId =
    sources.trial && new Date(sources.trial.endsAt).getTime() > now ? 'pro' : 'free'

  const billingProviders: ResolvedEntitlement['billingProviders'] = []
  if (stripePlan !== 'free') billingProviders.push('stripe')
  if (applePlan !== 'free') billingProviders.push('apple')

  const paid = RANK[applePlan] > RANK[stripePlan] ? applePlan : stripePlan
  // A paid source wins a tie with the trial: it is the one that bills.
  const plan = RANK[trialPlan] > RANK[paid] ? trialPlan : paid
  const provider: EntitlementProvider =
    plan === 'free'
      ? sources.tier !== 'standard'
        ? 'manual'
        : 'none'
      : RANK[trialPlan] > RANK[paid]
        ? 'trial'
        : RANK[applePlan] > RANK[stripePlan]
          ? 'apple'
          : 'stripe'

  return { plan, provider, billingProviders }
}
