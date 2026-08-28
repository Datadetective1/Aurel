import { z } from 'zod'
import type { Citation, MeetingContext, PersonContext, PromptModule, UserContext } from '../types'
import {
  BRAND_VOICE,
  MEETING_KIND_LABEL,
  RELATIONSHIP_LABEL,
  dateBlock,
  renderPerson,
  renderUser,
  styleBlock,
} from './shared'
import { brand } from '@/lib/brand'

/**
 * MEETING BRIEF
 * =============================================================================
 * The paid-value centrepiece: turn a room, an objective and a relationship
 * record into something the user can act on in the next hour.
 * =============================================================================
 */

export const participantBriefSchema = z.object({
  personId: z.string(),
  name: z.string(),
  /** Their professional role and why they matter to this objective. */
  relevance: z.string(),
  /** What matters to them, grounded in the record. */
  whatMatters: z.array(z.string()).max(4),
  /** How to communicate with them specifically. */
  guidance: z.array(z.string()).max(4),
  /** Concerns they have actually raised before. Empty when none are recorded. */
  knownConcerns: z.array(z.string()).max(4),
  /** One line on the state of this relationship. */
  relationshipNote: z.string(),
  /**
   * Source-backed public professional context.
   *
   * A SEPARATE field from `whatMatters` and `guidance` on purpose. Public
   * material tells you who someone is; it does not tell you what it is like to
   * work with them. Merging the two would let a conference bio masquerade as
   * relationship knowledge, which is the failure this product exists to avoid.
   */
  //
  // Required, not defaulted. OpenAI's strict structured outputs reject optional
  // properties — a Zod `.default()` marks the field not-required in the emitted
  // JSON Schema, which would make every generated brief fail validation and
  // fall silently back to the composer. The composer always supplies both, so
  // requiring them costs nothing.
  publicContext: z
    .array(z.object({ statement: z.string(), sourceLabel: z.string().nullable() }))
    .max(6),
  /** True when the ONLY thing known is public. Drives the preliminary framing. */
  publicOnly: z.boolean(),
})

export const meetingBriefSchema = z.object({
  /** The whole brief compressed to what you could read walking down a corridor. */
  sixtySecond: z.string(),
  objective: z.string(),
  recommendedApproach: z.array(z.string()).min(2).max(6),
  participants: z.array(participantBriefSchema),
  roomDynamics: z
    .object({
      decisionOwner: z.string().nullable(),
      informationNeeds: z.array(z.string()).max(5),
      knownDisagreements: z.array(z.string()).max(5),
      unresolvedIssues: z.array(z.string()).max(5),
      /** Suggested order to work the room, each step tied to a person. */
      sequencing: z.array(z.string()).max(6),
    })
    .nullable(),
  howToOpen: z.string(),
  emphasize: z.array(z.string()).max(5),
  avoid: z.array(z.string()).max(5),
  questionsYouMayGet: z.array(z.object({ question: z.string(), response: z.string() })).max(5),
  likelyObjections: z
    .array(z.object({ objection: z.string(), response: z.string(), basis: z.string() }))
    .max(5),
  questionsToAsk: z.array(z.string()).max(5),
  outcomeToLeaveWith: z.string(),
  checklist: z.array(z.string()).max(6),
  /** What Atturel does NOT know. Rendered prominently — this is a trust feature. */
  uncertainties: z.array(z.string()).max(5),
})

export type MeetingBrief = z.infer<typeof meetingBriefSchema>

export interface MeetingBriefInput {
  meeting: MeetingContext
  user: UserContext
}

// --- deterministic composition ------------------------------------------------

const sentence = (s: string) => (s.trim().endsWith('.') ? s.trim() : `${s.trim()}.`)

/** Whole months between a date and now. Used only for freshness warnings. */
function monthsSince(iso: string): number {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 0
  return (Date.now() - then) / (1000 * 60 * 60 * 24 * 30.44)
}

function firstName(p: PersonContext) {
  return p.preferredName ?? p.displayName.split(' ')[0] ?? p.displayName
}

