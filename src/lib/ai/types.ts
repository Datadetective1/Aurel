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
  /** Role in the specific meeting being prepared for, when applicable. */
  meetingRole?: AttendeeRole
}

export interface UserContext {
  id: string
  displayName: string
  jobTitle: string | null
  company: string | null
  coachingStyle: CoachingStyle
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
 * "why is Aurel recommending this" panel renders from — it is recorded at
 * generation time and never reconstructed afterwards.
 */
export interface Citation {
  label: string
  evidenceLevel: EvidenceLevel
  observationId?: string
  interactionId?: string
  commitmentId?: string
  personId?: string
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
 * key configured, or when a model call fails, Aurel still returns real guidance
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
}
