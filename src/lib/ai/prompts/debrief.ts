import { z } from 'zod'
import type { Citation, PersonContext, PromptModule, UserContext } from '../types'
import { BRAND_VOICE, dateBlock, renderPerson, renderUser, styleBlock } from './shared'

/**
 * DEBRIEF + MEMORY PROPOSAL
 * =============================================================================
 * After an interaction the user dumps notes or a transcript. Atturel extracts the
 * structured residue — decisions, commitments, objections, open questions — and
 * PROPOSES things worth remembering about each person.
 *
 * Proposals are written to `observations` with status='proposed'. Nothing here
 * becomes part of the relationship record until the user saves it. That approval
 * step is the difference between a memory system and a rumour mill.
 * =============================================================================
 */

export const memoryProposalSchema = z.object({
  personId: z.string(),
  /** A single, specific, behavioural statement. Not a character judgement. */
  content: z.string().min(8).max(400),
  category: z.enum([
    'communication',
    'decision',
    'trust',
    'friction',
    'priority',
    'preference',
    'context',
    'other',
  ]),
  /** Proposals may only ever be 'observed' or 'inferred' — never 'confirmed'. */
  evidenceLevel: z.enum(['observed', 'inferred']),
  /** The words in the source that support this. Must be a genuine quote or close paraphrase. */
  excerpt: z.string().max(500).nullable(),
  /** Why this is worth keeping, in one line. Shown next to the Save button. */
  rationale: z.string().max(240),
})

export type MemoryProposal = z.infer<typeof memoryProposalSchema>

export const debriefSchema = z.object({
  /** Neutral summary of what happened. */
  summary: z.string(),
  outcome: z.string(),
  decisions: z.array(z.string()).max(6),
  commitments: z
    .array(
      z.object({
        description: z.string(),
        owner: z.enum(['user', 'person', 'shared']),
        ownerPersonId: z.string().nullable(),
        dueOn: z.string().nullable(),
      }),
    )
    .max(8),
  objections: z.array(z.string()).max(5),
  openQuestions: z.array(z.string()).max(5),
  followUps: z.array(z.string()).max(5),
  topics: z.array(z.string()).max(6),
  /** Proposals for the verified memory loop. */
  proposedMemories: z.array(memoryProposalSchema).max(8),
  /** Practical guidance for the next interaction with these people. */
  nextTime: z.array(z.string()).max(4),
})

export type Debrief = z.infer<typeof debriefSchema>

export interface DebriefInput {
  user: UserContext
  participants: PersonContext[]
  interaction: {
    id: string
    title: string
    occurredAt: string
    /** Free notes or a pasted transcript. */
    source: string
    wentWell: number | null
  }
  /** The brief generated beforehand, when there was one. */
  priorObjective: string | null
}

// --- deterministic composition ------------------------------------------------

/**
 * Sentence-level extraction. This is intentionally conservative: it only surfaces
 * lines the user actually wrote, tagged by cue phrases. It never paraphrases and
 * never asserts anything the source does not literally contain — an honest,
 * lower-recall floor is the right failure mode for a memory product.
 */
function splitSentences(source: string): string[] {
  return source
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
}

const CUES = {
  decision: /\b(decided|agreed|approved|signed off|we will go with|chose|settled on|green ?lit)\b/i,
  // No bare "deadline": "citing the compliance deadline" is a reason someone
  // gave, not a promise anyone made. Due-date phrasing is covered by the
  // "by <day>" branch, which needs the preposition to match.
  commitment:
    /\b(will|going to|i'll|we'll|owes?|owe|to send|to share|follow up|by (monday|tuesday|wednesday|thursday|friday|next week|end of|eod|eow))\b/i,
  objection: /\b(concerned|concern|pushed back|objected|worried|disagreed|hesitant|reservation|not convinced|challenged)\b/i,
  question: /\?$|\b(asked|wanted to know|unclear|open question|unresolved|tbd|to be determined)\b/i,
  preference:
    /\b(prefers?|wants?|asked for|likes?|expects?|needs? to see|wants? the|first|before)\b/i,
} as const

function firstName(p: PersonContext) {
  return p.preferredName ?? p.displayName.split(' ')[0] ?? p.displayName
}