/** Observations that speak to how to communicate, most-supported first. */
function communicationSignals(p: PersonContext) {
  return [...p.observations.confirmed, ...p.observations.observed]
    .filter((o) => ['communication', 'preference', 'decision'].includes(o.category))
    .sort((a, b) => b.reinforcementCount - a.reinforcementCount)
}

function frictionSignals(p: PersonContext) {
  return [...p.observations.confirmed, ...p.observations.observed].filter((o) =>
    ['friction', 'trust'].includes(o.category),
  )
}

const FACT_PREFIX: Record<string, string> = {
  current_role: 'Role:',
  current_organization: 'Organisation:',
  prior_role: 'Previously:',
  education: 'Education:',
  expertise: 'Works on:',
  theme: 'Recurring public theme:',
  publication: 'Published:',
  appearance: 'Public appearance:',
  location: 'Based in:',
  communication_signal: 'Publicly observed:',
}

/**
 * Turn stored facts into readable lines, each carrying its source.
 *
 * Undated facts are marked rather than dropped. "VP Engineering" from a page of
 * unknown age is still useful — presented as unquestionably current, it is a
 * liability.
 */
function composePublicContext(p: PersonContext) {
  // A current_role fact already carries the organisation in its detail, so
  // listing current_organization as well reads as the same thing said twice
  // ("Currently CEO — Microsoft." / "At Microsoft.").
  const role = p.professionalFacts.find((f) => f.kind === 'current_role')
  const roleOrg = role?.detail?.trim().toLowerCase()
  const facts = p.professionalFacts.filter(
    (f) => !(f.kind === 'current_organization' && f.value.trim().toLowerCase() === roleOrg),
  )

  return facts.slice(0, 6).map((fact) => {
    const prefix = FACT_PREFIX[fact.kind]
    // Values are proper nouns as often as not — "Microsoft", "Artificial
    // Intelligence". Lower-casing the first word to fit a sentence frame
    // produced "At microsoft" and "artificial Intelligence", so the frames are
    // written to accept the value as it stands instead.
    const body = fact.detail ? `${fact.value} — ${fact.detail}` : fact.value
    const stated = prefix ? `${prefix} ${body}` : body

    const qualifier = fact.hasConflict
      ? ' (sources disagree)'
      : fact.evidenceLevel === 'inferred'
        ? ' (inferred from a single mention)'
        : fact.asOf
          ? // NOT "as of": the date belongs to the source, not to the fact.
            // Wikipedia's page for a chief executive is dated years before they
            // held the job, and "CEO as of 2013" would simply be wrong.
            ` (from a source published ${formatFactDate(fact.asOf)})`
          : ' (the source gave no date)'

    return {
      statement: sentence(stated) + qualifier,
      sourceLabel: fact.sourceTitles[0] ?? null,
    }
  })
}

