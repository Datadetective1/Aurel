/**
 * THE NATIVE APP'S CONTRACT
 * =============================================================================
 * Request and response shapes for `/api/mobile/*`. Pure types: the routes
 * import them to type what they return, and the Expo app imports the same
 * file (through its `@atturel/web` path alias) to type what it reads. One
 * definition, so the two cannot drift.
 *
 * Every route authenticates with the user's Supabase access token as
 * `Authorization: Bearer <token>`, runs as that user under row level
 * security, and answers 401 `{ error: 'unauthenticated' }` without one.
 * =============================================================================
 */

import type { ListeningCue, NormalizedBrief } from '@/lib/brief'
import type { PrepState } from '@/lib/visual/glance'
import type {
  VisualConnection,
  VisualGlance,
  VisualLoop,
  VisualMeetingSummary,
  VisualPerson,
  VisualPersonDetail,
} from '@/lib/visual/types'

export type {
  VisualConnection,
  VisualGlance,
  VisualLoop,
  VisualMeetingSummary,
  VisualPerson,
  VisualPersonDetail,
  PrepState,
  NormalizedBrief,
  ListeningCue,
}
export type { TimelineEntry, TimelineKind } from '@/lib/visual/timeline'
export type { ActionDirection } from '@/lib/visual/relationship-actions'

export interface ApiError {
  error: string
}

// --- GET /api/mobile/me -------------------------------------------------------
export interface MeResponse {
  id: string
  name: string
  timeZone: string
  onboarded: boolean
}

// --- GET /api/mobile/today ----------------------------------------------------
export interface TodayResponse {
  name: string
  timeZone: string
  now: string
  meetings: VisualMeetingSummary[]
  /** Active loops, most pressing first, at most eight. */
  loops: VisualLoop[]
  /** Conversations whose proposals still wait on the user. */
  awaitingReview: { id: string; title: string; occurredAt: string; pending: number }[]
}

// --- GET /api/mobile/meetings/:id ---------------------------------------------
export interface MeetingResponse {
  meeting: { id: string; title: string; scheduledAt: string | null; objective: string | null }
  timeZone: string
  prep: PrepState
  people: VisualPerson[]
  glance: VisualGlance
  quick: {
    objective: string | null
    outcomeToLeaveWith: string | null
    howToOpen: string | null
    recommendedApproach: string[]
    participants: {
      personId: string | null
      name: string
      guidance: string[]
      knownConcerns: string[]
      publicOnly: boolean
    }[]
    cues: ListeningCue[]
    likelyObjections: { objection: string; response: string; basis: string | null }[]
    uncertainties: string[]
  } | null
  /** The whole stored brief, for the Deep depth. Null before one is prepared. */
  deep: NormalizedBrief | null
  loops: VisualLoop[]
  lastConversation: {
    id: string
    title: string
    occurredAt: string
    outcome: string | null
    summary: string | null
  } | null
  connections: VisualConnection[]
  /** True when the brief was composed from records without a language model. */
  grounded: boolean | null
  preparedAt: string | null
}

// --- GET /api/mobile/people ---------------------------------------------------
export interface PeopleResponse {
  timeZone: string
  people: (VisualPerson & { relationshipLabel: string })[]
}

// --- GET /api/mobile/people/:id -----------------------------------------------
export type PersonResponse = VisualPersonDetail & { timeZone: string }

// --- POST /api/mobile/ask -----------------------------------------------------
export interface AskRequest {
  question: string
}
export interface AskResponse {
  answer: string
  grounded: boolean
  followUps: string[]
  citations: {
    label: string
    evidenceLevel: 'confirmed' | 'observed' | 'inferred' | 'unknown'
    personId?: string | null
  }[]
  people: { id: string; name: string; src: string | null }[]
}

// --- POST /api/mobile/conversations ---------------------------------------------
export interface CaptureRequest {
  /** The words: a transcript returned by the transcription route, or typed notes. */
  text: string
  sourceKind: 'voice_note' | 'typed_notes' | 'meeting_recording'
  title?: string
  meetingId?: string
  participantIds?: string[]
  durationSeconds?: number
  /**
   * Required true for a recording of other people. The app asks; the product
   * cannot know, so it records that it asked -- the same gate as the web.
   */
  consent?: boolean
}
export interface CaptureResponse {
  interactionId: string
}

// --- GET/POST /api/mobile/conversations/:id/review -----------------------------
export interface ReviewResponse {
  conversation: {
    id: string
    title: string
    occurredAt: string
    summary: string | null
    outcome: string | null
  }
  processing: 'pending' | 'processing' | 'ready' | 'failed'
  loops: {
    id: string
    description: string
    direction: VisualLoop['direction']
    owner: 'user' | 'person' | 'shared'
    kind: 'commitment' | 'question' | 'follow_up'
    dueOn: string | null
    personName: string | null
    excerpt: string | null
    /** Pre-selected when the reading is confident; the user still decides. */
    likely: boolean
  }[]
  decisions: { id: string; description: string; excerpt: string | null; likely: boolean }[]
  /** Relationship memories proposed for people; confirmed on the person page. */
  memoryProposals: number
}
export interface ReviewRequest {
  keepLoops: string[]
  keepDecisions: string[]
}
export interface ReviewResult {
  message: string
}

// --- GET /api/mobile/atlas ------------------------------------------------------
export interface AtlasResponse {
  timeZone: string
  /** People grouped by the organisation on their record, largest first. */
  organizations: { name: string; domain: string | null; people: VisualPerson[] }[]
  unaffiliated: VisualPerson[]
  /** Connections the record holds at both ends; never inferred. */
  connections: VisualConnection[]
  /** People the user marked important with no contact in 30 days. */
  goingQuiet: VisualPerson[]
}
