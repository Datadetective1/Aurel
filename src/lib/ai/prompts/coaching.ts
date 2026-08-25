import { z } from 'zod'
import type { Citation, CommitmentContext, PersonContext, PromptModule, UserContext } from '../types'
import { BRAND_VOICE, dateBlock, renderPerson, renderUser, styleBlock } from './shared'
import { brand } from '@/lib/brand'
import { relativeDay } from '@/lib/format'

/**
 * DAILY FOCUS, RELATIONSHIP SUMMARY, WEEKLY REFLECTION, PROFILE NARRATIVE
 * =============================================================================
 * The smaller recurring capabilities. All four follow the same contract as the
 * larger ones: a schema, a model prompt, and a deterministic composer that works
 * from the same evidence.
 * =============================================================================
 */

// =============================================================================
// DAILY FOCUS
// =============================================================================

export const dailyFocusSchema = z.object({
  /** One line: the single thing that most deserves attention today. */
  headline: z.string(),
  /** Why that is the answer, referencing real data. */
  reasoning: z.string(),
  priorities: z
    .array(
      z.object({
        what: z.string(),
        why: z.string(),
        meetingId: z.string().nullable(),
        personId: z.string().nullable(),
      }),
    )
    .max(4),
  /** Things that will quietly rot if ignored. */
  watchItems: z.array(z.string()).max(4),
})

export type DailyFocus = z.infer<typeof dailyFocusSchema>

export interface DailyFocusInput {
  user: UserContext
  today: string
  meetings: {
    id: string
    title: string
    scheduledAt: string | null
    importance: number
    objective: string | null
    hasBrief: boolean
    participants: PersonContext[]
  }[]
  overdueCommitments: (CommitmentContext & { personName: string | null })[]
  dueTodayCommitments: (CommitmentContext & { personName: string | null })[]
  /** People with meaningful history who have gone quiet. */
  quietRelationships: { id: string; name: string; daysSince: number }[]
}

function composeDailyFocus(input: DailyFocusInput): DailyFocus {
  const { meetings, overdueCommitments, dueTodayCommitments, quietRelationships } = input

  // Priority order is transparent and stated: unprepared important meetings
  // first, then overdue promises, then decay.
  const unprepared = meetings
    .filter((m) => !m.hasBrief)
    .sort((a, b) => b.importance - a.importance || (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''))

  const priorities: DailyFocus['priorities'] = []

  for (const m of unprepared.slice(0, 2)) {
    const reasons: string[] = []
    if (m.importance >= 4) reasons.push(`you marked it ${m.importance}/5 for importance`)
    const openWithAttendees = m.participants.flatMap((p) => p.openCommitments.filter((c) => c.isOverdue))
    if (openWithAttendees.length > 0) {
      reasons.push(`there is an overdue commitment with someone in the room`)
    }
    if (!m.objective) reasons.push('no objective is recorded yet')
    priorities.push({
      what: `Prepare for "${m.title}"`,
      why: reasons.length > 0 ? `It is unprepared and ${reasons.join(', and ')}.` : 'It is unprepared.',
      meetingId: m.id,
      personId: null,
    })
  }

  for (const c of overdueCommitments.slice(0, 2)) {
    priorities.push({
      what: c.description,
      // relativeDay, not the raw date. This string is read by a person on the
      // Today page — "Overdue since 2026-08-19" is a database value wearing a
      // sentence; "6 days overdue" is the thing they need to feel.
      why: `Overdue${c.dueOn ? ` — ${relativeDay(c.dueOn).toLowerCase()}` : ''}${c.personName ? `, and ${c.personName} is waiting on it` : ''}.`,
      meetingId: null,
      personId: null,
    })
  }

  for (const c of dueTodayCommitments.slice(0, 1)) {
    priorities.push({
      what: c.description,
      why: `Due today${c.personName ? ` to ${c.personName}` : ''}.`,
      meetingId: null,
      personId: null,
    })
  }

  const headline =
    priorities[0]?.what ??
    (meetings.length > 0
      ? `${meetings.length} meeting${meetings.length === 1 ? '' : 's'} today, all prepared.`
      : 'Nothing scheduled and nothing overdue.')

  const reasoning =
    priorities[0]?.why ??
    (meetings.length > 0
      ? 'Every meeting on your calendar today already has a brief, and no commitments are overdue.'
      : 'A good day to record what you learned from recent conversations while it is still fresh.')

  const watchItems: string[] = []
  for (const q of quietRelationships.slice(0, 3)) {
    watchItems.push(`No contact with ${q.name} in ${q.daysSince} days.`)
  }
  if (overdueCommitments.length > 2) {
    watchItems.push(`${overdueCommitments.length} commitments are overdue in total.`)
  }
  const noObjective = meetings.filter((m) => !m.objective)
  if (noObjective.length > 0) {
    watchItems.push(
      `${noObjective.length} meeting${noObjective.length === 1 ? ' has' : 's have'} no recorded objective.`,
    )
  }

  return { headline, reasoning, priorities: priorities.slice(0, 4), watchItems: watchItems.slice(0, 4) }
}