/** "23 January 2013" — readable, unambiguous, and not an ISO timestamp. */
function formatFactDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10)
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function composeParticipant(p: PersonContext) {
  const comms = communicationSignals(p)
  const friction = frictionSignals(p)
  const priorities = [...p.observations.confirmed, ...p.observations.observed].filter((o) =>
    ['priority', 'context'].includes(o.category),
  )

  const whatMatters = priorities.slice(0, 3).map((o) => o.content)
  if (whatMatters.length === 0 && p.topics.length > 0) {
    whatMatters.push(`Recurring topics with them: ${p.topics.slice(0, 4).join(', ')}.`)
  }

  const guidance = comms.slice(0, 3).map((o) => {
    // Attribute observed patterns; state confirmed ones plainly.
    return o.evidenceLevel === 'confirmed'
      ? sentence(o.content)
      : `Across ${o.reinforcementCount > 1 ? `${o.reinforcementCount} recorded interactions` : 'a recorded interaction'}: ${o.content.replace(/\.$/, '')}.`
  })

  const overdue = p.openCommitments.filter((c) => c.isOverdue)
  if (overdue.length > 0) {
    guidance.unshift(
      `Address the overdue commitment before anything else: ${overdue[0]!.description}`,
    )
  }

  const publicContext = composePublicContext(p)
  // Public-only means: we know who they are, not what they are like to work
  // with. That distinction changes how firmly everything below should be read.
  const publicOnly = p.interactionCount === 0 && publicContext.length > 0

  let relationshipNote: string
  if (p.interactionCount === 0 && publicContext.length > 0) {
    relationshipNote =
      `Relationship history: none yet. What follows about them is public professional ` +
      `context, not a read on how they work with you — treat communication guidance as preliminary.`
  } else if (p.interactionCount === 0) {
    relationshipNote = `No recorded interactions yet. Treat everything below as a starting point, not a read.`
  } else {
    const last = p.lastInteractionAt ? formatFactDate(p.lastInteractionAt) : 'an unrecorded date'
    const open = p.openCommitments.length
    relationshipNote =
      `${p.interactionCount} recorded interaction${p.interactionCount === 1 ? '' : 's'}, most recently ${last}.` +
      (open > 0 ? ` ${open} open commitment${open === 1 ? '' : 's'}.` : ' No open commitments.')
  }

  return {
    personId: p.id,
    name: p.displayName,
    relevance:
      (p.jobTitle ? `${p.jobTitle}. ` : '') +
      `${RELATIONSHIP_LABEL[p.relationshipType] ?? 'A colleague'}, marked ${p.relevance}/5 for importance.`,
    whatMatters: whatMatters.slice(0, 4),
    guidance: guidance.slice(0, 4),
    knownConcerns: friction.slice(0, 4).map((o) => o.content),
    relationshipNote,
    publicContext,
    publicOnly,
  }
}

