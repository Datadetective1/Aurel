import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { features, serverEnv } from '@/lib/env'
import { logger } from '@/lib/logger'
import { getUserContext } from './context'
import {
  getCommitments,
  getPerson,
  getProfessionalFacts,
  getRelationshipHistory,
  getUpcomingMeetings,
  searchPeople,
  searchRelationshipMemory,
} from './tools'
import { BRAND_VOICE, dateBlock, renderPerson, renderUser, styleBlock } from './prompts/shared'
import { fenceUntrusted, UNTRUSTED_CONTENT_RULES } from './untrusted'
import type { Citation } from './types'
import { brand } from '@/lib/brand'

type Client = SupabaseClient<Database>

/**
 * ASK — the conversational surface.
 * =============================================================================
 * With a model configured, this runs a tool-calling loop over the retrieval
 * functions in tools.ts.
 *
 * Without one, it is NOT a dead end. Questions about a relationship record are
 * mostly structured queries wearing a sentence, so intent is classified
 * deterministically and answered from the database with citations. That covers
 * the questions people actually ask — "what do I owe people", "what have I
 * learned about Maya", "prepare me for tomorrow" — honestly and without
 * pretending to converse.
 * =============================================================================
 */

export interface CoachAnswer {
  answer: string
  citations: Citation[]
  /** Suggested follow-ups, rendered as chips. */
  followUps: string[]
  /** True when composed deterministically rather than generated. */
  grounded: boolean
  /** Links the UI can offer alongside the answer. */
  actions: { label: string; href: string }[]
}

type Intent =
  | { kind: 'commitments' }
  | { kind: 'upcoming' }
  | { kind: 'about_person'; query: string }
  | { kind: 'history_with'; query: string }
  | { kind: 'prepare_for'; query: string }
  | { kind: 'search'; query: string }
  | { kind: 'unknown' }

/**
 * Classify a question.
 *
 * Ordered most-specific first: "what did Lucas care about" is a history
 * question, not a generic search, and matching search first would lose that.
 */
export function classifyIntent(question: string): Intent {
  const q = question.trim().toLowerCase()

  if (/\b(what|which)\b.*\b(owe|commitments?|promised|outstanding|due)\b/.test(q)) {
    return { kind: 'commitments' }
  }
  if (/\b(commitments?|what do i owe|owe people|outstanding)\b/.test(q)) {
    return { kind: 'commitments' }
  }
  if (/\b(upcoming|this week|today|tomorrow|next meeting|schedule|calendar)\b/.test(q)) {
    return { kind: 'upcoming' }
  }

  const prepare = q.match(/\b(?:prepare me for|prep me for|prepare for|get me ready for)\s+(?:my\s+)?(?:meeting\s+with\s+)?(.+)/)
  if (prepare?.[1]) return { kind: 'prepare_for', query: cleanTarget(prepare[1]) }

  const history = q.match(
    /\b(?:what did|what has|what have i learned about|last (?:two )?meetings? with|history with|worked with)\s+(.+)/,
  )
  if (history?.[1]) return { kind: 'history_with', query: cleanTarget(history[1]) }

  const about = q.match(
    /\b(?:who is|tell me about|what do (?:we|i) know about|about)\s+(.+)/,
  )
  if (about?.[1]) return { kind: 'about_person', query: cleanTarget(about[1]) }

  if (q.length > 3) return { kind: 'search', query: question.trim() }
  return { kind: 'unknown' }
}

/** Strip trailing punctuation and filler from an extracted name. */
function cleanTarget(raw: string): string {
  return raw
    .replace(/[?.!,]+$/g, '')
    .replace(/\b(care about|in our last.*|our meetings?|the relationship)\b/g, '')
    .replace(/^(my|our|the)\s+/, '')
    .trim()
}

export async function askCoach(
  supabase: Client,
  userId: string,
  question: string,
): Promise<CoachAnswer> {
  if (features.generativeAI) {
    const generated = await askWithModel(supabase, userId, question)
    if (generated) return generated
  }
  return askDeterministically(supabase, userId, question)
}

// =============================================================================
// DETERMINISTIC PATH
// =============================================================================

