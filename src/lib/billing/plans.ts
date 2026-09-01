/**
 * PLAN CONFIGURATION
 * =============================================================================
 * The single place commercial policy lives. Prices, quotas and capabilities are
 * data here, never `if (plan === 'pro')` scattered through components — that is
 * what makes a pricing experiment a config change instead of a refactor.
 *
 * DELIBERATE CHOICE: storing a person is NOT metered.
 * Relationship memory only compounds if people add colleagues freely. Charging
 * per stored person creates "is this person worth a credit?" hesitation, which
 * directly attacks the moat. Meter the expensive *actions* instead: research,
 * briefs, transcript and document analysis, coach usage.
 * =============================================================================
 */

export type PlanId = 'free' | 'pro' | 'team'

/** How a paid plan is billed. Two prices, two intervals, no others. */
export type BillingInterval = 'monthly' | 'yearly'

/**
 * Subscription status, mirroring the `subscription_status` enum in the
 * database. Stripe's vocabulary, narrowed to the values we store.
 */
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused'

/**
 * The statuses under which a paid plan still grants its capabilities.
 *
 * `past_due` is here on purpose: Stripe retries a failed card for weeks before
 * giving up, and revoking a paying customer's access on the first decline —
 * usually an expired card, not a decision — is how a recoverable billing
 * problem becomes a cancellation.
 *
 * ONE definition. This list used to be written out separately in the
 * entitlement resolver and in the webhook, which meant the answer to "is this
 * account entitled" depended on which file you asked.
 */
export const ENTITLED_STATUSES = [
  'trialing',
  'active',
  'past_due',
] as const satisfies readonly SubscriptionStatus[]

/** Whether a status keeps a paid plan alive. */
export function isEntitledStatus(status: string | null | undefined): boolean {
  return Boolean(status) && (ENTITLED_STATUSES as readonly string[]).includes(status as string)
}

/** Everything the app can gate on. Add here, never inline. */
export type Capability =
  | 'researchPerson'
  | 'deepResearch'
  | 'meetingBrief'
  | 'quickBrief'
  | 'debrief'
  | 'transcriptAnalysis'
  | 'documentAnalysis'
  | 'aiCoach'
  | 'messageAdaptation'
  | 'relationshipAtlas'
  | 'weeklyIntelligence'
  | 'calendarIntegration'
  | 'advancedMemory'
  | 'teamWorkspace'
  | 'apiAccess'
  | 'dataExport'

/** Meter keys mirror the `meter_kind` enum in the database. */
export type MeterKind =
  | 'person_research'
  | 'deep_research'
  | 'meeting_brief'
  | 'quick_brief'
  | 'transcript_analysis'
  | 'document_analysis'
  | 'ai_coach_message'
  | 'message_adaptation'
  | 'source_ingest'
  | 'voice_transcription'

export interface PlanDefinition {
  id: PlanId
  name: string
  tagline: string
  /** Monthly price in minor units (cents). null means "contact us". */
  monthlyPriceCents: number | null
  yearlyPriceCents: number | null
  /** Capabilities enabled at all on this plan. */
  capabilities: Record<Capability, boolean>
  /** Monthly quotas. `null` means unlimited (fair use still applies). */
  quotas: Partial<Record<MeterKind, number | null>>
  /**
   * Soft limits on stored entities. `people` is intentionally generous on Free
   * and unlimited on Pro — see the note at the top of this file.
   */
  limits: { people: number | null }
  highlights: string[]
}