function composeMeetingBrief(input: MeetingBriefInput): MeetingBrief {
  const { meeting, user } = input
  const people = meeting.participants
  const kindLabel = MEETING_KIND_LABEL[meeting.kind] ?? 'meeting'

  const allCommitments = people.flatMap((p) => p.openCommitments.map((c) => ({ ...c, person: p })))
  const overdue = allCommitments.filter((c) => c.isOverdue)
  const knownPeople = people.filter((p) => p.interactionCount > 0)
  const unknownPeople = people.filter((p) => p.interactionCount === 0)

  const objective = meeting.objective?.trim() || 'No objective recorded for this meeting yet.'

  // --- sixty second brief ---
  const sixty: string[] = []
  sixty.push(
    `${kindLabel[0]!.toUpperCase()}${kindLabel.slice(1)} with ${
      people.length === 0
        ? 'no participants recorded'
        : people.length === 1
          ? firstName(people[0]!)
          : `${people.slice(0, -1).map(firstName).join(', ')} and ${firstName(people[people.length - 1]!)}`
    }.`,
  )
  if (meeting.objective) {
    // "You want to agreement on scope" is not a sentence. Same frame-selection
    // rule as howToOpen and outcomeToLeaveWith: match the grammar the user wrote.
    sixty.push(
      readsAsImperative(meeting.objective)
        ? `You want to ${lowerFirst(stripLeadingVerb(meeting.objective))}`
        : `What you want out of it: ${lowerFirst(meeting.objective)}`,
    )
  }
  if (overdue.length > 0) {
    sixty.push(
      `Clear the overdue commitment first — ${overdue[0]!.description} (${firstName(overdue[0]!.person)}).`,
    )
  }
  const topSignal = knownPeople.flatMap(communicationSignals)[0]
  if (topSignal) {
    const owner = knownPeople.find((p) => communicationSignals(p).includes(topSignal))
    sixty.push(`${owner ? `${firstName(owner)}: ` : ''}${sentence(topSignal.content)}`)
  }
  if (meeting.stakes) sixty.push(`At stake: ${lowerFirst(meeting.stakes)}`)
  if (knownPeople.length === 0) {
    const researched = people.filter((p) => p.professionalFacts.length > 0)
    sixty.push(
      researched.length > 0
        ? `You have not worked with ${
            researched.length === people.length ? 'anyone in this room' : 'them'
          } before — what follows is public professional context, not a read on them.`
        : 'You have no recorded history with anyone in this room, so this brief is thin.',
    )
  }

  // --- recommended approach ---
  const approach: string[] = []
  if (overdue.length > 0) {
    approach.push(
      `Open by closing the loop on ${overdue[0]!.description}, before you ask for anything.`,
    )
  }
  const detailFirst = people.find((p) =>
    communicationSignals(p).some((o) =>
      /data|evidence|number|detail|proof|utilisation|utilization/i.test(o.content),
    ),
  )
  if (detailFirst) {
    approach.push(
      `Bring supporting evidence to the front — ${firstName(detailFirst)} has asked for it before.`,
    )
  }
  if (meeting.objective) {
    approach.push(`State the decision you need clearly and early: ${lowerFirst(meeting.objective)}`)
  }
  const decisionOwner = people.find((p) => p.meetingRole === 'decision_maker')
  if (decisionOwner) {
    approach.push(
      `Close with ${firstName(decisionOwner)}, who owns the decision, and confirm the next step.`,
    )
  } else {
    approach.push('Confirm who owns the next step and by when, before the meeting ends.')
  }
  if (unknownPeople.length > 0) {
    approach.push(
      `Use this meeting to learn how ${unknownPeople.map(firstName).join(' and ')} prefer${unknownPeople.length === 1 ? 's' : ''} to work. Add what you notice afterwards.`,
    )
  }
  while (approach.length < 2) approach.push('Confirm the outcome and the owner before you leave.')

  // --- room dynamics: only when there is genuinely a room ---
  const roomDynamics =
    people.length < 2
      ? null
      : {
          decisionOwner: decisionOwner ? decisionOwner.displayName : null,
          informationNeeds: people
            .flatMap((p) =>
              communicationSignals(p)
                .slice(0, 1)
                .map((o) => `${firstName(p)}: ${o.content}`),
            )
            .slice(0, 5),
          knownDisagreements: people
            .flatMap((p) =>
              frictionSignals(p)
                .slice(0, 1)
                .map((o) => `${firstName(p)}: ${o.content}`),
            )
            .slice(0, 5),
          unresolvedIssues: allCommitments
            .slice(0, 5)
            .map(
              (c) =>
                `${c.description} (${c.owner === 'user' ? 'you owe' : `${firstName(c.person)} owes`}${c.dueOn ? `, due ${c.dueOn}` : ''})`,
            ),
          sequencing: buildSequencing(people, decisionOwner),
        }

  // --- opening ---
  const howToOpen = overdue.length
    ? // Commitment descriptions are user-written and usually imperative
      // ("Send the utilisation numbers"), so they cannot be spliced into a
      // spoken sentence. Quote the item instead of conjugating it.
      `Close the loop before you ask for anything: say where "${stripTrailingStop(overdue[0]!.description)}" stands.`
    : meeting.objective
      ? // Objectives are written in whatever voice the user chose ("Get approval",
        // "I need sign-off", "Agreement on scope"). Any frame that splices the
        // objective into a verb phrase will be ungrammatical for some of them,
        // so the objective is quoted as a goal rather than conjugated.
        readsAsImperative(meeting.objective)
        ? // An imperative objective is already a sentence. Announcing it as
          // one beats forcing it into "...is <command>".
          `Name the outcome in the first thirty seconds: "Here is what I want us to do today: ${lowerFirst(stripLeadingVerb(meeting.objective))}"`
        : `Name the outcome in the first thirty seconds: "What I'd like us to settle today is ${lowerFirst(stripLeadingVerb(meeting.objective))}"`
      : `Open by stating what you want the meeting to produce, so the room is working toward the same thing.`

  // --- emphasise / avoid ---
  const emphasize: string[] = []
  const avoid: string[] = []
  for (const p of knownPeople) {
    for (const o of communicationSignals(p).slice(0, 2)) {
      if (/first|before|up front|lead with|headline|recommendation/i.test(o.content)) {
        emphasize.push(`${firstName(p)}: ${o.content}`)
      }
    }
    for (const o of frictionSignals(p).slice(0, 2)) {
      avoid.push(`${firstName(p)}: ${o.content}`)
    }
  }
  if (emphasize.length === 0 && meeting.objective) {
    emphasize.push('The specific decision you need, stated once, plainly.')
  }
  if (avoid.length === 0) {
    avoid.push('Opening with methodology before anyone has heard the recommendation.')
  }
  if (unknownPeople.length > 0) {
    avoid.push(
      `Assuming you know how ${unknownPeople.map(firstName).join(' or ')} prefer${unknownPeople.length === 1 ? 's' : ''} to be approached — you have no record yet.`,
    )
  }

  // --- objections drawn only from recorded friction ---
  const likelyObjections = people
    .flatMap((p) =>
      frictionSignals(p)
        .slice(0, 2)
        .map((o) => ({
          objection: `${firstName(p)} may return to: ${o.content}`,
          response:
            'Acknowledge it directly, then show what has changed since they raised it. Do not re-argue the original point.',
          basis:
            o.evidenceLevel === 'confirmed'
              ? 'They raised this themselves.'
              : `Observed across ${o.reinforcementCount} recorded interaction${o.reinforcementCount === 1 ? '' : 's'}.`,
        })),
    )
    .slice(0, 5)

  // --- questions to ask ---
  const questionsToAsk: string[] = []
  if (decisionOwner) {
    questionsToAsk.push(
      `"${firstName(decisionOwner)}, what would you need to see to decide today?"`,
    )
  }
  for (const p of unknownPeople.slice(0, 2)) {
    questionsToAsk.push(`"${firstName(p)}, how do you like to receive this kind of update?"`)
  }
  questionsToAsk.push('"What have I not asked about that would change this?"')
  if (allCommitments.length > 0) {
    questionsToAsk.push('"Is there anything still open from last time that I have missed?"')
  }

  // --- outcome + checklist ---
  const outcomeToLeaveWith = meeting.objective
    ? readsAsImperative(meeting.objective)
      ? // "A clear answer on leave with a decision" is not a sentence. When the
        // objective is a command, state it as one and append the conditions.
        `${asSentence(stripLeadingVerb(meeting.objective))} — with a named owner and a date.`
      : `A clear answer on ${stripTrailingStop(lowerFirst(meeting.objective))}, plus a named owner and a date.`
    : 'A named owner and a date for the next step, even if the decision itself is deferred.'

  const checklist: string[] = []
  if (detailFirst) checklist.push(`Supporting evidence ready for ${firstName(detailFirst)}`)
  if (overdue.length > 0) checklist.push(`Status on: ${overdue[0]!.description}`)
  checklist.push('One-sentence version of your ask')
  checklist.push('The decision you want, written down')
  if (people.length > 1) checklist.push('Who you need in agreement, and in what order')
  checklist.push('Where you will capture what you learn afterwards')

  // --- uncertainties: what Atturel genuinely does not know ---
  const uncertainties: string[] = []

  // Someone researched but never met is a different state from someone we know
  // nothing about, and the difference is worth stating precisely.
  const publicOnlyPeople = unknownPeople.filter((p) => p.professionalFacts.length > 0)
  const trulyUnknown = unknownPeople.filter((p) => p.professionalFacts.length === 0)

  if (publicOnlyPeople.length > 0) {
    uncertainties.push(
      `What is known about ${publicOnlyPeople.map((p) => p.displayName).join(', ')} comes from public sources, not from working with them. It describes who they are, not how they behave with you.`,
    )
  }
  if (trulyUnknown.length > 0) {
    uncertainties.push(
      `No interaction history with ${trulyUnknown.map((p) => p.displayName).join(', ')}. Nothing here is a read on them.`,
    )
  }

  // Stale public facts must not be read as current.
  const stale = people.flatMap((p) =>
    p.professionalFacts.filter((f) => f.asOf && monthsSince(f.asOf) >= 18),
  )
  if (stale.length > 0) {
    uncertainties.push(
      `Some public details above are over a year old and may no longer hold. Confirm the current role rather than assuming it.`,
    )
  }
  const undated = people.flatMap((p) => p.professionalFacts.filter((f) => !f.asOf))
  if (undated.length > 0 && stale.length === 0) {
    uncertainties.push(
      `The public sources did not state when they were written, so the details above cannot be confirmed as current.`,
    )
  }
  const conflicted = people.flatMap((p) => p.professionalFacts.filter((f) => f.hasConflict))
  if (conflicted.length > 0) {
    uncertainties.push(
      `Sources disagree on ${conflicted.length === 1 ? 'one public detail' : `${conflicted.length} public details`}. ${brand.name} has not picked a winner.`,
    )
  }
  if (!meeting.objective) {
    uncertainties.push('No objective recorded, so this brief cannot tell you what to optimize for.')
  }
  const inferredCount = people.reduce((n, p) => n + p.observations.inferred.length, 0)
  if (inferredCount > 0) {
    uncertainties.push(
      `${inferredCount} of the points above are inferred from limited evidence rather than confirmed. Treat them as questions to test, not facts.`,
    )
  }
  if (people.every((p) => p.interactionCount < 2)) {
    uncertainties.push(
      `This relationship record is still thin. ${brand.name} gets materially more useful after a few logged interactions.`,
    )
  }
  if (!user.interactionProfile) {
    uncertainties.push(
      'You have not completed an Interaction Profile, so this brief does not account for your own defaults.',
    )
  }

  return {
    sixtySecond: sixty.join(' '),
    objective,
    recommendedApproach: approach.slice(0, 6),
    participants: people.map(composeParticipant),
    roomDynamics,
    howToOpen,
    emphasize: emphasize.slice(0, 5),
    avoid: avoid.slice(0, 5),
    questionsYouMayGet: buildAnticipatedQuestions(people).slice(0, 5),
    likelyObjections,
    questionsToAsk: questionsToAsk.slice(0, 5),
    outcomeToLeaveWith,
    checklist: checklist.slice(0, 6),
    uncertainties: uncertainties.slice(0, 5),
  }
}

