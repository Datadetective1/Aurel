import type { Capability, MeterKind, PlanDefinition } from './plans'

/**
 * ACCESS TIERS
 * =============================================================================
 * Who the product is open to without the free tier's ceilings.
 *
 * Three tiers, and only two of them do anything. STANDARD resolves through the
 * plan definitions untouched — the same capabilities, the same quotas, the same
 * arithmetic that shipped. Whatever this file does, an ordinary account must
 * come out the other side exactly as it does today.
 *
 * OWNER and PILOT lift the ceiling. They do NOT touch metering: usage_meters
 * still records every unit of work and every vendor cost for these accounts,
 * because knowing what the pilot costs is the entire reason to run one. The
 * lift is on `checkCapability`; `recordUsage` never learns tiers exist.
 * =============================================================================
 */

export type AccessTier = 'standard' | 'pilot' | 'owner'

/** Tiers that bypass plan ceilings. Owner and pilot differ in who may assign
 *  them, not in what they can reach. */
export function hasFullAccess(tier: AccessTier): boolean {
  return tier === 'owner' || tier === 'pilot'
}

/**
 * Apply a tier to a resolved plan.
 *
 * Returns the plan's own capabilities and quotas untouched for standard. For a
 * full-access tier, every capability is on and every quota is null, which is
 * the value the rest of entitlements already reads as "unlimited" — so no
 * quota-checking code needed a special case for this feature.
 */
export function applyAccessTier(
  tier: AccessTier,
  definition: PlanDefinition,
): {
  capabilities: Record<Capability, boolean>
  quotas: Partial<Record<MeterKind, number | null>>
  limits: { people: number | null }
} {
  if (!hasFullAccess(tier)) {
    return {
      capabilities: { ...definition.capabilities },
      quotas: { ...definition.quotas },
      limits: definition.limits,
    }
  }

  const capabilities = Object.fromEntries(
    Object.keys(definition.capabilities).map((key) => [key, true]),
  ) as Record<Capability, boolean>

  // Every meter the plan knows about, set to null rather than a large number.
  // A big number is still a cliff, and a pilot user hitting one at an
  // unpredictable moment is exactly the experience this exists to prevent.
  const quotas = Object.fromEntries(
    Object.keys(definition.quotas).map((key) => [key, null]),
  ) as Partial<Record<MeterKind, number | null>>

  return { capabilities, quotas, limits: { people: null } }
}

/** Narrow an arbitrary database value to a tier, defaulting to standard. */
export function parseAccessTier(value: unknown): AccessTier {
  return value === 'owner' || value === 'pilot' ? value : 'standard'
}