const NO_CAPABILITIES: Record<Capability, boolean> = {
  researchPerson: false,
  deepResearch: false,
  meetingBrief: false,
  quickBrief: false,
  debrief: false,
  transcriptAnalysis: false,
  documentAnalysis: false,
  aiCoach: false,
  messageAdaptation: false,
  relationshipAtlas: false,
  weeklyIntelligence: false,
  calendarIntegration: false,
  advancedMemory: false,
  teamWorkspace: false,
  apiAccess: false,
  dataExport: false,
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Enough to feel the difference before your next important meeting.',
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    capabilities: {
      ...NO_CAPABILITIES,
      // Free must demonstrate the actual product, not a crippled preview.
      researchPerson: true,
      meetingBrief: true,
      quickBrief: true,
      debrief: true,
      aiCoach: true,
      messageAdaptation: true,
      dataExport: true,
      // The quota below already granted 2 document analyses a month, but the
      // capability was off, so the quota was unreachable. A document is just
      // text in a file — allowing a pasted transcript while refusing the same
      // words as an attachment is a distinction a user would experience as
      // arbitrary.
      documentAnalysis: true,
    },
    quotas: {
      person_research: 3,
      meeting_brief: 3,
      quick_brief: 10,
      ai_coach_message: 20,
      message_adaptation: 5,
      transcript_analysis: 1,
      document_analysis: 2,
      source_ingest: 15,
      deep_research: 0,
      // Speech-to-text is the one path in the product where money leaves before
      // anything is written down, and it ran with no ceiling at all: the meter
      // recorded the spend and nothing enforced it, so a free account could
      // drive unbounded paid transcription 4MB at a time.
      //
      // Anchored to the debrief this feeds rather than picked freely: a free
      // account gets one transcript analysis a month, and a few attempts at
      // recording it, because a recording can fail for reasons that are not
      // the user's fault. Revisit with usage data — see the note in
      // docs/STRIPE_PRODUCTION_SETUP.md.
      voice_transcription: 5,
    },
    limits: { people: 5 },
    highlights: [
      'Your Interaction Profile',
      'Up to 5 people',
      '3 researched people and 3 meeting briefs a month',
      'Debrief and confirm what you learn',
      'Export or delete everything, any time',
    ],
  },

  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'The full relationship record, and preparation for every room.',
    monthlyPriceCents: 1900,
    yearlyPriceCents: 19000,
    capabilities: {
      researchPerson: true,
      deepResearch: true,
      meetingBrief: true,
      quickBrief: true,
      debrief: true,
      transcriptAnalysis: true,
      documentAnalysis: true,
      aiCoach: true,
      messageAdaptation: true,
      relationshipAtlas: true,
      weeklyIntelligence: true,
      calendarIntegration: true,
      advancedMemory: true,
      dataExport: true,
      teamWorkspace: false,
      apiAccess: false,
    },
    quotas: {
      // Generous fair-use ceilings rather than unlimited, because these calls
      // have real per-unit cost.
      person_research: 60,
      deep_research: 20,
      meeting_brief: 150,
      quick_brief: null,
      ai_coach_message: 600,
      message_adaptation: 200,
      transcript_analysis: 60,
      document_analysis: 100,
      source_ingest: 500,
      // Well above any plausible honest use, which is what a fair-use ceiling
      // is for: it exists to stop a runaway loop, not to ration a customer.
      voice_transcription: 300,
    },
    limits: { people: null },
    // WHAT THIS LIST MAY SAY: a difference the code actually enforces, and
    // nothing else.
    //
    // It used to promise "Calendar integration and the Relationship Atlas" and
    // "Weekly relationship intelligence". The first two are built and ungated —
    // a free account already has both, so they were being sold something they
    // had. The third is not built at all: there is an email template and no job
    // that sends it. Deep research is the same, a capability flag with nothing
    // behind it.
    //
    // Those flags stay above, because they are the framework a future gate
    // plugs into. Selling them is the part that had to stop. plans.test.ts
    // fails if an unenforced capability reappears here.
    highlights: [
      'Unlimited people and relationship memory',
      '60 researched people and 150 meeting briefs a month',
      'Transcript analysis on your debriefs',
      '600 coach questions and 100 documents a month',
      'Export or delete everything, any time',
    ],
  },

  team: {
    id: 'team',
    name: 'Teams',
    tagline: 'Shared account and stakeholder context, with private notes staying private.',
    monthlyPriceCents: null,
    yearlyPriceCents: null,
    capabilities: {
      researchPerson: true,
      deepResearch: true,
      meetingBrief: true,
      quickBrief: true,
      debrief: true,
      transcriptAnalysis: true,
      documentAnalysis: true,
      aiCoach: true,
      messageAdaptation: true,
      relationshipAtlas: true,
      weeklyIntelligence: true,
      calendarIntegration: true,
      advancedMemory: true,
      teamWorkspace: true,
      apiAccess: true,
      dataExport: true,
    },
    quotas: { quick_brief: null },
    limits: { people: null },
    highlights: [
      'Everything in Pro, per seat',
      'Shared account and stakeholder context',
      'Your private notes stay private',
      'Shared meetings and commitments',
    ],
  },
}

