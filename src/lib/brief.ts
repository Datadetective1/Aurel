import type { MeetingBrief } from '@/lib/ai/prompts/meeting-brief'

/**
 * BRIEF VIEW MODEL
 * =============================================================================
 * Pure functions shared by the three depths of a meeting brief: the glance, the
 * sixty-second view and the full brief.
 *
 * Everything here is deterministic composition over an artifact that has
 * ALREADY been generated. No model is called from any of it. That is the whole
 * reason the graduated brief could ship without touching the AI boundary: the
 * three depths are three arrangements of one stored object, not three
 * generations.
 * =============================================================================
 */

/**
 * A brief with every collection guaranteed to exist.
 *
 * `ai_artifacts.content` is `Json` and is cast, never re-parsed — a brief
 * written before a field existed simply does not have it. The old view guarded
 * two fields (`publicContext`, `publicOnly`) and read the rest directly, which
 * was safe only because the schema had always required them. Three depths
 * reading the same object multiplies that bet, so the object is normalised once
 * at the boundary instead and every consumer downstream gets arrays.
 */
export interface NormalizedBrief {
  sixtySecond: string | null
  objective: string | null
  recommendedApproach: string[]
  participants: NormalizedParticipant[]
  roomDynamics: {
    decisionOwner: string | null
    informationNeeds: string[]
    knownDisagreements: string[]
    unresolvedIssues: string[]
    sequencing: string[]
  } | null
  howToOpen: string | null
  emphasize: string[]
  avoid: string[]
  questionsYouMayGet: { question: string; response: string }[]
  likelyObjections: { objection: string; response: string; basis: string | null }[]
  questionsToAsk: string[]
  outcomeToLeaveWith: string | null
  checklist: string[]
  uncertainties: string[]
}

export interface NormalizedParticipant {
  personId: string | null
  name: string
  relevance: string | null
  whatMatters: string[]
  guidance: string[]
  knownConcerns: string[]
  relationshipNote: string | null
  publicContext: { statement: string; sourceLabel: string | null }[]
  publicOnly: boolean
}

/** A non-empty trimmed string, or null. Blank strings are not content. */
function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

/** Every entry that is a usable string. Anything else is dropped, not coerced. */
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
  )
}

/**
 * Coerce a stored artifact into a shape the views can read without guarding.
 *
 * Accepts `unknown` deliberately: the caller is handing over a `Json` column,
 * and a signature that claimed `MeetingBrief` would be asserting exactly the
 * thing that is not known.
 */
export function normalizeBrief(raw: unknown): NormalizedBrief {
  const brief = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<MeetingBrief> &
    Record<string, unknown>

  const dynamics =
    typeof brief.roomDynamics === 'object' && brief.roomDynamics !== null
      ? (brief.roomDynamics as Record<string, unknown>)
      : null

  return {
    sixtySecond: str(brief.sixtySecond),
    objective: str(brief.objective),
    recommendedApproach: strings(brief.recommendedApproach),
    participants: records(brief.participants).map((p) => ({
      personId: str(p.personId),
      // The only field with no sensible empty rendering: a participant with no
      // name is a row that says nothing, so it is labelled rather than blank.
      name: str(p.name) ?? 'Unnamed participant',
      relevance: str(p.relevance),
      whatMatters: strings(p.whatMatters),
      guidance: strings(p.guidance),
      knownConcerns: strings(p.knownConcerns),
      relationshipNote: str(p.relationshipNote),
      publicContext: records(p.publicContext).flatMap((item) => {
        const statement = str(item.statement)
        return statement ? [{ statement, sourceLabel: str(item.sourceLabel) }] : []
      }),
      publicOnly: p.publicOnly === true,
    })),
    roomDynamics: dynamics
      ? {
          decisionOwner: str(dynamics.decisionOwner),
          informationNeeds: strings(dynamics.informationNeeds),
          knownDisagreements: strings(dynamics.knownDisagreements),
          unresolvedIssues: strings(dynamics.unresolvedIssues),
          sequencing: strings(dynamics.sequencing),
        }
      : null,
    howToOpen: str(brief.howToOpen),
    emphasize: strings(brief.emphasize),
    avoid: strings(brief.avoid),
    questionsYouMayGet: records(brief.questionsYouMayGet).flatMap((item) => {
      const question = str(item.question)
      const response = str(item.response)
      return question && response ? [{ question, response }] : []
    }),
    likelyObjections: records(brief.likelyObjections).flatMap((item) => {
      const objection = str(item.objection)
      const response = str(item.response)
      // `basis` is what makes an objection inspectable rather than asserted, but
      // it is not worth discarding the objection over.
      return objection && response ? [{ objection, response, basis: str(item.basis) }] : []
    }),
    questionsToAsk: strings(brief.questionsToAsk),
    outcomeToLeaveWith: str(brief.outcomeToLeaveWith),
    checklist: strings(brief.checklist),
    uncertainties: strings(brief.uncertainties),
  }
}

