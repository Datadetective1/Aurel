import { z } from 'zod'
import type { Citation, PersonContext, PromptModule, UserContext } from '../types'
import { BRAND_VOICE, dateBlock, renderPerson, renderUser, styleBlock } from './shared'
import { attribute, extractDate, memoryProposalSchema, splitSentences } from './debrief'
import { fenceUntrusted, UNTRUSTED_CONTENT_RULES } from '../untrusted'
import { LOOP_PRESELECT_THRESHOLD, LOOP_PROPOSAL_FLOOR } from '@/lib/conversations/loops'

/**
 * CONVERSATION UNDERSTANDING
 * =============================================================================
 * A conversation has happened -- spoken into the phone, pasted from a meeting
 * tool, imported from a file, or typed from memory -- and Atturel reads it for
 * the things a person would otherwise have to remember:
 *
 *   - what it was about, in a paragraph
 *   - the loops it left open: what the user promised, what others promised,
 *     what nobody answered
 *   - what was decided, and why when the words say why
 *   - what is worth remembering about each person (the existing memory gate)
 *
 * THE RULE THAT MATTERS MOST: a commitment is a promise somebody made, not a
 * topic somebody raised. "I'll send you the spreadsheet on Friday" is one.
 * "Maybe we should look at that sometime" is not. Every extracted loop carries
 * a confidence and an excerpt, and NOTHING here reaches Today or a brief until
 * the user confirms it. The extraction is allowed to be unsure; it is not
 * allowed to be silently wrong.
 *
 * Supersedes the debrief prompt for new work. That module is kept because its
 * memory-proposal schema and date logic are reused here, and because artifacts
 * written under its version still render.
 * =============================================================================
 */

export const extractedLoopSchema = z.object({
  /** What is owed, as a short imperative sentence. */
  description: z.string().min(3).max(500),
  kind: z.enum(['commitment', 'question', 'follow_up']),
  owner: z.enum(['user', 'person', 'shared']),
  /** One of the participant ids, or null. Never a name. */
  ownerPersonId: z.string().nullable(),
  /** YYYY-MM-DD, or null when the words gave nothing to resolve. */
  dueOn: z.string().nullable(),
  /** 0 to 1. How sure the words describe a real obligation, not a musing. */
  confidence: z.number().min(0).max(1),
  /** Firm statement of intent, or hedged. Hedged never confirms on its own. */
  strength: z.enum(['explicit', 'tentative']),
  /** The words that support it. A loop with no excerpt is not written. */
  excerpt: z.string().max(600).nullable(),
})

export type ExtractedLoop = z.infer<typeof extractedLoopSchema>

export const extractedDecisionSchema = z.object({
  /** What was decided, as a statement of the outcome. */
  description: z.string().min(3).max(500),
  /** Why, only when the words say why. Null otherwise. */
  context: z.string().max(1000).nullable(),
  /** Participant ids the decision concerns. Empty is fine. */
  personIds: z.array(z.string()).max(8),
  confidence: z.number().min(0).max(1),
  excerpt: z.string().max(600).nullable(),
})

export type ExtractedDecision = z.infer<typeof extractedDecisionSchema>

export const conversationSchema = z.object({
  /** What happened, in a neutral paragraph. */
  summary: z.string(),
  /** The upshot, in one sentence. */
  outcome: z.string(),
  topics: z.array(z.string()).max(6),
  loops: z.array(extractedLoopSchema).max(12),
  decisions: z.array(extractedDecisionSchema).max(8),
  objections: z.array(z.string()).max(5),
  proposedMemories: z.array(memoryProposalSchema).max(8),
  /** Practical guidance for the next conversation with these people. */
  nextTime: z.array(z.string()).max(4),
})

export type ConversationAnalysis = z.infer<typeof conversationSchema>

