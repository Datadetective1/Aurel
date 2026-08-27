import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { track } from '@/lib/analytics'
import { estimateCostMicros, hasKnownPrice } from './provider-cost'
import { requireUser } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { PLANS, type Capability, type MeterKind, type PlanId } from './plans'
import { applyAccessTier, parseAccessTier, type AccessTier } from './access'
import { brand } from '@/lib/brand'

/**
 * ENTITLEMENTS
 * =============================================================================
 * One place that answers "is this user allowed to do this, and how much is left".
 *
 * Call `checkCapability` BEFORE doing expensive work, and `recordUsage` after it
 * succeeds. Recording afterwards means a failed generation does not burn quota,
 * which is the behaviour a paying user expects.
 *
 * Per-account overrides are honoured, so support can grant extra quota without a
 * deploy. Overrides are service-role-writable only.
 * =============================================================================
 */

export interface Entitlements {
  plan: PlanId
  /**
   * Internal access tier. Orthogonal to `plan`: a pilot account is still on
   * the free plan commercially, it simply is not subject to its ceilings.
   */
  tier: AccessTier
  isFounding: boolean
  /** Start of the current billing period, used as the quota bucket key. */
  periodStart: string
  capabilities: Record<Capability, boolean>
  quotas: Partial<Record<MeterKind, number | null>>
  limits: { people: number | null }
}

/**
 * Quota periods are calendar months anchored to the 1st.
 *
 * Deliberately not the Stripe billing anchor: a user's quota resetting on a date
 * they cannot predict generates support tickets, and reconciling a mid-month
 * plan change against a shifting anchor is a source of off-by-one bugs.
 */
function currentPeriodStart(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export const getEntitlements = cache(async (): Promise<Entitlements> => {
  const user = await requireUser()
  const supabase = await createClient()

  const [{ data: subscription }, { data: overrides }, { data: grant }] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('plan, status, is_founding, current_period_end')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('entitlement_overrides')
      .select('capability, limit_value, enabled, expires_at')
      .eq('user_id', user.id),
    // Read-only to the account it belongs to, and unwritable from any
    // user-scoped connection -- see migration 0015. A revoked grant is a row
    // with revoked_at set, so revocation takes effect on the next read.
    supabase
      .from('access_grants')
      .select('tier, revoked_at')
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .maybeSingle(),
  ])

  // A subscription that lapsed drops to free rather than staying entitled.
  const rawPlan = (subscription?.plan ?? 'free') as PlanId
  const status = subscription?.status
  const entitledStatuses = ['trialing', 'active', 'past_due']
  const plan: PlanId =
    rawPlan !== 'free' && status && !entitledStatuses.includes(status) ? 'free' : rawPlan

  const definition = PLANS[plan] ?? PLANS.free
  const tier = parseAccessTier(grant?.tier)

  // Standard comes back identical to the plan. Full access lifts the ceiling
  // and nothing else -- metering is untouched, see lib/billing/access.
  const applied = applyAccessTier(tier, definition)
  const capabilities = applied.capabilities
  const quotas = applied.quotas

  const now = Date.now()
  for (const override of overrides ?? []) {
    if (override.expires_at && new Date(override.expires_at).getTime() < now) continue

    if (override.capability in capabilities) {
      capabilities[override.capability as Capability] = override.enabled
    }
    if (override.limit_value !== null && override.capability in quotas) {
      quotas[override.capability as MeterKind] = override.limit_value
    }
  }

  return {
    plan,
    tier,
    isFounding: subscription?.is_founding ?? false,
    periodStart: currentPeriodStart(),
    capabilities,
    quotas,
    limits: applied.limits,
  }
})

export type CapabilityCheck =
  | { allowed: true; remaining: number | null; limit: number | null }
  | {
      allowed: false
      reason: 'not_in_plan' | 'quota_exhausted'
      /** What the user is shown. Never mentions internal cost. */
      message: string
      limit: number | null
      used: number
      plan: PlanId
    }

/**
 * Check whether the user may perform a metered action right now.
 * `meter` may be omitted for capabilities that are on/off with no quota.
 */
export async function checkCapability(
  capability: Capability,
  meter?: MeterKind,
): Promise<CapabilityCheck> {
  const entitlements = await getEntitlements()

  if (!entitlements.capabilities[capability]) {
    return {
      allowed: false,
      reason: 'not_in_plan',
      message: `${CAPABILITY_LABELS[capability]} is available on Pro.`,
      limit: null,
      used: 0,
      plan: entitlements.plan,
    }
  }

  if (!meter) return { allowed: true, remaining: null, limit: null }

  const limit = entitlements.quotas[meter]
  if (limit === null || limit === undefined) {
    return { allowed: true, remaining: null, limit: null }
  }

  const used = await usageInPeriod(meter, entitlements.periodStart)

  if (used >= limit) {
    // Defined since the beginning and never fired. Which quota bites first, and
    // how often, is what tells us whether the free tier is the right shape --
    // and that is a pilot question, not a launch one.
    await track('limit_reached', { capability, meter, limit, plan: entitlements.plan })
    return {
      allowed: false,
      reason: 'quota_exhausted',
      message:
        entitlements.plan === 'free'
          ? // The label leads, rather than being spliced into a possessive.
            // "all 3 of this month's researching a person" was the result of
            // the old frame: these labels are noun phrases sized for "X is
            // available on Pro", and no single frame can make every one of
            // them read as a countable plural.
            `${CAPABILITY_LABELS[capability]}: you have used all ${limit} for this month. Upgrade for more, or wait until next month.`
          : `You have reached this month's fair-use limit of ${limit}. Contact support if you need more.`,
      limit,
      used,
      plan: entitlements.plan,
    }
  }

  return { allowed: true, remaining: limit - used, limit }
}

