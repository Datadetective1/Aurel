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
    monthlyPriceCents: 4900,
    yearlyPriceCents: 42000,
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
    },
    limits: { people: null },
    highlights: [
      'Unlimited people and relationship memory',
      'Research a person’s public professional footprint',
      'Meeting briefs, Quick Brief and debriefs',
      'Calendar integration and the Relationship Atlas',
      'Weekly relationship intelligence',
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
 * Enable by setting `enabled` and providing a Stripe price id in env.
 */
export const FOUNDING_OFFER = {
  enabled: true,
  label: 'Founding',
  /** Promotion closes once this many founding subscriptions exist. */
  maxCustomers: 250,
  monthlyPriceCents: 2900,
  /** How long the founding price is honoured. Not lifetime. */
  priceProtectionMonths: 12,
  blurb: 'Founding price held for 12 months.',
} as const

/** Human-readable price, e.g. "$49". */
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