export const dailyFocusPrompt: PromptModule<DailyFocusInput, DailyFocus> = {
  id: 'daily-focus',
  kind: 'daily_focus',
  version: 'daily-focus@1.0.0',
  schema: dailyFocusSchema,
  system: (input) =>
    [
      BRAND_VOICE,
      styleBlock(input.user.coachingStyle),
      `TASK: tell the user what actually deserves their attention today, based only on the data below.

RULES
- No motivational language. No generic productivity advice. If there is nothing pressing, say so.
- Every priority must reference something concrete: a specific meeting, a specific overdue commitment, a specific person.
- meetingId and personId must be ids from the data, or null.
- Rank by: unprepared meetings the user marked important, then overdue commitments, then relationships going quiet.`,
    ].join('\n\n'),
  user: (input) =>
    [
      renderUser(input.user),
      `Today is ${input.today}.`,
      '',
      `## TODAY'S MEETINGS`,
      input.meetings.length === 0
        ? 'None scheduled.'
        : input.meetings
            .map(
              (m) =>
                `id="${m.id}" "${m.title}" at ${m.scheduledAt ?? 'unscheduled'}, importance ${m.importance}/5, ` +
                `${m.hasBrief ? 'BRIEF PREPARED' : 'NOT PREPARED'}. Objective: ${m.objective ?? 'none recorded'}. ` +
                `With: ${m.participants.map((p) => p.displayName).join(', ') || 'nobody recorded'}.`,
            )
            .join('\n'),
      '',
      `## OVERDUE COMMITMENTS`,
      input.overdueCommitments.length === 0
        ? 'None.'
        : input.overdueCommitments
            .map((c) => `- ${c.description} (due ${c.dueOn}${c.personName ? `, to ${c.personName}` : ''})`)
            .join('\n'),
      '',
      `## DUE TODAY`,
      input.dueTodayCommitments.length === 0
        ? 'None.'
        : input.dueTodayCommitments.map((c) => `- ${c.description}`).join('\n'),
      '',
      `## RELATIONSHIPS GOING QUIET`,
      input.quietRelationships.length === 0
        ? 'None flagged.'
        : input.quietRelationships.map((q) => `- ${q.name}: ${q.daysSince} days since contact`).join('\n'),
    ].join('\n'),
  compose: composeDailyFocus,
  cite: (input) => [
    ...input.overdueCommitments.map((c) => ({
      label: `Overdue: ${c.description}`,
      evidenceLevel: 'confirmed' as const,
      commitmentId: c.id,
    })),
    ...input.meetings.map((m) => ({
      label: `Meeting today: ${m.title}`,
      evidenceLevel: 'confirmed' as const,
    })),
  ],
}

// =============================================================================
// RELATIONSHIP SUMMARY — "what you have learned about working with this person"
// =============================================================================

export const relationshipSummarySchema = z.object({
  snapshot: z.string(),
  whatMatters: z.array(z.string()).max(5),
  communicationTendencies: z.array(z.string()).max(5),
  buildsTrust: z.array(z.string()).max(4),
  potentialFriction: z.array(z.string()).max(4),
  yourRelationship: z.string(),
  nextInteraction: z.array(z.string()).max(4),
  /** Explicit gaps. Rendered as "what Atturel doesn't know yet". */
  gaps: z.array(z.string()).max(4),
})

export type RelationshipSummary = z.infer<typeof relationshipSummarySchema>

export interface RelationshipSummaryInput {
  user: UserContext
  person: PersonContext
}