function buildSequencing(
  people: PersonContext[],
  decisionOwner: PersonContext | undefined,
): string[] {
  const steps: string[] = ['Open with the decision you need, in one sentence.']
  const byRole = (role: string) => people.filter((p) => p.meetingRole === role)

  for (const p of byRole('influencer').slice(0, 2)) {
    const signal = communicationSignals(p)[0]
    steps.push(
      `Address ${firstName(p)}${signal ? `: ${stripTrailingStop(lowerFirst(signal.content))}` : ' and their area of the decision'}`,
    )
  }
  for (const p of byRole('contributor').slice(0, 2)) {
    const concern = frictionSignals(p)[0]
    if (concern) steps.push(`Handle ${firstName(p)}'s previous concern: ${concern.content}`)
  }
  if (decisionOwner) steps.push(`Return to ${firstName(decisionOwner)} for the decision.`)
  steps.push('Confirm the owner and the date before closing.')
  return steps.slice(0, 6)
}

function buildAnticipatedQuestions(people: PersonContext[]) {
  const out: { question: string; response: string }[] = []
  for (const p of people) {
    for (const o of communicationSignals(p).slice(0, 1)) {
      if (/data|number|evidence|proof|detail/i.test(o.content)) {
        out.push({
          question: `"What is this based on?" — likely from ${firstName(p)}`,
          response:
            'Have the source ready in one line, with the fuller working available if asked.',
        })
      }
    }
    for (const c of p.openCommitments.slice(0, 1)) {
      out.push({
        question: `"Where did we land on ${stripTrailingStop(lowerFirst(c.description))}?" — likely from ${firstName(p)}`,
        response:
          'Give the current status and a date, even if the answer is that it has not moved.',
      })
    }
  }
  return out
}