/** Consumption of one meter in the given period, for the current user. */
export async function usageInPeriod(meter: MeterKind, periodStart: string): Promise<number> {
  const user = await requireUser()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('usage_meters')
    .select('quantity')
    .eq('user_id', user.id)
    .eq('kind', meter)
    .eq('period_start', periodStart)

  if (error) {
    logger.warn('entitlements.usage_read_failed', { meter, code: error.code })
    // Fail closed would block a paying user on a transient read error; fail open
    // costs at most a small overage, which is the cheaper mistake.
    return 0
  }

  return (data ?? []).reduce((total, row) => total + row.quantity, 0)
}

export interface UsageRecord {
  meter: MeterKind
  quantity?: number
  /** Internal cost accounting. Never shown to users. */
  costUnits?: number
  provider?: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  /** Billable search-provider calls this unit of work made. */
  searchRequests?: number
  /** Which search vendor, when it differs from the model provider. */
  searchProvider?: string
  subjectKind?: string
  subjectId?: string
}

/**
 * Record billable consumption. Call AFTER the work succeeded.
 * Never throws: failing to meter must not fail the user's action.
 */
export async function recordUsage(record: UsageRecord): Promise<void> {
  try {
    const user = await requireUser()
    const supabase = await createClient()
    const entitlements = await getEntitlements()

    const { data: profile } = await supabase
      .from('profiles')
      .select('default_workspace_id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.default_workspace_id) {
      logger.warn('entitlements.no_workspace', { meter: record.meter })
      return
    }

    await supabase.from('usage_meters').insert({
      workspace_id: profile.default_workspace_id,
      user_id: user.id,
      kind: record.meter,
      quantity: record.quantity ?? 1,
      period_start: entitlements.periodStart,
      cost_units: record.costUnits ?? 0,
      provider: record.provider ?? null,
      model: record.model ?? null,
      input_tokens: record.inputTokens ?? null,
      output_tokens: record.outputTokens ?? null,
      subject_kind: record.subjectKind ?? null,
      subject_id: record.subjectId ?? null,
      search_requests: record.searchRequests ?? 0,
      // Priced at the moment the work ran, so a later price change does not
      // silently rewrite what last month cost.
      estimated_cost_micros: estimateCostMicros({
        provider: record.provider,
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        searchRequests: record.searchRequests,
        searchProvider: record.searchProvider,
      }),
    })

    // An unpriced model still bills; it just bills invisibly. Worth a line so
    // the gap is findable rather than showing up as a suspiciously cheap month.
    if (record.model && !hasKnownPrice(record.model)) {
      logger.warn('usage.unpriced_model', { meter: record.meter, model: record.model })
    }
  } catch (error) {
    logger.warn('entitlements.record_failed', {
      meter: record.meter,
      error: error instanceof Error ? error.name : 'unknown',
    })
  }
}

/** Whether the user may add another person. */
export async function checkPersonLimit(): Promise<CapabilityCheck> {
  const entitlements = await getEntitlements()
  if (entitlements.limits.people === null) {
    return { allowed: true, remaining: null, limit: null }
  }

  const user = await requireUser()
  const supabase = await createClient()
  const { count } = await supabase
    .from('people')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('archived_at', null)

  const used = count ?? 0
  if (used >= entitlements.limits.people) {
    return {
      allowed: false,
      reason: 'quota_exhausted',
      message: `The free plan holds ${entitlements.limits.people} people. Upgrade to Pro for unlimited relationship memory.`,
      limit: entitlements.limits.people,
      used,
      plan: entitlements.plan,
    }
  }

  return { allowed: true, remaining: entitlements.limits.people - used, limit: entitlements.limits.people }
}

/** Exported so the copy that embeds them can be tested. */
export const CAPABILITY_LABELS: Record<Capability, string> = {
  researchPerson: 'Researching a person',
  deepResearch: 'Deep research',
  meetingBrief: 'Meeting briefs',
  quickBrief: 'Quick Brief',
  debrief: 'Debriefs',
  transcriptAnalysis: 'Transcript analysis',
  documentAnalysis: 'Document analysis',
  aiCoach: brand.assistantName,
  messageAdaptation: 'Message adaptation',
  relationshipAtlas: 'The Relationship Atlas',
  weeklyIntelligence: 'Weekly relationship intelligence',
  calendarIntegration: 'Calendar integration',
  advancedMemory: 'Advanced relationship memory',
  teamWorkspace: 'Team workspaces',
  apiAccess: 'API access',
  dataExport: 'Data export',
}
