import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { track } from '@/lib/analytics'
import { estimateCostMicros, hasKnownPrice } from './provider-cost'
import { requireUser } from '@/lib/auth'
import { logger } from '@/lib/logger'
import {
  PLANS,
  isEntitledStatus,
  type BillingInterval,
  type Capability,
  type MeterKind,
  type PlanId,
  type SubscriptionStatus,
} from './plans'
import {
  applyAccessTier,
  hasFullAccess,
  isBillable,
  parseAccessTier,
  resolveLevel,
  type AccessTier,
  type EntitlementLevel,
} from './access'
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

/**
 * What Stripe currently says about this account, in our vocabulary.
 *
 * Every field is nullable and none of it is inferred. A screen that cannot
 * find a renewal date must say nothing rather than compute a plausible one:
 * a confidently wrong billing date is worse than an absent one.
 */
export interface BillingSummary {
  status: SubscriptionStatus | null
  /** Which of the two prices is being billed. Null when nothing is. */
  interval: BillingInterval | null
  /** End of the period already paid for. Renewal date, or expiry when leaving. */
  currentPeriodEnd: string | null
  /** Set when the customer has cancelled but the paid period has not run out. */
  cancelAtPeriodEnd: boolean
  trialEndsAt: string | null
  /** Whether there is a Stripe customer to open a billing portal for. */
  hasCustomer: boolean
}

export interface Entitlements {
  plan: PlanId
  /**
   * Internal access tier. Orthogonal to `plan`: a pilot account is still on
   * the free plan commercially, it simply is not subject to its ceilings.
   */
  tier: AccessTier
  /**
   * The two axes above collapsed into the one answer a screen actually wants.
   * Switch on this rather than re-deriving it.
   */
  level: EntitlementLevel
  /** Whether this account may be shown prices and payment buttons at all. */
  billable: boolean
  isFounding: boolean
  /** Start of the current billing period, used as the quota bucket key. */
  periodStart: string
  billing: BillingSummary
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
      // One literal: the generated types resolve the row shape from the text
      // of this string, and a concatenation defeats that silently.
      .select(
        'plan, status, is_founding, current_period_end, cancel_at_period_end, billing_interval, trial_ends_at, stripe_customer_id',
      )
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
  //
  // A cancellation scheduled for the end of the period is NOT a lapse: Stripe
  // holds the subscription at 'active' until the period actually runs out and
  // only then sends the deleted event. Somebody who cancels on day two keeps
  // what they paid for, which is both the law and the decent reading.
  const rawPlan = (subscription?.plan ?? 'free') as PlanId
  const status = (subscription?.status ?? null) as SubscriptionStatus | null
  const plan: PlanId = rawPlan !== 'free' && !isEntitledStatus(status) ? 'free' : rawPlan

  const definition = PLANS[plan] ?? PLANS.free
  const tier = parseAccessTier(grant?.tier)

  // Standard comes back identical to the plan. Full access lifts the ceiling
  // and nothing else -- metering is untouched, see lib/billing/access.
  const applied = applyAccessTier(tier, definition)
  const capabilities = applied.capabilities
  const quotas = applied.quotas

  // Overrides are applied AFTER the tier, so a stale one -- a support grant
  // written while the account was still standard, then left behind -- could
  // switch a capability back off for an owner or narrow a quota the tier had
  // set to unlimited. Full access means full access; there is nothing an
  // override can usefully say about an account that already has everything.
  const now = Date.now()
  if (!hasFullAccess(tier)) {
    for (const override of overrides ?? []) {
      if (override.expires_at && new Date(override.expires_at).getTime() < now) continue

      if (override.capability in capabilities) {
        capabilities[override.capability as Capability] = override.enabled
      }
      if (override.limit_value !== null && override.capability in quotas) {
        quotas[override.capability as MeterKind] = override.limit_value
      }
    }
  }

  const level = resolveLevel(plan, tier)

  return {
    plan,
    tier,
    level,
    billable: isBillable(level),
    isFounding: subscription?.is_founding ?? false,
    periodStart: currentPeriodStart(),
    billing: {
      status,
      // Read from the stored interval rather than re-derived from the price id,
      // which lives in server env and would make this unresolvable the moment
      // a price is rotated.
      interval: normaliseInterval(subscription?.billing_interval),
      currentPeriodEnd: subscription?.current_period_end ?? null,
      cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
      trialEndsAt: subscription?.trial_ends_at ?? null,
      hasCustomer: Boolean(subscription?.stripe_customer_id),
    },
    capabilities,
    quotas,
    limits: applied.limits,
  }
})

/** `billing_interval` is a free-text column; anything unrecognised is nothing. */
function normaliseInterval(value: string | null | undefined): BillingInterval | null {
  return value === 'monthly' || value === 'yearly' ? value : null
}

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
    // The METER is what ran out, and it is not always the capability: pasting a
    // link is gated by `researchPerson` against the `source_ingest` budget, and
    // naming the capability there described an action the user had not taken.
    const label = METER_LABELS[meter] ?? CAPABILITY_LABELS[capability]

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
            `${label}: you have used all ${limit} for this month. Upgrade for more, or wait until next month.`
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

/**
 * What a QUOTA is called, which is not always what the capability is called.
 *
 * `checkCapability('researchPerson', 'source_ingest')` gates pasting a link,
 * and naming the capability there told somebody who had pasted a URL that they
 * had "used all 15 of Researching a person" — a noun and a number matching
 * neither the thing they did nor anything on their account screen. The meter is
 * the thing that ran out, so the meter is what the sentence should name.
 */
export const METER_LABELS: Record<MeterKind, string> = {
  person_research: 'Researching a person',
  deep_research: 'Deep research',
  meeting_brief: 'Meeting briefs',
  quick_brief: 'Quick Brief',
  transcript_analysis: 'Transcript analysis',
  document_analysis: 'Document analysis',
  ai_coach_message: brand.assistantName,
  message_adaptation: 'Message adaptation',
  source_ingest: 'Reading links and notes',
  voice_transcription: 'Voice debrief recording',
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