function lowerFirst(s: string) {
  const t = s.trim()
  if (!t) return t
  const out = t[0]!.toLowerCase() + t.slice(1)
  return out.endsWith('.') ? out : `${out}.`
}

/** Drop a trailing full stop so a clause can be continued mid-sentence. */
function stripTrailingStop(s: string) {
  return s.replace(/\.\s*$/, '')
}

function stripLeadingVerb(s: string) {
  return s.trim().replace(/^(I want to|I need to|We need to|To)\s+/i, '')
}

/**
 * Common ways people open an objective with a bare imperative.
 *
 * Not an attempt at part-of-speech tagging — just the verbs that actually turn
 * up at the start of a meeting objective. A miss costs a slightly stiffer
 * sentence, never a broken one, because both branches are grammatical on their
 * own; the list only decides which frame reads better.
 */
const IMPERATIVE_OPENERS =
  /^(leave|get|secure|agree|decide|close|align|persuade|convince|understand|learn|present|propose|ask|confirm|resolve|unblock|negotiate|raise|discuss|review|land|settle|sign|approve|defer|win|find|make|set|start|stop|keep|build|fix|open|push|pull|move|book|hire|choose|pick|clarify|establish|reach|walk|come)\b/i

/**
 * True when the objective reads as a command rather than a thing.
 *
 * "Leave with a decision" cannot be spliced into "A clear answer on ___" —
 * that produces "A clear answer on leave with a decision". A gerund
 * ("Getting sign-off") or a plain noun phrase ("Agreement on scope") can.
 */
