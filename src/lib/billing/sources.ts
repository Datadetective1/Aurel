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
 *
 * The rule: the most generous ACTIVE source wins, and the product never asks
 * which one it was except to show where to manage billing. A pilot who also
 * pays keeps full access; a lapsed Stripe plan never cancels an Apple one.
 * =============================================================================
 */

export type EntitlementProvider = 'stripe' | 'apple' | 'manual' | 'none'

export interface ProviderState {
  plan: PlanId
  status: string | null
}

export interface EntitlementSources {
  stripe: ProviderState | null
  /** Always null until App Store subscriptions are activated. */
  apple: ProviderState | null
  tier: AccessTier
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

  const billingProviders: ResolvedEntitlement['billingProviders'] = []
  if (stripePlan !== 'free') billingProviders.push('stripe')
  if (applePlan !== 'free') billingProviders.push('apple')

  const plan = RANK[applePlan] > RANK[stripePlan] ? applePlan : stripePlan
  const provider: EntitlementProvider =
    plan !== 'free'
      ? RANK[applePlan] > RANK[stripePlan]
        ? 'apple'
        : 'stripe'
      : sources.tier !== 'standard'
        ? 'manual'
        : 'none'

  return { plan, provider, billingProviders }
}
