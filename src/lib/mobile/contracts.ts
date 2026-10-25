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
  /** The profile as stored, for the Account screen's editor. Absent on older servers. */
  profile?: MeProfile
}

export interface MeProfile {
  fullName: string
  preferredName: string | null
  jobTitle: string | null
  company: string | null
  pronouns: string | null
  timezone: string | null
  /** Signed, short-lived URL of the user's own photo, or null. */
  photo: string | null
}

// --- PATCH /api/mobile/me ------------------------------------------------------
/** The whole profile form; the same validation as Settings › Profile on the web. */
export interface UpdateProfileRequest {
  fullName: string
  preferredName?: string
  jobTitle?: string
  company?: string
  pronouns?: string
  timezone?: string
}
export type UpdateProfileResponse =
  { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

// --- POST / DELETE /api/mobile/me/photo and /api/mobile/people/:id/photo -------
/** POST is multipart with one `photo` field: JPEG, PNG or WebP, at most 2 MB. */
export type PhotoResponse = { ok: true; photo: string | null } | { ok: false; error: string }

// --- GET / PATCH /api/mobile/preferences ----------------------------------------
export interface PreferencesResponse {
  /** Account and product email (billing, security). */
  emailNotifications: boolean
  /** The follow-through digest of open loops. */
  followThroughEmail: boolean
}
export type UpdatePreferencesRequest = Partial<PreferencesResponse>

// --- GET /api/mobile/export ------------------------------------------------------
/** Everything stored for the account, as the web's export: a JSON document. */
export type ExportResponse = { ok: true; json: string } | { ok: false; error: string }

// --- POST /api/mobile/sign-up --------------------------------------------------
/** No bearer token: this is how an account starts. Same rules as the web form. */
export interface SignUpRequest {
  fullName: string
  email: string
  password: string
}
export type SignUpResponse =
  | { ok: true; needsConfirmation: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

// --- POST /api/mobile/onboarding ------------------------------------------------
/** The one required onboarding step. Answers before onboarding, like /me. */
export interface OnboardingRequest {
  fullName: string
  preferredName?: string
  jobTitle?: string
  company?: string
  /** IANA zone from the device, e.g. "America/Chicago". */
  timezone?: string
}
export type OnboardingResponse =
  { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

// --- GET /api/mobile/account ---------------------------------------------------
export interface AccountResponse {
  email: string | null
  name: string
  /** "Free", "Pro", "Full access". */
  planLabel: string
  /** Where the plan is managed, so the app never shows a web-only control as its own. */
  billing: 'none' | 'web' | 'apple' | 'included'
  legal: { privacyUrl: string; termsUrl: string; supportEmail: string }
  capture: CaptureLimits
  /** Whether the fictional sample record is in this account. Absent on older servers. */
  sampleData?: { loaded: boolean }
  /** Connected calendars, read-only: connecting is done on the web. Absent on older servers. */
  calendar?: { connections: CalendarConnection[] }
}

export interface CalendarConnection {
  provider: 'google' | 'microsoft' | string
  status: string
  accountEmail: string | null
  lastSyncedAt: string | null
}

/** What the server will accept for one recording, so the app can say so up front. */
export interface CaptureLimits {
  /** Longest recording the app should allow, in seconds. */
  maxSeconds: number
  /** Segment length for segmented upload, or null when only a single upload is available. */
  segmentSeconds: number | null
  /** Transcription left this month, in seconds; null when unlimited. */
  remainingSeconds?: number | null
  /**
   * How each recorded part reaches transcription. `storage`: a signed upload
   * to private, temporary storage (migration 0022). `direct`: one request per
   * part to /api/conversations/transcribe, each part well under the
   * request-body ceiling. Absent on servers that predate parts, which means
   * `storage` when `segmentSeconds` is set and a single upload otherwise.
   */
  partTransport?: 'storage' | 'direct'
}

// --- POST /api/mobile/access ----------------------------------------------------
/** A pilot invitation code, redeemed exactly as on the web. */
export interface RedeemAccessRequest {
  code: string
}
export type RedeemAccessResponse = { ok: true; message: string } | { ok: false; error: string }

// --- DELETE /api/mobile/account ------------------------------------------------
export interface DeleteAccountRequest {
  confirmation: string
  appleAcknowledged?: boolean
}
export type DeleteAccountResponse =
  | { deleted: true }
  | {
      deleted: false
      stage: 'billing' | 'apple_acknowledgement' | 'data' | 'login' | 'confirmation'
      error: string
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
  meeting: {
    id: string
    title: string
    scheduledAt: string | null
    objective: string | null
    /** Part of the fictional sample record. */
    isDemo?: boolean
  }
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

// --- POST /api/mobile/meetings ----------------------------------------------------
/** A meeting created on the phone. The same validation as the web form. */
export interface CreateMeetingRequest {
  title: string
  /** Required, as on the web: a brief cannot optimise for nothing. */
  objective: string
  /** Wall-clock time in the account's zone, "YYYY-MM-DDTHH:mm"; omitted for unscheduled. */
  scheduledAt?: string
  durationMinutes?: number
  /** People already on record. Anyone not the caller's is ignored. */
  attendeeIds?: string[]
}
export type CreateMeetingResponse =
  | { ok: true; meetingId: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

// --- POST /api/mobile/meetings/:id/attendees -----------------------------------------
export interface AddAttendeeRequest {
  personId: string
}
export type AddAttendeeResponse = { ok: true } | { ok: false; error: string }

// --- POST /api/mobile/meetings/:id/prepare -----------------------------------------
/** Build the brief. Same entitlement, metering and evidence trail as the web. */
export type PrepareResponse =
  { ok: true; grounded: boolean | null } | { ok: false; error: string; upgrade?: boolean }

// --- GET /api/mobile/people ---------------------------------------------------
export interface PeopleResponse {
  timeZone: string
  people: (VisualPerson & { relationshipLabel: string })[]
}

// --- POST /api/mobile/people --------------------------------------------------
export interface CreatePersonRequest {
  fullName: string
  jobTitle?: string
  organizationName?: string
  preferredName?: string
  email?: string
  profileUrl?: string
  relationshipType?: string
  pronouns?: string
  timezone?: string
  notes?: string
  /**
   * Ask the server to stop and say so when this person probably exists
   * already. Off unless sent, so builds that predate it keep their behaviour.
   */
  checkDuplicate?: boolean
  /** "Add as someone new" after a duplicate was shown. */
  confirmDuplicate?: boolean
}
export type CreatePersonResponse =
  | { ok: true; personId: string }
  | {
      ok: false
      error: string
      fieldErrors?: Record<string, string[]>
      duplicate?: PossibleDuplicate
    }

export interface PossibleDuplicate {
  id: string
  name: string
  organization: string | null
  archived: boolean
  reason: 'email' | 'profile' | 'name'
}

// --- GET /api/mobile/people?archived=1 --------------------------------------------
export interface ArchivedPeopleResponse {
  people: {
    id: string
    name: string
    company: string | null
    archivedAt: string
    isDemo: boolean
  }[]
}

// --- PATCH /api/mobile/people/:id ---------------------------------------------------
/** The whole person form, as the web's edit page: fields left out are cleared. */
export interface UpdatePersonRequest {
  fullName: string
  preferredName?: string
  jobTitle?: string
  organizationName?: string
  email?: string
  profileUrl?: string
  relationshipType?: string
  relevance?: number
  pronouns?: string
  timezone?: string
  notes?: string
}
export type UpdatePersonResponse =
  { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

// --- POST /api/mobile/people/:id/archive | /restore -----------------------------
export type PersonLifecycleResponse = { ok: true } | { ok: false; error: string }

// --- GET /api/mobile/people/:id/deletion -------------------------------------------
/** What a permanent delete would do, counted from the record; the confirmation's three lists. */
export interface DeletionPreviewResponse {
  person: { id: string; name: string; archivedAt: string | null }
  deleted: string[]
  unlinked: string[]
  retainedLoops: { id: string; description: string; status: string; mentionsPerson: boolean }[]
}

// --- DELETE /api/mobile/people/:id ---------------------------------------------------
/** Only an archived person, and only with the confirmation spelled out. */
export interface DeletePersonRequest {
  confirm: 'delete'
}
export type DeletePersonResponse = { ok: true; keptLoops: number } | { ok: false; error: string }

// --- PATCH / DELETE /api/mobile/loops/:id ----------------------------------------------
export interface EditLoopRequest {
  description: string
}

// --- POST /api/mobile/loops/:id ---------------------------------------------------
/** Done, Later, Cancel, Reopen: the web's one-tap loop actions. */
export interface LoopActionRequest {
  action: 'done' | 'later' | 'cancel' | 'reopen'
}
export type LoopActionResponse = { ok: true } | { ok: false; error: string }

// --- POST / DELETE /api/mobile/sample-data ------------------------------------------
/**
 * The fictional sample record (invented people, flagged `is_demo`). POST loads
 * it, idempotently; DELETE removes it together with anything captured with
 * those invented people, and nothing else.
 */
export type SampleDataResponse = { ok: true; message: string } | { ok: false; error: string }

// --- GET /api/mobile/people/:id -----------------------------------------------
export type PersonResponse = VisualPersonDetail & {
  timeZone: string
  /** The stored fields, for the person editor. Absent on older servers. */
  edit?: PersonEditFields
}

export interface PersonEditFields {
  fullName: string
  preferredName: string | null
  jobTitle: string | null
  organizationName: string | null
  email: string | null
  profileUrl: string | null
  relationshipType: string
  relevance: number
  pronouns: string | null
  timezone: string | null
  notes: string | null
}

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
  decisions: {
    id: string
    description: string
    excerpt: string | null
    /** Pre-selected when settled and confident; never when only proposed. */
    likely: boolean
    /**
     * The words only propose it -- a suggestion, recommendation, hypothetical
     * or open question. Shown as "Proposed, not decided" and never pre-ticked.
     * Absent from servers older than finding 8.7's fix.
     */
    proposed?: boolean
  }[]
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