async function askDeterministically(
  supabase: Client,
  userId: string,
  question: string,
): Promise<CoachAnswer> {
  const intent = classifyIntent(question)

  switch (intent.kind) {
    case 'commitments': {
      const { data, citations } = await getCommitments(supabase, userId)
      if (data.length === 0) {
        return {
          answer: 'Nothing is open. You have no recorded commitments outstanding.',
          citations: [],
          followUps: ['What is coming up?', 'Who have I not spoken to recently?'],
          grounded: true,
          actions: [],
        }
      }

      const overdue = data.filter((c) => c.isOverdue)
      const lines = data.slice(0, 10).map((c) => {
        const who = c.personName ? ` (${c.personName})` : ''
        const when = c.dueOn ? ` — due ${c.dueOn}${c.isOverdue ? ', overdue' : ''}` : ''
        const owner = c.owner === 'user' ? 'You owe' : c.owner === 'person' ? 'They owe' : 'Shared'
        return `${owner}: ${c.description}${who}${when}`
      })

      return {
        answer:
          `${data.length} open commitment${data.length === 1 ? '' : 's'}` +
          (overdue.length > 0 ? `, ${overdue.length} of them overdue.` : '.') +
          `\n\n${lines.join('\n')}`,
        citations,
        followUps: ['What is coming up?', 'What have I not followed up on?'],
        grounded: true,
        actions: [{ label: 'See Today', href: '/today' }],
      }
    }

    case 'upcoming': {
      const { data, citations } = await getUpcomingMeetings(supabase, userId)
      if (data.length === 0) {
        return {
          answer: 'Nothing is scheduled. You can prepare for a conversation manually at any time.',
          citations: [],
          followUps: ['What do I owe people?'],
          grounded: true,
          actions: [{ label: 'Prepare for a meeting', href: '/prepare' }],
        }
      }

      const lines = data.map(
        (m) =>
          `${m.scheduledAt ? m.scheduledAt.slice(0, 10) : 'Unscheduled'} — ${m.title}` +
          (m.objective ? `\n    Objective: ${m.objective}` : '\n    No objective recorded.'),
      )

      return {
        answer: `${data.length} upcoming:\n\n${lines.join('\n')}`,
        citations,
        followUps: ['What do I owe people?'],
        grounded: true,
        actions: [{ label: 'See all meetings', href: '/meetings' }],
      }
    }

    case 'about_person':
    case 'history_with':
    case 'prepare_for': {
      const matches = await searchPeople(supabase, userId, intent.query)

      if (matches.data.length === 0) {
        return {
          answer: `I have no record of anyone called "${intent.query}". Add them and I can start building context.`,
          citations: [],
          followUps: ['What do I owe people?', 'What is coming up?'],
          grounded: true,
          actions: [{ label: 'Add a person', href: '/people/new' }],
        }
      }

      if (matches.data.length > 1) {
        return {
          answer:
            `More than one person matches "${intent.query}":\n\n` +
            matches.data
              .map((p) => `- ${p.name}${p.title ? `, ${p.title}` : ''}${p.organization ? ` at ${p.organization}` : ''}`)
              .join('\n') +
            '\n\nWhich one did you mean?',
          citations: [],
          followUps: matches.data.slice(0, 3).map((p) => `Tell me about ${p.name}`),
          grounded: true,
          actions: matches.data.slice(0, 4).map((p) => ({
            label: p.name,
            href: `/people/${p.id}`,
          })),
        }
      }

      const target = matches.data[0]!

      if (intent.kind === 'prepare_for') {
        return {
          answer: `To prepare properly for ${target.name} I need to know what you are trying to achieve — the objective is what turns a record into guidance. Start a preparation and I will build the brief.`,
          citations: [],
          followUps: [`What have I learned about ${target.name}?`],
          grounded: true,
          actions: [
            { label: `Prepare for ${target.name}`, href: `/prepare?person=${target.id}` },
            { label: `Open ${target.name}`, href: `/people/${target.id}` },
          ],
        }
      }

      return describePerson(supabase, userId, target.id, target.name, intent.kind)
    }

    case 'search': {
      const { data, citations } = await searchRelationshipMemory(supabase, userId, intent.query)
      if (data.length === 0) {
        return {
          answer: `Nothing in your record matches "${intent.query}".`,
          citations: [],
          followUps: ['What do I owe people?', 'What is coming up?'],
          grounded: true,
          actions: [],
        }
      }
      return {
        answer:
          `${data.length} match${data.length === 1 ? '' : 'es'} in your record:\n\n` +
          data.map((r) => `- [${r.entity}] ${r.title}${r.subtitle ? ` — ${r.subtitle}` : ''}`).join('\n'),
        citations,
        followUps: [],
        grounded: true,
        actions: [],
      }
    }

    default:
      return {
        answer: `Ask me about a person, what you owe people, or what is coming up. For example: "What have I learned about Maya?" or "What commitments are open?"`,
        citations: [],
        followUps: ['What do I owe people?', 'What is coming up?'],
        grounded: true,
        actions: [],
      }
  }
}