export function readsAsImperative(objective: string): boolean {
  const trimmed = stripLeadingVerb(objective).trim()
  if (!trimmed) return false
  // A gerund is already a noun phrase; "Meeting" and similar are nouns too.
  if (/^\w+ing\b/i.test(trimmed)) return false
  return IMPERATIVE_OPENERS.test(trimmed)
}

/** The objective as its own sentence: capitalised, single trailing stop. */
function asSentence(s: string): string {
  const t = stripTrailingStop(s.trim())
  if (!t) return t
  return t[0]!.toUpperCase() + t.slice(1)
}

// --- citations ----------------------------------------------------------------

function citeMeeting(input: MeetingBriefInput): Citation[] {
  const citations: Citation[] = []
  for (const p of input.meeting.participants) {
    // What the user wrote on the person, cited first.
    //
    // renderPerson has always put these notes in the prompt, and generated
    // briefs quote them almost verbatim — but nothing cited them, so a person
    // with detailed notes and no logged interactions produced a brief whose
    // evidence panel said "there was no recorded evidence to build on". The
    // panel was contradicting the paragraph directly above it, and the claim
    // was the false one. Evidence used is evidence shown.
    //
    // 'confirmed' because the user wrote it themselves about someone they know;
    // nothing in the product is more directly attested than that.
    if (p.notes?.trim()) {
      citations.push({
        label: `Your notes on ${p.displayName}: ${p.notes.trim()}`,
        evidenceLevel: 'confirmed',
        personId: p.id,
      })
    }

    for (const group of [
      p.observations.confirmed,
      p.observations.observed,
      p.observations.inferred,
    ]) {
      for (const o of group) {
        citations.push({
          label: o.content,
          evidenceLevel: o.evidenceLevel,
          observationId: o.id,
          personId: p.id,
        })
      }
    }
    for (const i of p.recentInteractions) {
      citations.push({
        label: `Interaction: "${i.title}" on ${i.occurredAt.slice(0, 10)}`,
        evidenceLevel: 'observed',
        interactionId: i.id,
        personId: p.id,
      })
    }
    for (const c of p.openCommitments) {
      citations.push({
        label: `Open commitment: ${c.description}${c.isOverdue ? ' (overdue)' : ''}`,
        evidenceLevel: 'confirmed',
        commitmentId: c.id,
        personId: p.id,
      })
    }
    // Public sources are cited last, after everything earned through contact.
    // Order here is what the evidence panel renders, and relationship evidence
    // outranking public material is the whole argument of the product.
    for (const source of p.publicSources) {
      citations.push({
        label: `Public source: ${source.title ?? source.url ?? 'untitled'}${
          source.publisher ? ` — ${source.publisher}` : ''
        }`,
        evidenceLevel: 'observed',
        sourceId: source.id,
        sourceUrl: source.url ?? undefined,
        personId: p.id,
      })
    }
  }
  return citations
}