/** Which participant, if any, a sentence is about. */
function attribute(sentence: string, participants: PersonContext[]): PersonContext | null {
  for (const p of participants) {
    const names = [p.displayName, p.preferredName, p.displayName.split(' ')[0]].filter(
      Boolean,
    ) as string[]
    if (names.some((n) => new RegExp(`\\b${escapeRegExp(n)}\\b`, 'i').test(sentence))) return p
  }
  return null
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function composeDebrief(input: DebriefInput): Debrief {
  const sentences = splitSentences(input.interaction.source)
  const { participants } = input

  const decisions = sentences.filter((s) => CUES.decision.test(s)).slice(0, 6)
  const objections = sentences.filter((s) => CUES.objection.test(s)).slice(0, 5)
  const openQuestions = sentences.filter((s) => CUES.question.test(s)).slice(0, 5)

  const commitments = sentences
    // An objection is not a commitment. "He pushed back, citing the deadline"
    // matched both and was filed as a promise nobody made.
    .filter((s) => CUES.commitment.test(s) && !CUES.decision.test(s) && !CUES.objection.test(s))
    .slice(0, 8)
    .map((s) => {
      const who = attribute(s, participants)
      const userOwns = /\b(i'?ll|i will|i owe|i need to|i have to|i said i would|i promised|i am going to|i'm going to|my )\b/i.test(s)
      return {
        description: s.replace(/\s+/g, ' ').trim(),
        owner: userOwns ? ('user' as const) : who ? ('person' as const) : ('shared' as const),
        ownerPersonId: userOwns ? null : (who?.id ?? null),
        dueOn: extractDate(s, input.interaction.occurredAt),
      }
    })

  // Memory proposals: only from sentences that both name a participant and carry
  // a preference or friction cue. Everything proposed is 'observed' at most.
  const proposedMemories: MemoryProposal[] = []
  for (const s of sentences) {
    const who = attribute(s, participants)
    if (!who) continue
    if (proposedMemories.filter((m) => m.personId === who.id).length >= 3) continue

    const isFriction = CUES.objection.test(s)
    const isPreference = CUES.preference.test(s)
    if (!isFriction && !isPreference) continue

    proposedMemories.push({
      personId: who.id,
      content: s.replace(/\s+/g, ' ').trim().slice(0, 400),
      category: isFriction ? 'friction' : 'preference',
      evidenceLevel: 'observed',
      excerpt: s.slice(0, 500),
      rationale: `${firstName(who)} was named in this line of your notes from "${input.interaction.title}".`,
    })
    if (proposedMemories.length >= 8) break
  }

  const nextTime: string[] = []
  for (const m of proposedMemories.filter((m) => m.category === 'friction').slice(0, 2)) {
    const who = participants.find((p) => p.id === m.personId)
    if (who) nextTime.push(`Address ${firstName(who)}'s concern early next time: ${m.content}`)
  }
  if (commitments.some((c) => c.owner === 'user')) {
    nextTime.push('Close your own commitments from this meeting before the next one.')
  }
  if (nextTime.length === 0 && participants.length > 0) {
    nextTime.push(
      `Note what worked in how you communicated with ${participants.map(firstName).join(' and ')} while it is fresh.`,
    )
  }

  const summary =
    sentences.slice(0, 2).join(' ').slice(0, 600) ||
    `Notes recorded for "${input.interaction.title}".`

  return {
    summary,
    outcome:
      decisions[0] ??
      (input.priorObjective
        ? `No explicit outcome recorded against the objective: ${input.priorObjective}`
        : 'No explicit outcome recorded.'),
    decisions,
    commitments,
    objections,
    openQuestions,
    followUps: commitments.filter((c) => c.owner === 'user').map((c) => c.description).slice(0, 5),
    topics: extractTopics(sentences).slice(0, 6),
    proposedMemories,
    nextTime: nextTime.slice(0, 4),
  }
}

/** Very conservative ISO-date extraction; returns null unless unambiguous. */
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * Resolve a due date out of a sentence, relative to when the meeting happened.
 *
 * Only ISO dates were recognised before, so "I owe him the revised timeline by
 * Friday" produced no date at all - the commitment could never come due and
 * never surfaced as overdue, which is most of what a commitment is for. Real
 * meeting notes almost never contain an ISO date.
 *
 * Computed in UTC against the interaction date so the same notes always resolve
 * the same way, and only unambiguous phrasing is accepted. A wrong due date is
 * worse than none: it invents a broken promise.
 */
function extractDate(sentence: string, referenceIso: string): string | null {
  const iso = sentence.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (iso) return iso[1]!

  const reference = new Date(referenceIso)
  if (Number.isNaN(reference.getTime())) return null

  const day = (offset: number) => {
    const d = new Date(reference)
    d.setUTCDate(d.getUTCDate() + offset)
    return d.toISOString().slice(0, 10)
  }

  const s = sentence.toLowerCase()

  if (/\btomorrow\b/.test(s)) return day(1)
  if (/\b(today|eod|end of day)\b/.test(s)) return day(0)

  const weekday = s.match(
    /\bby (?:next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  )
  if (weekday?.[1]) {
    const target = WEEKDAYS.indexOf(weekday[1])
    const current = reference.getUTCDay()
    let delta = (target - current + 7) % 7
    if (delta === 0) delta = 7
    if (/\bby next\b/.test(s)) delta += 7
    return day(delta)
  }

  if (/\bnext week\b/.test(s)) return day(7)
  if (/\b(end of (the )?week|eow)\b/.test(s)) {
    const current = reference.getUTCDay()
    const delta = (5 - current + 7) % 7
    return day(delta)
  }
  if (/\b(end of (the )?month|eom)\b/.test(s)) {
    return new Date(
      Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 0),
    )
      .toISOString()
      .slice(0, 10)
  }

  return null
}

function extractTopics(sentences: string[]): string[] {
  const counts = new Map<string, number>()
  for (const s of sentences) {
    // Capitalised multi-word phrases are a reasonable proxy for project nouns.
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

function citeDebrief(input: DebriefInput): Citation[] {
  return [
    {
      label: `Your notes from "${input.interaction.title}" on ${input.interaction.occurredAt.slice(0, 10)}`,
      evidenceLevel: 'confirmed',
      interactionId: input.interaction.id,
    },
    ...input.participants.map((p) => ({
      label: `Participant: ${p.displayName}`,
      evidenceLevel: 'confirmed' as const,
      personId: p.id,
    })),
  ]
}

export const debriefPrompt: PromptModule<DebriefInput, Debrief> = {
  id: 'debrief',
  kind: 'debrief',
  version: 'debrief@1.0.0',
  schema: debriefSchema,

  system: (input) =>
    [
      BRAND_VOICE,
      styleBlock(input.user.coachingStyle),
      dateBlock(),
      `TASK: extract structure from the user's notes about an interaction that has already happened, and propose what is worth remembering.`,
      `EXTRACTION RULES
- Only extract what the notes actually say. Do not infer a decision that was not recorded.
- A commitment needs an owner. If the notes do not make the owner clear, use "shared".
- Only set dueOn when the notes contain an unambiguous date. Otherwise null.

MEMORY PROPOSAL RULES - THESE MATTER MOST
- Propose only durable, reusable facts about how a person works. Not what happened once, but what it suggests about working with them.
- Good: "Asked for utilisation evidence before discussing the forecast."
- Bad: "Was in a bad mood." / "Is difficult." / "Doesn't like me."
- evidenceLevel is 'observed' when the notes directly show the behaviour, 'inferred' when you are reading between the lines. Never 'confirmed' — only the user can confirm.
- Every proposal needs an excerpt from the source. If you cannot quote it, do not propose it.
- Propose at most 3 memories per person. Fewer, better ones. An empty list is a valid answer.
- personId must be one of the ids given. Never invent one.`,
    ].join('\n\n'),

  user: (input) =>
    [
      renderUser(input.user),
      '',
      `## THE INTERACTION`,
      `Title: ${input.interaction.title}`,
      `When: ${input.interaction.occurredAt}`,
      input.priorObjective ? `Objective going in: ${input.priorObjective}` : '',
      input.interaction.wentWell ? `User rated it ${input.interaction.wentWell}/5.` : '',
      '',
      `## PEOPLE PRESENT (use these exact ids)`,
      input.participants.length === 0
        ? 'None recorded — propose no memories.'
        : input.participants
            .map((p) => `id="${p.id}" ${p.displayName}\n${renderPerson(p)}`)
            .join('\n\n'),
      '',
      `## THE USER'S NOTES`,
      input.interaction.source,
    ]
      .filter(Boolean)
      .join('\n'),

  compose: composeDebrief,
  cite: citeDebrief,
}