/**
 * Compose an answer about one person, separating what is known from what is
 * guessed — the same evidence discipline the rest of the product uses.
 */
async function describePerson(
  supabase: Client,
  userId: string,
  personId: string,
  name: string,
  intent: 'about_person' | 'history_with',
): Promise<CoachAnswer> {
  const [{ data: person, citations }, history, facts] = await Promise.all([
    getPerson(supabase, userId, personId),
    getRelationshipHistory(supabase, userId, personId),
    getProfessionalFacts(supabase, userId, personId),
  ])

  if (!person) {
    return {
      answer: `I could not load ${name}.`,
      citations: [],
      followUps: [],
      grounded: true,
      actions: [],
    }
  }

  const sections: string[] = []

  // A current_role fact already names the organisation in its detail, so listing
  // current_organization separately reads as a duplicate ("CEO — Microsoft" /
  // "Microsoft").
  const roleFact = facts.data.find((f) => f.kind === 'current_role')
  const visibleFacts = facts.data.filter(
    (f) =>
      !(
        f.kind === 'current_organization' &&
        roleFact?.detail?.toLowerCase() === f.value.toLowerCase()
      ),
  )

  if (visibleFacts.length > 0) {
    sections.push(
      `PROFESSIONAL FACTS (from public sources)\n${visibleFacts
        .slice(0, 6)
        .map((f) => `- ${f.value}${f.detail ? ` — ${f.detail}` : ''}`)
        .join('\n')}`,
    )
  }

  if (person.observations.confirmed.length > 0) {
    sections.push(
      `CONFIRMED — they said it, or you confirmed it\n${person.observations.confirmed
        .map((o) => `- ${o.content}`)
        .join('\n')}`,
    )
  }

  if (person.observations.observed.length > 0) {
    sections.push(
      `OBSERVED — across your recorded interactions\n${person.observations.observed
        .map((o) => `- ${o.content}${o.reinforcementCount > 1 ? ` (seen ${o.reinforcementCount}x)` : ''}`)
        .join('\n')}`,
    )
  }

  if (person.observations.inferred.length > 0) {
    sections.push(
      `INFERRED — thin evidence, worth checking\n${person.observations.inferred
        .map((o) => `- ${o.content}`)
        .join('\n')}`,
    )
  }

  if (intent === 'history_with' && history.data.length > 0) {
    sections.push(
      `YOUR INTERACTIONS\n${history.data
        .slice(0, 6)
        .map((i) => `- ${i.occurred_at.slice(0, 10)} "${i.title}"${i.summary ? `: ${i.summary}` : ''}`)
        .join('\n')}`,
    )
  }

  if (person.openCommitments.length > 0) {
    sections.push(
      `STILL OPEN\n${person.openCommitments
        .map((c) => `- ${c.description}${c.isOverdue ? ' (overdue)' : ''}`)
        .join('\n')}`,
    )
  }

  const header =
    sections.length === 0
      ? `I don't know enough about ${person.displayName} yet. There are no recorded observations or interactions — research their public footprint or log a conversation and this fills in.`
      : `${person.displayName}${person.jobTitle ? `, ${person.jobTitle}` : ''}${person.organization ? ` at ${person.organization}` : ''}. ${person.interactionCount} recorded interaction${person.interactionCount === 1 ? '' : 's'}.`

  const unknowns: string[] = []
  if (person.interactionCount === 0) unknowns.push('You have no interaction history with them.')
  if (person.observations.confirmed.length === 0 && sections.length > 0) {
    unknowns.push('Nothing here has been confirmed directly — treat it as provisional.')
  }

  return {
    answer:
      [header, ...sections].join('\n\n') +
      (unknowns.length > 0 ? `\n\nWHAT I DON'T KNOW\n${unknowns.map((u) => `- ${u}`).join('\n')}` : ''),
    citations: [...citations, ...facts.citations],
    followUps: [`Prepare me for ${person.displayName}`, 'What do I owe people?'],
    grounded: true,
    actions: [
      { label: `Open ${person.displayName}`, href: `/people/${person.id}` },
      { label: 'Prepare', href: `/prepare?person=${person.id}` },
    ],
  }
}

// =============================================================================
// MODEL PATH
// =============================================================================