// --- what to listen for --------------------------------------------------

export interface ListeningCue {
  /** The thing to notice, verbatim from the record. */
  text: string
  /** Why it is here. Always a statement about the RECORD, never about a person. */
  note: string
}

export interface ListeningInput {
  openCommitments: { description: string; owner: 'user' | 'person' | 'shared' | string }[]
}

const MAX_CUES = 4

/**
 * WHAT TO LISTEN FOR.
 *
 * The one genuinely new element in the graduated brief, and the one that had to
 * be designed against the guardrails rather than merely checked against them.
 *
 * It composes NOTHING. Every cue is either a string already present in the
 * brief, a commitment the user wrote themselves, or a statement about an
 * absence in the record. No sentence is generated, no fragment is embedded in a
 * new frame, and no claim is made about what anybody feels, wants, intends or
 * will do — the cues are instructions about where the USER should put their
 * attention.
 *
 * Rewriting the source strings into listening sentences was tried first and
 * abandoned: the inputs are already full sentences from the composer, so
 * wrapping them produced "whether 'Whether the compliance deadline has moved.'
 * is still open". Selecting and labelling says the same thing and cannot
 * generate a claim by accident.
 *
 * Returns an empty array when there is nothing open. A section that pads itself
 * to look useful is the failure this product exists to avoid.
 */
export function listeningCues(brief: NormalizedBrief, input: ListeningInput): ListeningCue[] {
  const cues: ListeningCue[] = []

  for (const issue of brief.roomDynamics?.unresolvedIssues ?? []) {
    cues.push({ text: issue, note: 'Unresolved in your record' })
  }

  for (const commitment of input.openCommitments) {
    cues.push({
      text: commitment.description,
      note:
        commitment.owner === 'user'
          ? 'Still open — you owe this'
          : commitment.owner === 'person'
            ? 'Still open — they owe this'
            : 'Still open between you',
    })
  }

  // Named last because it is the weakest signal and the most important framing:
  // where there is no record, the honest instruction is to find out rather than
  // to check anything.
  const unknownPeople = brief.participants.filter((p) => p.publicOnly).map((p) => p.name)
  if (unknownPeople.length > 0) {
    cues.push({
      text: `How ${formatNames(unknownPeople)} ${unknownPeople.length === 1 ? 'works' : 'work'} — nothing is recorded yet.`,
      note: 'Nothing to check this against',
    })
  }

  return cues.slice(0, MAX_CUES)
}

/** "Maya", "Maya and Daniel", "Maya, Daniel and Priya". */
export function formatNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// --- proximity to the meeting --------------------------------------------

/**
 * How close the meeting is, as a bucket.
 *
 * Recorded on every depth-view event so the funnel can answer "is this being
 * opened in the corridor or at a desk the day before" — which is the question
 * the graduated brief exists to serve and was previously unanswerable.
 *
 * A BUCKET, not a number of minutes. Minutes-to-start plus a timestamp is a
 * precise reconstruction of when a specific user was in a specific meeting, and
 * analytics in this product carries counts and enum values only.
 */
export type StartProximity = 'unscheduled' | 'past' | 'imminent' | 'soon' | 'today' | 'ahead'

export function startProximity(
  scheduledAt: string | null | undefined,
  now: Date = new Date(),
): StartProximity {
  if (!scheduledAt) return 'unscheduled'
  const start = new Date(scheduledAt).getTime()
  if (Number.isNaN(start)) return 'unscheduled'

  const minutes = (start - now.getTime()) / 60_000
  if (minutes < 0) return 'past'
  if (minutes <= 15) return 'imminent'
  if (minutes <= 60) return 'soon'
  if (minutes <= 60 * 24) return 'today'
  return 'ahead'
}

/**
 * "in 7 minutes" / "starting now" / "started 5 minutes ago".
 *
 * Relative only — it never names a clock time, so it needs no time zone. The
 * absolute time is rendered separately by `formatTime`, which does take one.
 */
export function countdownLabel(
  scheduledAt: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!scheduledAt) return null
  const start = new Date(scheduledAt).getTime()
  if (Number.isNaN(start)) return null

  const minutes = Math.round((start - now.getTime()) / 60_000)

  if (minutes <= -60) {
    const hours = Math.round(-minutes / 60)
    return `started ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  }
  if (minutes <= -1) return `started ${-minutes} ${minutes === -1 ? 'minute' : 'minutes'} ago`
  if (minutes <= 0) return 'starting now'
  if (minutes === 1) return 'in 1 minute'
  if (minutes < 60) return `in ${minutes} minutes`

  const hours = Math.round(minutes / 60)
  return `in ${hours} ${hours === 1 ? 'hour' : 'hours'}`
}

/** Minutes until a meeting starts, or null. Negative once it has begun. */
export function minutesUntil(
  scheduledAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!scheduledAt) return null
  const start = new Date(scheduledAt).getTime()
  if (Number.isNaN(start)) return null
  return Math.round((start - now.getTime()) / 60_000)
}