/**
 * Founding-customer promotion. Configuration, not a promotions engine.
 *
 * OFF, and it must stay off until a Stripe price backs it.
 *
 * There is no STRIPE_PRICE_PRO_FOUNDING. Checkout has only ever had two price
 * ids to choose between — see `priceIdFor` in lib/billing/stripe — so a button
 * reading "Upgrade at the founding price" charged the ordinary monthly price
 * instead. Advertising one number and charging another is not a display bug;
 * it is a claim the payment cannot honour, and it survived unnoticed because
 * the deployment has never had Stripe keys to expose it.
 *
 * The 2900 below is also now ABOVE list price. Pro is 1900. Re-enabling this
 * without changing that number would strike through $19 and offer $29 as the
 * discount.
 *
 * The mechanism is kept rather than deleted: `is_founding`, `founding_number`
 * and `price_protected_until` are live columns, the webhook still honours a
 * grandfathered founding account, and `foundingOfferAdvertisable()` below is
 * the single gate every surface asks before showing any of this. Two tests in
 * plans.test.ts fail if a founding price is ever advertised at or above list.
 */
export const FOUNDING_OFFER = {
  enabled: false,
  label: 'Founding',
  /** Promotion closes once this many founding subscriptions exist. */
  maxCustomers: 250,
  monthlyPriceCents: 2900,
  /** How long the founding price is honoured. Not lifetime. */
  priceProtectionMonths: 12,
  blurb: 'Founding price held for 12 months.',
} as const

/** Human-readable price, e.g. "$19". */
export function formatPrice(cents: number | null, currency = 'USD'): string {
  if (cents === null) return 'Contact us'
  if (cents === 0) return 'Free'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)
}

/** Percentage saved by paying annually, rounded down. */
export function annualSavingPercent(plan: PlanDefinition): number | null {
  if (!plan.monthlyPriceCents || !plan.yearlyPriceCents) return null
  const fullYear = plan.monthlyPriceCents * 12
  if (fullYear <= plan.yearlyPriceCents) return null
  return Math.floor(((fullYear - plan.yearlyPriceCents) / fullYear) * 100)
}

/**
 * Whether the founding price may be shown to anyone.
 *
 * Every founding surface asks this rather than reading `enabled` directly. A
 * promotion is advertisable only when it is switched on AND it is actually
 * cheaper than the plan it discounts — the second half is what stops a stale
 * number quietly becoming an upsell.
 *
 * It deliberately does NOT check for a Stripe price id, because this module is
 * shared with the client bundle and must not read server env. The env-aware
 * half of the guard lives in `foundingOfferSellable()` in lib/billing/stripe.
 */
export function foundingOfferAdvertisable(plan: PlanDefinition = PLANS.pro): boolean {
  if (!FOUNDING_OFFER.enabled) return false
  if (plan.monthlyPriceCents === null) return false
  return FOUNDING_OFFER.monthlyPriceCents < plan.monthlyPriceCents
}

/**
 * What an annual subscription works out to per month, in cents.
 *
 * Shown beside the annual price because "$190 a year" and "$19 a month" are
 * hard to compare at a glance, and the comparison is the entire argument for
 * paying annually.
 */
export function monthlyEquivalentCents(plan: PlanDefinition): number | null {
  if (!plan.yearlyPriceCents) return null
  return Math.round(plan.yearlyPriceCents / 12)
}