function composeRelationshipSummary(input: RelationshipSummaryInput): RelationshipSummary {
  const p = input.person
  const all = [...p.observations.confirmed, ...p.observations.observed]
  const byCategory = (cats: string[]) => all.filter((o) => cats.includes(o.category)).map((o) => o.content)

  const gaps: string[] = []
  if (p.interactionCount === 0) gaps.push('No interactions recorded yet.')
  if (p.observations.confirmed.length === 0) {
    gaps.push('Nothing has been confirmed directly by them or by you — everything here is observed or inferred.')
  }
  if (byCategory(['communication']).length === 0) {
    gaps.push('No recorded communication preferences. Worth noticing how they like to receive information.')
  }
  if (p.observations.inferred.length > 0) {
    gaps.push(
      `${p.observations.inferred.length} point${p.observations.inferred.length === 1 ? '' : 's'} here are inferred from limited evidence.`,
    )
  }

  const snapshot =
    p.interactionCount === 0
      ? `You have added ${p.displayName}${p.jobTitle ? `, ${p.jobTitle}` : ''}, but there is no interaction history yet. ${brand.name} has nothing to tell you about working with them until you log something.`
      : `${p.interactionCount} recorded interaction${p.interactionCount === 1 ? '' : 's'} with ${p.displayName}` +
        (p.lastInteractionAt ? `, most recently ${p.lastInteractionAt.slice(0, 10)}` : '') +
        `. ${p.observations.confirmed.length} confirmed and ${p.observations.observed.length} observed points on record.`

  const openCount = p.openCommitments.length
  const overdueCount = p.openCommitments.filter((c) => c.isOverdue).length
  const yourRelationship =
    `Marked ${p.relevance}/5 for importance to you.` +
    (openCount > 0
      ? ` ${openCount} open commitment${openCount === 1 ? '' : 's'}${overdueCount > 0 ? `, ${overdueCount} overdue` : ''}.`
      : ' No open commitments.') +
    (p.topics.length > 0 ? ` Recurring topics: ${p.topics.join(', ')}.` : '')

  const nextInteraction: string[] = []
  for (const c of p.openCommitments.filter((c) => c.isOverdue).slice(0, 2)) {
    nextInteraction.push(`Close the overdue commitment first: ${c.description}`)
  }
  for (const o of all.filter((o) => o.category === 'communication').slice(0, 2)) {
    nextInteraction.push(o.content)
  }
  if (nextInteraction.length === 0) {
    nextInteraction.push(
      p.interactionCount === 0
        ? `Log your first interaction so ${brand.name} has something to work from.`
        : 'Note how they respond to how you framed things this time.',
    )
  }

  return {
    snapshot,
    whatMatters: byCategory(['priority', 'context']).slice(0, 5),
    communicationTendencies: byCategory(['communication', 'preference']).slice(0, 5),
    buildsTrust: byCategory(['trust']).slice(0, 4),
    potentialFriction: byCategory(['friction']).slice(0, 4),
    yourRelationship,
    nextInteraction: nextInteraction.slice(0, 4),
    gaps: gaps.slice(0, 4),
  }
}

export const relationshipSummaryPrompt: PromptModule<RelationshipSummaryInput, RelationshipSummary> = {
  id: 'relationship-summary',
  kind: 'relationship_summary',
  version: 'relationship-summary@1.0.0',
  schema: relationshipSummarySchema,
  system: (input) =>
    [
      BRAND_VOICE,
      styleBlock(input.user.coachingStyle),
      dateBlock(),
      `TASK: summarise what the user has actually learned about working with this one person.

RULES
- This is a summary of a RECORD, not a personality profile. If the record is thin, the summary is short. Do not pad it.
- "gaps" is required and must be honest — it is the most trusted part of this page.
- Attribute observed patterns ("across three interactions..."). Hedge inferred ones ("may prefer...").
- Never characterise the person. Describe behaviour and stated preferences only.`,
    ].join('\n\n'),
  user: (input) => [renderUser(input.user), '', '## THE PERSON', renderPerson(input.person)].join('\n'),
  compose: composeRelationshipSummary,
  cite: (input): Citation[] => [
    ...[
      ...input.person.observations.confirmed,
      ...input.person.observations.observed,
      ...input.person.observations.inferred,
    ].map((o) => ({
      label: o.content,
      evidenceLevel: o.evidenceLevel,
      observationId: o.id,
      personId: input.person.id,
    })),
    ...input.person.recentInteractions.map((i) => ({
      label: `Interaction: "${i.title}" on ${i.occurredAt.slice(0, 10)}`,
      evidenceLevel: 'observed' as const,
      interactionId: i.id,
      personId: input.person.id,
    })),
  ],
}

// =============================================================================
// PROFILE NARRATIVE — the Interaction Profile reveal
// =============================================================================

export const profileNarrativeSchema = z.object({
  summary: z.string(),
  naturalDefault: z.array(z.string()).max(6),
  atYourBest: z.array(z.string()).max(4),
  underPressure: z.array(z.string()).max(4),
  howOthersExperienceYou: z.array(z.string()).max(4),
  youWorkBestWhen: z.array(z.string()).max(4),
})

