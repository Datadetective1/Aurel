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

import { brand } from '@/lib/brand'

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
  /** Seconds of audio transcribed. Measured on every plan; no allowance yet. */
  | 'transcription_seconds'

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
      // Quick Brief is composed from the record without a model call, so it
      // costs nothing to run and is not metered on any plan.
      quick_brief: null,
      ai_coach_message: 20,
      message_adaptation: 5,
      // Conversations are the loop the product now closes -- keep one, see
      // what it left open, confirm, follow through. One a month cannot show
      // that; ten can, and the reading costs about the same as a brief.
      transcript_analysis: 10,
      document_analysis: 2,
      source_ingest: 15,
      deep_research: 0,
    },
    limits: { people: 5 },
    highlights: [
      'Your Interaction Profile',
      'Up to 5 people',
      '3 researched people and 3 meeting briefs a month',
      'Keep 10 conversations a month and confirm what they left open',
      `20 questions to ${brand.assistantName} a month`,
      'Export or delete everything, any time',
    ],
  },

  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'The full relationship record, and preparation for every room.',
    // The launch price is the founding price; see FOUNDING_OFFER. There is no
    // annual plan in this launch.
    monthlyPriceCents: 2900,
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
      'Keep up to 60 conversations a month',
      'Calendar integration and the Relationship Atlas',
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
    ],
  },
}

/**
 * PRO FOUNDING
 * =============================================================================
 * The launch offer: Pro at $29 a month. Configuration, not a promotions engine.
 *
 * The Stripe price behind it is STRIPE_PRICE_PRO_MONTHLY; checkout refuses to
 * start if that price does not bill exactly this amount monthly in USD, so the
 * page can never show one price while Stripe charges another.
 *
 * Deliberately UNSET until approved in writing: a cap on founding places, a
 * reference ("was") price and a price-lock duration. Each one is a public
 * promise. While null, none is shown, enforced or stored.
 * =============================================================================
 */
export const FOUNDING_OFFER: {
  enabled: boolean
  label: string
  monthlyPriceCents: number
  currency: 'usd'
  maxCustomers: number | null
  referencePriceCents: number | null
  priceProtectionMonths: number | null
} = {
  enabled: true,
  label: 'Pro Founding',
  monthlyPriceCents: 2900,
  currency: 'usd',
  maxCustomers: null,
  referencePriceCents: null,
  priceProtectionMonths: null,
}

/** The sentence about the price lock, only when one has been approved. */
export function foundingProtectionBlurb(): string | null {
  const months = FOUNDING_OFFER.priceProtectionMonths
  return months ? `Founding price held for ${months} months.` : null
}

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