export interface ConversationInput {
  user: UserContext
  participants: PersonContext[]
  conversation: {
    id: string
    title: string
    occurredAt: string
    /** Notes, a transcript, or a transcribed recording. */
    source: string
    /** How the words arrived. Shapes how speaker labels are read. */
    sourceKind:
      | 'typed_notes'
      | 'voice_note'
      | 'uploaded_audio'
      | 'pasted_transcript'
      | 'uploaded_transcript'
      | 'meeting_recording'
      | 'imported'
    wentWell: number | null
  }
  /** The objective the user prepared with, when there was one. */
  priorObjective: string | null
}

// =============================================================================
// DETERMINISTIC COMPOSITION
// =============================================================================

/**
 * Cue phrases. Conservative on purpose: the composer only surfaces lines the
 * source literally contains, so a missed commitment costs the user a manual
 * entry while an invented one costs them a false promise on Today.
 */
const CUES = {
  decision:
    /\b(decided|agreed|approved|signed off|we will go with|we'll go with|going with|chose|settled on|green ?lit|it's settled|final answer)\b/i,
  commitment:
    /\b(will|going to|i'll|we'll|he'll|she'll|they'll|owes?|owe|to send|to share|follow up|circulate|get back to|by (monday|tuesday|wednesday|thursday|friday|next week|end of|eod|eow|tomorrow))\b/i,
  // Language that hedges. A sentence carrying one of these is discussion, not
  // an obligation, whatever else it contains.
  tentative:
    /\b(maybe|perhaps|might|could|sometime|some time|at some point|someday|one day|we should look|worth looking|worth exploring|possibly|if we get a chance|think about|consider|not sure|let's see|no promises|ideally)\b/i,
  // Already done, or called off. Not open.
  closed:
    /\b(already sent|already shared|already done|have sent|has sent|sent it over|sent that|done that|finished that|no longer need|don't need to|scrap that|scrapped|cancel(?:led)? that|forget about|never mind|drop that|dropped)\b/i,
  objection:
    /\b(concerned|concern|pushed back|objected|worried|disagreed|hesitant|reservation|not convinced|challenged)\b/i,
  question:
    /\?\s*$|\b(asked whether|asked if|wanted to know|unclear whether|open question|unresolved|still need to decide|tbd|to be determined|nobody knew|no answer yet|didn't get an answer|left open)\b/i,
  preference:
    /\b(prefers?|wants?|asked for|likes?|expects?|needs? to see|wants? the|first|before)\b/i,
  userOwns:
    /\b(i'?ll|i will|i owe|i need to|i have to|i said i would|i promised|i am going to|i'm going to|i can send|i can share|let me send|let me share|my )\b/i,
} as const

function firstName(p: PersonContext) {
  return p.preferredName ?? p.displayName.split(' ')[0] ?? p.displayName
}

function clean(s: string) {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Strip a speaker label from a transcript line. "Ravi: I'll send it" becomes
 * "I'll send it" with Ravi known as the speaker, so ownership can be read from
 * the label rather than guessed from the pronoun.
 */
function speakerOf(
  sentence: string,
  participants: PersonContext[],
  userName: string,
): { text: string; speaker: 'user' | PersonContext | null } {
  const match = sentence.match(
    /^\s*(?:\[[^\]]*\]\s*)?([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2})\s*[:–-]\s+(.+)$/,
  )
  if (!match?.[1] || !match[2]) return { text: sentence, speaker: null }
  const label = match[1].toLowerCase()
  const text = match[2]

  if (
    label === userName.toLowerCase() ||
    label === userName.split(' ')[0]?.toLowerCase() ||
    label === 'me' ||
    label === 'you'
  ) {
    return { text, speaker: 'user' }
  }
  for (const p of participants) {
    const names = [p.displayName, p.preferredName, p.displayName.split(' ')[0]]
      .filter(Boolean)
      .map((n) => (n as string).toLowerCase())
    if (names.includes(label)) return { text, speaker: p }
  }
  return { text, speaker: null }
}

function composeConversation(input: ConversationInput): ConversationAnalysis {
  const { participants, user } = input

  // Line first, then sentence. A transcript line is one speaker's turn, and
  // the label sits at its start; splitting into sentences before reading the
  // label would leave "Good. I'll send it Thursday." with the promise in a
  // sentence that no longer says who made it.
  const sentences: { raw: string; text: string; speaker: 'user' | PersonContext | null }[] = []
  for (const line of input.conversation.source.replace(/\r\n?/g, '\n').split(/\n+/)) {
    if (line.trim().length === 0) continue
    const turn = speakerOf(line, participants, user.displayName)
    for (const sentence of splitSentences(turn.text)) {
      sentences.push({ raw: sentence, text: sentence, speaker: turn.speaker })
    }
  }

  const decisions: ExtractedDecision[] = []
  const loops: ExtractedLoop[] = []
  const objections: string[] = []

  for (const s of sentences) {
    const text = s.text
    if (CUES.closed.test(text)) continue

    if (CUES.objection.test(text)) {
      if (objections.length < 5) objections.push(clean(text))
    }

    const endsAsQuestion = /\?\s*$/.test(text)

    // "And we agreed the launch moves to March?" is somebody checking, not
    // the record of a decision. The answer on the next line is the decision.
    if (CUES.decision.test(text) && !CUES.tentative.test(text) && !endsAsQuestion) {
      if (decisions.length < 8) {
        const who = s.speaker && s.speaker !== 'user' ? s.speaker : attribute(text, participants)
        decisions.push({
          description: clean(text),
          context: null,
          personIds: who ? [who.id] : [],
          confidence: 0.7,
          excerpt: clean(s.raw).slice(0, 600),
        })
      }
      continue
    }

    const isQuestion = CUES.question.test(text)
    const isCommitment = CUES.commitment.test(text) && !CUES.objection.test(text)
    const tentative = CUES.tentative.test(text)

    if (isQuestion && !isCommitment) {
      if (loops.length < 12) {
        loops.push({
          description: clean(text).replace(/\?+$/, '?'),
          kind: 'question',
          owner: 'shared',
          ownerPersonId: null,
          dueOn: null,
          // The composer cannot tell an answered question from an unanswered
          // one; it can only see that one was asked. Low enough to start
          // unticked, so the user decides. A question the user asked
          // themselves is usually them checking something, and lower still.
          confidence: s.speaker === 'user' ? 0.45 : 0.6,
          strength: 'explicit',
          excerpt: clean(s.raw).slice(0, 600),
        })
      }
      continue
    }

    if (!isCommitment) continue
    // Hedged language is discussion. The composer does not propose it at all:
    // it cannot weigh the hedge against the rest of the sentence the way a
    // model can, so the honest floor is to leave it out.
    if (tentative) continue

    // Who owes it. A speaker label settles first-person language: "I'll send
    // it" on a line labelled Ravi is Ravi's promise, whatever the pronoun.
    // Without a label, first person is the user writing about themselves.
    const firstPerson = CUES.userOwns.test(text)
    const secondPerson = /\b(you'll|you will|can you|could you|you owe|you need to)\b/i.test(text)
    const namedInText = attribute(text, participants)

    let owner: ExtractedLoop['owner']
    let named: PersonContext | null

    if (s.speaker === 'user') {
      named = namedInText
      owner = firstPerson || !namedInText ? 'user' : 'person'
    } else if (s.speaker) {
      named = s.speaker
      owner = firstPerson ? 'person' : secondPerson ? 'user' : namedInText ? 'person' : 'shared'
      if (owner === 'person' && !firstPerson && namedInText) named = namedInText
    } else {
      named = namedInText
      owner = firstPerson ? 'user' : namedInText ? 'person' : 'shared'
    }

    if (loops.length < 12) {
      loops.push({
        description: clean(text),
        kind: /\b(follow up|circulate|get back to|check in)\b/i.test(text)
          ? 'follow_up'
          : 'commitment',
        owner,
        ownerPersonId: owner === 'person' ? (named?.id ?? null) : null,
        dueOn: extractDate(text, input.conversation.occurredAt, user.timeZone),
        confidence: 0.7,
        strength: 'explicit',
        excerpt: clean(s.raw).slice(0, 600),
      })
    }
  }

  // Memory proposals: sentences that name a participant and carry a
  // preference or friction cue. At most 'observed'; never 'confirmed'.
  const proposedMemories: ConversationAnalysis['proposedMemories'] = []
  for (const s of sentences) {
    const who = s.speaker && s.speaker !== 'user' ? s.speaker : attribute(s.text, participants)
    if (!who) continue
    if (proposedMemories.filter((m) => m.personId === who.id).length >= 3) continue

    const isFriction = CUES.objection.test(s.text)
    const isPreference = CUES.preference.test(s.text)
    if (!isFriction && !isPreference) continue

    proposedMemories.push({
      personId: who.id,
      content: clean(s.text).slice(0, 400),
      category: isFriction ? 'friction' : 'preference',
      evidenceLevel: 'observed',
      excerpt: clean(s.raw).slice(0, 500),
      rationale: `${firstName(who)} was named in this line of "${input.conversation.title}".`,
    })
    if (proposedMemories.length >= 8) break
  }

  const nextTime: string[] = []
  for (const m of proposedMemories.filter((m) => m.category === 'friction').slice(0, 2)) {
    const who = participants.find((p) => p.id === m.personId)
    if (who) nextTime.push(`Address ${firstName(who)}'s concern early next time: ${m.content}`)
  }
  const userLoops = loops.filter((l) => l.owner === 'user')
  if (userLoops.length > 0) {
    nextTime.push(
      userLoops.length === 1
        ? 'Close what you promised here before you speak again.'
        : `Close the ${userLoops.length} things you promised here before you speak again.`,
    )
  }
  const openQuestions = loops.filter((l) => l.kind === 'question')
  if (openQuestions.length > 0) {
    nextTime.push(`Bring an answer to: ${openQuestions[0]!.description}`)
  }
  if (nextTime.length === 0 && participants.length > 0) {
    nextTime.push(
      `Note what worked in how you communicated with ${participants.map(firstName).join(' and ')} while it is fresh.`,
    )
  }

  const summary =
    sentences
      .slice(0, 3)
      .map((s) => clean(s.text))
      .join(' ')
      .slice(0, 700) || `Notes recorded for "${input.conversation.title}".`

  return {
    summary,
    outcome:
      decisions[0]?.description ??
      (input.priorObjective
        ? `No explicit outcome recorded against the objective: ${input.priorObjective}`
        : 'No explicit outcome recorded.'),
    topics: extractTopics(sentences.map((s) => s.text)).slice(0, 6),
    loops,
    decisions,
    objections,
    proposedMemories,
    nextTime: nextTime.slice(0, 4),
  }
}

function extractTopics(sentences: string[]): string[] {
  const counts = new Map<string, number>()
  for (const s of sentences) {
    for (const m of s.matchAll(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2})\b/g)) {
      const phrase = m[1]!
      if (phrase.split(' ').length === 1 && phrase.length < 5) continue
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([phrase]) => phrase)
}

function citeConversation(input: ConversationInput): Citation[] {
  return [
    {
      label: `Your record of "${input.conversation.title}" on ${input.conversation.occurredAt.slice(0, 10)}`,
      evidenceLevel: 'confirmed',
      interactionId: input.conversation.id,
    },
    ...input.participants.map((p) => ({
      label: `Participant: ${p.displayName}`,
      evidenceLevel: 'confirmed' as const,
      personId: p.id,
    })),
  ]
}

const SOURCE_LABEL: Record<ConversationInput['conversation']['sourceKind'], string> = {
  typed_notes: "the user's own notes, written from memory",
  voice_note: 'a voice note the user recorded after the conversation, transcribed',
  uploaded_audio: 'a recording of the conversation, transcribed',
  meeting_recording: 'a recording of the meeting, transcribed',
  pasted_transcript: 'a transcript the user pasted, possibly from a meeting tool',
  uploaded_transcript: 'a transcript file the user uploaded',
  imported: 'an imported transcript',
}

// =============================================================================
// THE MODULE
// =============================================================================

export const conversationPrompt: PromptModule<ConversationInput, ConversationAnalysis> = {
  id: 'conversation',
  kind: 'debrief',
  version: 'conversation@2.0.0',
  schema: conversationSchema,

  system: (input) =>
    [
      BRAND_VOICE,
      UNTRUSTED_CONTENT_RULES,
      styleBlock(input.user.coachingStyle),
      dateBlock(input.user.timeZone),
      `TASK: read the record of a conversation that has already happened. Extract what was left open, what was decided, and what is worth remembering about each person. The user is "${input.user.displayName}". In a transcript, lines labelled with their name, "Me" or "You" are the user speaking.`,
      `OPEN LOOPS - THE RULE THAT MATTERS MOST
- A loop is a promise somebody made, a question nobody answered, or a follow-up somebody said they would do. It is NOT a topic that was discussed.
- "I'll send you the spreadsheet on Friday" is a commitment: owner "user", dueOn resolved, confidence high, strength "explicit".
- "Maybe we should look at that sometime" is NOT a commitment. If you include it at all, strength is "tentative" and confidence is below 0.4.
- "Can you get me the numbers?" answered with "Sure, by Thursday" is a commitment owned by whoever said "Sure".
- Something already done ("I already sent it") or called off ("forget about the deck") is not open. Do not extract it.
- kind: "commitment" for a promised deliverable or action, "question" for something asked that was not answered in the conversation, "follow_up" for a promise to circle back without a specific deliverable.
- owner: "user" when the user owes it, "person" when a participant owes it, "shared" when it is unclear or genuinely joint. For a question, the owner is whoever owes the answer, or "shared".
- ownerPersonId must be null unless owner is "person", and then it must be one of the ids listed under PEOPLE PRESENT. Never a name.
- dueOn is YYYY-MM-DD resolved against the date of the conversation, not today. "by Friday" is the next Friday after the conversation. Nothing to resolve means null.
- confidence: 0.9+ for a first-person promise with a deliverable; 0.7-0.9 for a clear promise without a date; 0.4-0.7 when the words are ambiguous about who or whether; below 0.4 for hedged talk.
- Every loop needs an excerpt: the actual words, or a close paraphrase of one sentence. No excerpt, no loop.
- Never invent a loop. An empty list is a valid answer.

DECISIONS
- A decision is an outcome the conversation settled: "we're going with vendor B", "the launch moves to March". Not a proposal, not a preference.
- context is why, only if the words give a reason. Otherwise null.
- personIds are participants the decision concerns, from the ids given. Empty is fine.
- Every decision needs an excerpt.

MEMORY PROPOSALS
- Propose only durable, reusable facts about how a person works. Not what happened once, but what it suggests about working with them.
- Good: "Asked for utilization evidence before discussing the forecast."
- Bad: "Was in a bad mood." / "Is difficult." / "Doesn't like me."
- evidenceLevel is 'observed' when the words directly show the behavior, 'inferred' when reading between the lines. Never 'confirmed'.
- At most 3 per person. Fewer, better ones. Every proposal needs an excerpt.
- personId must be one of the ids given. Never invent one.

SUMMARY
- summary: what happened, neutrally, in three to five sentences. outcome: the upshot in one.
- topics: up to six short noun phrases.
- objections: things participants pushed back on, as short sentences.
- nextTime: up to four practical pointers for the next conversation with these people, grounded in what was said.`,
    ].join('\n\n'),

  user: (input) =>
    [
      renderUser(input.user),
      '',
      `## THE CONVERSATION`,
      `Title: ${input.conversation.title}`,
      `When: ${input.conversation.occurredAt}`,
      `Source: ${SOURCE_LABEL[input.conversation.sourceKind]}`,
      input.priorObjective ? `Objective going in: ${input.priorObjective}` : '',
      input.conversation.wentWell ? `User rated it ${input.conversation.wentWell}/5.` : '',
      '',
      `## PEOPLE PRESENT (use these exact ids)`,
      input.participants.length === 0
        ? 'None recorded - propose no memories, and use owner "shared" for anything a participant owes.'
        : input.participants
            .map((p) => `id="${p.id}" ${p.displayName}\n${renderPerson(p)}`)
            .join('\n\n'),
      '',
      `## THE RECORD`,
      // A transcript may have been produced by a meeting tool or pasted from
      // somewhere the user does not control, so it is fenced like any other
      // external text. The user's own typed notes get the same treatment; the
      // cost is nothing and the rule stays simple.
      fenceUntrusted(input.conversation.source, 'conversation record', 60_000).fenced,
    ]
      .filter(Boolean)
      .join('\n'),

  compose: composeConversation,
  cite: citeConversation,

  // The model may not decide who was in the room. Ids it returns are checked
  // against the participants that actually were, and anything else is null.
  reconcile: (output, input) => {
    const valid = new Set(input.participants.map((p) => p.id))
    return {
      ...output,
      loops: output.loops.map((loop) => normaliseLoop(loop, valid)),
      decisions: output.decisions.map((d) => normaliseDecision(d, valid)),
      proposedMemories: output.proposedMemories.filter((m) => valid.has(m.personId)),
    }
  },
}

// =============================================================================
// NORMALISATION - pure, tested, and the last thing before a write
// =============================================================================

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function validDay(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return ISO_DAY.test(trimmed) && !Number.isNaN(Date.parse(trimmed)) ? trimmed : null
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100
}

/**
 * Normalise one extracted loop before it is written.
 *
 * The same failure normaliseCommitment guards against: a model asked for an id
 * will sometimes answer with a name, the column is a uuid, and an unchecked
 * insert fails silently. The owner id is checked against who was in the room.
 *
 * Tentative language also caps confidence: a hedge is evidence about the
 * strength of the promise, and a model that returns 0.9 next to "tentative"
 * has contradicted itself. The lower reading wins.
 */
export function normaliseLoop(
  loop: ExtractedLoop,
  validPersonIds: ReadonlySet<string>,
): ExtractedLoop {
  const ownerPersonId =
    loop.ownerPersonId && validPersonIds.has(loop.ownerPersonId) ? loop.ownerPersonId : null

  let confidence = clampConfidence(loop.confidence)
  if (loop.strength === 'tentative') confidence = Math.min(confidence, 0.39)

  return {
    description: loop.description.trim().slice(0, 500),
    kind: loop.kind,
    owner: loop.owner === 'person' && !ownerPersonId ? 'shared' : loop.owner,
    ownerPersonId: loop.owner === 'person' ? ownerPersonId : null,
    dueOn: validDay(loop.dueOn),
    confidence,
    strength: loop.strength,
    excerpt: loop.excerpt ? loop.excerpt.trim().slice(0, 600) || null : null,
  }
}

export function normaliseDecision(
  decision: ExtractedDecision,
  validPersonIds: ReadonlySet<string>,
): ExtractedDecision {
  return {
    description: decision.description.trim().slice(0, 500),
    context: decision.context ? decision.context.trim().slice(0, 1000) || null : null,
    personIds: [...new Set(decision.personIds.filter((id) => validPersonIds.has(id)))].slice(0, 8),
    confidence: clampConfidence(decision.confidence),
    excerpt: decision.excerpt ? decision.excerpt.trim().slice(0, 600) || null : null,
  }
}

export { LOOP_PRESELECT_THRESHOLD, LOOP_PROPOSAL_FLOOR }

/** Whether an extracted loop should be written as a proposal at all. */
export function loopWorthProposing(loop: ExtractedLoop): boolean {
  if (!loop.excerpt) return false
  if (loop.description.trim().length < 3) return false
  return loop.confidence >= LOOP_PROPOSAL_FLOOR
}

export function decisionWorthProposing(decision: ExtractedDecision): boolean {
  if (!decision.excerpt) return false
  return decision.confidence >= LOOP_PROPOSAL_FLOOR
}