export type ProfileNarrative = z.infer<typeof profileNarrativeSchema>

export interface ProfileNarrativeInput {
  user: UserContext
  archetype: string
  confidence: 'provisional' | 'moderate' | 'strong'
  dimensions: {
    id: string
    label: string
    pole: string
    blurb: string
    score: number
    lean: 'high' | 'low' | null
  }[]
}

function composeProfileNarrative(input: ProfileNarrativeInput): ProfileNarrative {
  const leaning = input.dimensions.filter((d) => d.lean !== null)
  const balanced = input.dimensions.filter((d) => d.lean === null)

  const summary =
    leaning.length === 0
      ? 'Your answers did not lean strongly in any direction. That usually means you adapt to the situation rather than running one default — useful, but it makes you harder to predict for the people around you.'
      : `You lead with ${leaning
          .slice(0, 2)
          .map((d) => d.pole.toLowerCase())
          .join(' and ')}. ${leaning[0]!.blurb}`

  return {
    summary,
    naturalDefault: leaning.slice(0, 6).map((d) => `${d.label}: ${d.blurb}`),
    atYourBest: leaning.slice(0, 3).map((d) => copyFor(d).best),
    underPressure: leaning.slice(0, 3).map((d) => copyFor(d).pressure),
    howOthersExperienceYou: leaning.slice(0, 3).map((d) => copyFor(d).experience),
    youWorkBestWhen: [
      ...leaning.slice(0, 2).map((d) => copyFor(d).context),
      ...(balanced.length > 2
        ? ['The situation calls for reading the room rather than running a default.']
        : []),
    ].slice(0, 4),
  }
}

/**
 * Pole-keyed copy. Each is written to be genuinely useful and non-judgemental:
 * every strength has a matching cost, and no pole is framed as the better one.
 */
/**
 * Keyed by `${dimensionId}:${lean}` rather than by pole NAME.
 *
 * The instrument has two pole vocabularies — archetype nouns ("Architect") and
 * display adjectives ("Structured") — and keying on either one silently missed
 * for the other, so every reveal fell back to the same generic sentence. The
 * composite key cannot drift.
 */
