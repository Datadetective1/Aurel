import type { z } from 'zod'
import type { Database } from '@/lib/supabase/types'

export type EvidenceLevel = Database['public']['Enums']['evidence_level']
export type ArtifactKind = Database['public']['Enums']['artifact_kind']
export type RelationshipType = Database['public']['Enums']['relationship_type']
export type MeetingKind = Database['public']['Enums']['meeting_kind']
export type AttendeeRole = Database['public']['Enums']['attendee_role']
export type CoachingStyle = Database['public']['Enums']['coaching_style']

/**
 * CONTEXT SHAPES
 * =============================================================================
 * These are the *only* things a prompt ever sees. Assembling them explicitly
 * — rather than handing a model a database dump — is what keeps generations
 * grounded, cheap, and auditable: every field here can be traced back to a row
 * the user owns, and anything absent is genuinely absent rather than withheld.
 * =============================================================================
 */

export interface ObservationContext {
  id: string
  content: string
  category: Database['public']['Enums']['observation_category']
  evidenceLevel: EvidenceLevel
  reinforcementCount: number
  lastReinforcedAt: string | null
  /** Excerpts from the interactions that support this observation. */
  sources: { interactionId: string | null; excerpt: string | null }[]
}

export interface InteractionContext {
  id: string
  title: string
  occurredAt: string
  kind: Database['public']['Enums']['interaction_kind']
  summary: string | null
  outcome: string | null
  wentWell: number | null
}

export interface CommitmentContext {
  id: string
  description: string
  owner: Database['public']['Enums']['commitment_owner']
  ownerName: string | null
  dueOn: string | null
  isOverdue: boolean
}

export interface PersonContext {
  id: string
  fullName: string
  preferredName: string | null
  /** What to call them in generated copy. */
  displayName: string
  jobTitle: string | null
  organization: string | null
  relationshipType: RelationshipType
  /** User-declared, 1-5. Never inferred. */
  relevance: number
  notes: string | null
  topics: string[]
  firstInteractionAt: string | null
  lastInteractionAt: string | null
  interactionCount: number
  /** Grouped so a prompt can never confuse a fact with an inference. */
  observations: {
    confirmed: ObservationContext[]
    observed: ObservationContext[]
    inferred: ObservationContext[]
  }
  recentInteractions: InteractionContext[]
  openCommitments: CommitmentContext[]
  /**
   * Source-backed public professional facts, from research.
   *
   * Kept separate from `observations` on purpose. An observation is what it is
   * like to WORK with someone, earned through interaction. A fact is who they
   * are professionally, taken from public material. They age differently, they
   * are sourced differently, and one must never be presented as the other.
   */
  professionalFacts: ProfessionalFactContext[]
  /** Public sources analysed for this person, newest first. */
  publicSources: PublicSourceContext[]
  /** When research last ran. Null means never. */
  lastResearchedAt: string | null
  /** Role in the specific meeting being prepared for, when applicable. */
  meetingRole?: AttendeeRole
}

export interface ProfessionalFactContext {
  id: string
  kind: string
  value: string
  detail: string | null
  evidenceLevel: EvidenceLevel
  /** Publication or confirmation date, when the source stated one. */
  asOf: string | null
  /** True when sources disagreed and it could not be resolved. */
  hasConflict: boolean
  /** Titles of the sources supporting it, for citation. */
  sourceTitles: string[]
}

export interface PublicSourceContext {
  id: string
  title: string | null
  url: string | null
  publisher: string | null
  sourceType: string
  retrievedAt: string | null
  publishedAt: string | null
  /** How confident we are that this source is about THIS person. */
  identityStatus: string | null
}

export interface UserContext {
  id: string
  displayName: string
  jobTitle: string | null
  company: string | null
  coachingStyle: CoachingStyle
  /**
   * IANA zone. Carried into every prompt so the model is told what day it is
   * WHERE THE USER IS -- notes say "by Friday" far more often than they give a
   * date, and anchoring that to the server's calendar resolves it a day out for
   * anyone west of Greenwich after their evening.
   */
  timeZone: string
  /** The user's own Interaction Profile, when they have completed one. */
  interactionProfile: {
    archetype: string
    confidence: 'provisional' | 'moderate' | 'strong'
    /** Only dimensions that actually lean, phrased as plain statements. */
    leanings: { label: string; pole: string; blurb: string }[]
  } | null
}

export interface MeetingContext {
  id: string
  title: string
  kind: MeetingKind
  scheduledAt: string | null
  durationMinutes: number | null
  objective: string | null
  stakes: string | null
  extraContext: string | null
  importance: number
  participants: PersonContext[]
}

/**
 * EVIDENCE ACCOUNTING
 * Every generation returns the citations it actually used. This is what the
 * "why is Atturel recommending this" panel renders from — it is recorded at
 * generation time and never reconstructed afterwards.
 */
export interface Citation {
  label: string
  evidenceLevel: EvidenceLevel
  observationId?: string
  interactionId?: string
  commitmentId?: string
  personId?: string
  /** A public source this claim rests on, so the user can open it. */
  sourceId?: string
  sourceUrl?: string
}

export interface Provenance {
  provider: string
  model: string
  promptVersion: string
  latencyMs: number
  /** True when composed deterministically from evidence rather than generated. */
  groundedFallback: boolean
  tokenUsage: { input: number; output: number } | null
}

export interface Generation<T> {
  output: T
  citations: Citation[]
  provenance: Provenance
}

/**
 * A capability. Each one ships BOTH a model prompt and a deterministic composer.
 *
 * The composer is not a stub: it is the honest floor of the product. With no API
 * key configured, or when a model call fails, Atturel still returns real guidance
 * assembled from the user's own evidence — clearly labelled as composed rather
 * than generated. That keeps the app fully usable and the failure mode truthful
 * instead of an error page.
 */
export interface PromptModule<TInput, TOutput> {
  id: string
  kind: ArtifactKind
  /** Bump whenever the prompt or the schema changes in a way that alters output. */
  version: string
  schema: z.ZodType<TOutput>
  system: (input: TInput) => string
  user: (input: TInput) => string
  /** Deterministic evidence composition. Must never invent facts. */
  compose: (input: TInput) => TOutput
  /** Citations for the composed output, and the floor for generated output. */
  cite: (input: TInput) => Citation[]
  /**
   * Overwrite fields the model is not entitled to decide.
   *
   * Some fields in these schemas are not judgments -- they are facts about
   * where evidence came from, and the record already knows them. A model handed
   * a person's interaction history will cheerfully summarise it into a field
   * labelled "public", because it has no way to know the label is a promise to
   * the user rather than a heading.
   *
   * Applied to generated output only. Composed output is already built from the
   * record and has nothing to reconcile.
   */
  reconcile?: (output: TOutput, input: TInput) => TOutput
}