/**
 * Model-backed answer with tool calling.
 *
 * Returns null on any failure so the caller falls back to the deterministic
 * path — a coach that errors is worse than one that answers structurally.
 */
async function askWithModel(
  supabase: Client,
  userId: string,
  question: string,
): Promise<CoachAnswer | null> {
  try {
    const { generateText, tool, stepCountIs } = await import('ai')
    const { z } = await import('zod')

    const userContext = await getUserContext(supabase, userId)
    const collected: Citation[] = []

    const model =
      serverEnv.AI_PROVIDER === 'anthropic'
        ? (await import('@ai-sdk/anthropic')).createAnthropic({
            apiKey: serverEnv.ANTHROPIC_API_KEY,
          })(serverEnv.AI_MODEL)
        : (await import('@ai-sdk/openai')).createOpenAI({ apiKey: serverEnv.OPENAI_API_KEY })(
            serverEnv.AI_MODEL,
          )

    const result = await generateText({
      model,
      // Every tool closes over the authenticated userId. The model chooses WHICH
      // records to look at, never WHOSE.
      tools: {
        searchPeople: tool({
          description: 'Find people in the user\'s record by name.',
          inputSchema: z.object({ query: z.string() }),
          execute: async ({ query }) => (await searchPeople(supabase, userId, query)).data,
        }),
        getPerson: tool({
          description:
            'Everything recorded about one person, grouped by evidence level. Use the id from searchPeople.',
          inputSchema: z.object({ personId: z.string() }),
          execute: async ({ personId }) => {
            const result = await getPerson(supabase, userId, personId)
            collected.push(...result.citations)
            return result.data ? renderPerson(result.data) : 'No such person.'
          },
        }),
        getRelationshipHistory: tool({
          description: 'Recorded interactions with one person, most recent first.',
          inputSchema: z.object({ personId: z.string() }),
          execute: async ({ personId }) => {
            const result = await getRelationshipHistory(supabase, userId, personId)
            collected.push(...result.citations)
            return result.data
          },
        }),
        getOpenCommitments: tool({
          description: 'Every commitment still open, across all relationships.',
          inputSchema: z.object({}),
          execute: async () => {
            const result = await getCommitments(supabase, userId)
            collected.push(...result.citations)
            return result.data
          },
        }),
        getUpcomingMeetings: tool({
          description: 'Meetings coming up.',
          inputSchema: z.object({}),
          execute: async () => {
            const result = await getUpcomingMeetings(supabase, userId)
            collected.push(...result.citations)
            return result.data
          },
        }),
        searchRelationshipMemory: tool({
          description: 'Search notes, observations, interactions and commitments by keyword.',
          inputSchema: z.object({ query: z.string() }),
          execute: async ({ query }) => {
            const result = await searchRelationshipMemory(supabase, userId, query)
            collected.push(...result.citations)
            return result.data
          },
        }),
      },
      stopWhen: stepCountIs(6),
      system: [
        BRAND_VOICE,
        UNTRUSTED_CONTENT_RULES,
        styleBlock(userContext.coachingStyle),
        dateBlock(),
        renderUser(userContext),
        `You are answering a question about the user's own professional relationships.

- ALWAYS use the tools to look things up. Never answer from memory or assumption.
- If the tools return nothing, say so plainly. "I don't have enough recorded about them yet" is the correct answer.
- Separate what is CONFIRMED, what is OBSERVED across interactions, and what is INFERRED. Never blur them.
- Never invent an interaction, a quote, a date or a commitment.
- Keep it short. Answer the question that was asked.`,
      ].join('\n\n'),
      // The question is user-authored, but it may contain pasted content, so it
      // is fenced like any other untrusted input.
      prompt: fenceUntrusted(question, 'user question', 4000).fenced,
      temperature: 0.3,
    })

    if (!result.text?.trim()) return null

    return {
      answer: result.text.trim(),
      citations: collected.slice(0, 30),
      followUps: [],
      grounded: false,
      actions: [],
    }
  } catch (error) {
    logger.warn('coach.model_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
    return null
  }
}

/** Example prompts shown on the empty coach screen. */
export const COACH_EXAMPLES = [
  'What commitments do I owe people?',
  'What is coming up this week?',
  `What have I learned about working with…?`,
  'Prepare me for my next meeting',
] as const

export const COACH_INTRO = `Ask about the people you work with, what is still open, or what is coming up. ${brand.name} answers from your own record and shows the evidence.`