const POLE_COPY: Record<string, { best: string; pressure: string; experience: string; context: string }> = {
  'directness:high': {
    best: 'People know where you stand, which makes decisions move faster.',
    pressure: 'Directness can arrive before the reasoning, and land harder than you intended.',
    experience: 'Clear and unambiguous — occasionally blunter than you meant to be.',
    context: 'The room rewards candour and you have standing to use it.',
  },
  'directness:low': {
    best: 'Difficult messages land without putting people on the defensive.',
    pressure: 'The real point can get buried, and people may miss that you disagreed at all.',
    experience: 'Considerate and safe to disagree with — sometimes hard to read.',
    context: 'The relationship matters as much as the outcome.',
  },
  'social_energy:high': {
    best: 'You get a room talking and surface what people actually think.',
    pressure: 'You may fill space that someone else needed in order to speak.',
    experience: 'Energising and inclusive — occasionally dominant in the conversation.',
    context: 'The problem is best worked out live, with people in the room.',
  },
  'social_energy:low': {
    best: 'What you say is worth listening to, because you have already thought it through.',
    pressure: 'You may go quiet exactly when your view was most needed.',
    experience: 'Thoughtful and unhurried — sometimes read as disengaged.',
    context: 'You get material in advance and time to form a view.',
  },
  'pace:high': {
    best: 'Decisions stop drifting once you are involved.',
    pressure: 'You may commit before the risk is understood, and have to walk it back.',
    experience: 'Decisive and energising — sometimes ahead of where others are.',
    context: 'The cost of delay is higher than the cost of adjusting.',
  },
  'pace:low': {
    best: 'You catch the flaw that a faster decision would have carried forward.',
    pressure: 'Deliberation can look like avoidance to people waiting on you.',
    experience: 'Careful and dependable — sometimes slower than others need.',
    context: 'The decision is expensive to reverse.',
  },
  'detail:high': {
    best: 'You find the error before it becomes someone else’s problem.',
    pressure: 'You can spend attention on detail the decision did not turn on.',
    experience: 'Rigorous and trustworthy — occasionally exhausting to present to.',
    context: 'Accuracy matters more than speed, and you have time to check.',
  },
  'detail:low': {
    best: 'You keep a discussion attached to what it is actually for.',
    pressure: 'You may accept a summary that does not hold up underneath.',
    experience: 'Clear-headed and fast to the point — sometimes impatient with detail.',
    context: 'You trust the people handling the specifics.',
  },
  'decision_style:high': {
    best: 'Your decisions hold up when someone asks how you got there.',
    pressure: 'You may keep asking for evidence past the point where it changes the answer.',
    experience: 'Objective and persuadable by argument — sometimes slow to commit.',
    context: 'The evidence exists and can be gathered in time.',
  },
  'decision_style:low': {
    best: 'You move on a good read while others are still gathering.',
    pressure: 'A confident read is hard to distinguish from a correct one.',
    experience: 'Decisive and intuitive — sometimes hard to argue with on evidence.',
    context: 'The data is thin and judgement is the only tool available.',
  },
  'change_comfort:high': {
    best: 'You are willing to try the thing that has not been tried.',
    pressure: 'You may change direction before the last change has been given time.',
    experience: 'Open and generative — sometimes unsettling to people who need stability.',
    context: 'The downside is survivable and the upside is real.',
  },
  'change_comfort:low': {
    best: 'You protect what is working while everyone else is chasing the new thing.',
    pressure: 'Caution can read as resistance, even when the concern is sound.',
    experience: 'Steady and risk-literate — sometimes the brake in the room.',
    context: 'The cost of failure lands on people who did not choose the risk.',
  },
  'conflict:high': {
    best: 'Bad ideas do not survive contact with you, which saves everyone time later.',
    pressure: 'Pressure-testing can feel personal to the person being tested.',
    experience: 'Rigorous and honest — sometimes combative.',
    context: 'The group trusts each other enough to be challenged.',
  },
  'conflict:low': {
    best: 'You find the version of a decision that people will actually follow through on.',
    pressure: 'A disagreement you smoothed over can resurface later, larger.',
    experience: 'Steadying and generous — sometimes hard to get a real objection from.',
    context: 'The relationship has to survive the decision.',
  },
  'structure:high': {
    best: 'Things you own do not get relitigated, because the decision was written down.',
    pressure: 'Structure can outlive its usefulness and become the work itself.',
    experience: 'Organised and reliable — occasionally rigid.',
    context: 'The work spans enough people that structure is doing real load-bearing.',
  },
  'structure:low': {
    best: 'You adapt in the moment when the plan stops matching reality.',
    pressure: 'Without structure, commitments can be dropped rather than declined.',
    experience: 'Flexible and responsive — sometimes hard to plan around.',
    context: 'The situation is changing faster than a plan could track it.',
  },
}

const fallback = {
  best: 'This tendency gives you a consistent, predictable default.',
  pressure: 'Under pressure the same tendency can become less flexible.',
  experience: 'People generally know what to expect from you here.',
  context: 'The situation matches your natural approach.',
}

const copyKey = (d: { id: string; lean: 'high' | 'low' | null }) => `${d.id}:${d.lean ?? 'high'}`
const copyFor = (d: { id: string; lean: 'high' | 'low' | null }) => POLE_COPY[copyKey(d)] ?? fallback

export const profileNarrativePrompt: PromptModule<ProfileNarrativeInput, ProfileNarrative> = {
  id: 'profile-narrative',
  kind: 'profile_narrative',
  version: 'profile-narrative@1.0.0',
  schema: profileNarrativeSchema,
  system: (input) =>
    [
      BRAND_VOICE,
      styleBlock(input.user.coachingStyle),
      `TASK: write the reveal for the user's own Interaction Profile.

RULES
- This is a self-report personalisation instrument, not a psychological assessment. Never imply clinical validity, never diagnose, never predict performance or fitness for a role.
- Every pole is legitimate. For each strength, name its cost. Never suggest the user should be at the other end.
- "underPressure" must be careful and non-pathologising: describe what the same tendency does when stretched, not a flaw.
- "howOthersExperienceYou" is a reflection, not a criticism.
- Confidence is ${input.confidence}. If it is provisional, say plainly that this is a first read.
- Second person. Concrete. No horoscope language.`,
    ].join('\n\n'),
  user: (input) =>
    [
      `Archetype: ${input.archetype}`,
      `Confidence: ${input.confidence}`,
      '',
      'Dimension results:',
      ...input.dimensions.map(
        (d) => `- ${d.label}: ${d.score}/100 -> ${d.lean ? d.pole : 'Balanced'}. ${d.blurb}`,
      ),
    ].join('\n'),
  compose: composeProfileNarrative,
  cite: () => [
    {
      label: 'Your own answers to the Interaction Profile',
      evidenceLevel: 'confirmed' as const,
    },
  ],
}