// --- module -------------------------------------------------------------------

export const meetingBriefPrompt: PromptModule<MeetingBriefInput, MeetingBrief> = {
  id: 'meeting-brief',
  kind: 'meeting_brief',
  // 1.1.0: publicContext and publicOnly are taken from the record after
  // generation rather than accepted from the model.
  version: 'meeting-brief@1.1.0',
  schema: meetingBriefSchema,

  /**
   * Take provenance back off the model.
   *
   * publicContext is rendered to the user under the heading "From public
   * sources", and publicOnly prints "this is who they are professionally, not
   * how they work with you". Both are claims about where evidence came from,
   * and the model is in no position to make them: it is handed the user's own
   * interaction history as context, so it summarises that history into the
   * public field and sets publicOnly on someone the user has already met.
   *
   * Observed on production. A brief for a person with one logged interaction
   * and zero accepted public sources displayed that private interaction under
   * "From public sources", cited to the user's own meeting note, above a line
   * telling them the guidance was preliminary until they had met.
   *
   * Separating public evidence from what the user has seen themselves is the
   * thing this product is for, so neither field is a judgment call. Both are
   * recomputed from professional_facts and the interaction count, exactly as
   * the deterministic composer does it.
   */
  reconcile: (output, input) => ({
    ...output,
    participants: output.participants.map((participant) => {
      const person = input.meeting.participants.find(
        (p) => p.id === participant.personId || p.displayName === participant.name,
      )
      if (!person) {
        // Unmatched participant: strip rather than trust. An unattributable
        // public claim is the one we least want to display.
        return { ...participant, publicContext: [], publicOnly: false }
      }

      const publicContext = composePublicContext(person)
      return {
        ...participant,
        publicContext,
        publicOnly: person.interactionCount === 0 && publicContext.length > 0,
      }
    }),
  }),

  system: (input) =>
    [
      BRAND_VOICE,
      styleBlock(input.user.coachingStyle),
      dateBlock(input.user.timeZone),
      `TASK: produce a preparation brief for one specific upcoming ${MEETING_KIND_LABEL[input.meeting.kind]}.`,
      `Every participant section must be traceable to the record you are given. Where the record is empty, say it is empty.`,
      `The "uncertainties" field is required and must be honest. List what you do not know. Do not leave it empty just because the rest of the brief reads well.`,
      `Set roomDynamics to null if there are fewer than two participants.`,
    ].join('\n\n'),

  user: (input) => {
    const { meeting, user } = input
    const parts = [
      renderUser(user),
      '',
      `## THE MEETING`,
      `Title: ${meeting.title}`,
      `Type: ${MEETING_KIND_LABEL[meeting.kind]}`,
      meeting.scheduledAt ? `Scheduled: ${meeting.scheduledAt}` : 'Not yet scheduled.',
      meeting.durationMinutes ? `Duration: ${meeting.durationMinutes} minutes` : '',
      `Importance to the user: ${meeting.importance}/5`,
      meeting.objective ? `\nUSER'S OBJECTIVE: ${meeting.objective}` : '\nNo objective recorded.',
      meeting.stakes ? `WHAT IS AT STAKE: ${meeting.stakes}` : '',
      meeting.extraContext ? `ADDITIONAL CONTEXT: ${meeting.extraContext}` : '',
      '',
      `## THE ROOM (${meeting.participants.length} participant${meeting.participants.length === 1 ? '' : 's'})`,
      meeting.participants.length === 0
        ? 'No participants have been added. Say so and keep the brief minimal.'
        : meeting.participants.map(renderPerson).join('\n\n'),
    ]
    return parts.filter(Boolean).join('\n')
  },

  compose: composeMeetingBrief,
  cite: citeMeeting,
}
