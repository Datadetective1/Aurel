import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { aiModel, aiProvider, features, serverEnv } from '@/lib/env'
import { logger } from '@/lib/logger'
import { getUserContext } from './context'
import {
  getCommitments,
  getConversationDetail,
  getConversations,
  getDecisions,
  getLoops,
  getPerson,
  getProfessionalFacts,
  getRelationshipHistory,
  getUpcomingMeetings,
  searchPeople,
  searchRelationshipMemory,
} from './tools'
import { resolveFaces } from '@/lib/conversations/avatars'
import { BRAND_VOICE, dateBlock, renderPerson, renderUser, styleBlock } from './prompts/shared'
import { fenceUntrusted, UNTRUSTED_CONTENT_RULES } from './untrusted'
import { safeFetch } from '@/lib/sources/fetch'
import { extractFromHtml } from '@/lib/sources/extract'
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
  /**
   * What the answer cost, when a model produced it.
   *
   * Null on the deterministic path — which is the honest record, because
   * nothing was spent with a provider. Without this the coach meter counts
   * questions but not consumption, and unit economics stay unknowable the
   * moment a provider is configured.
   */
  usage?: {
    provider: string
    model: string
    inputTokens: number
    outputTokens: number
  } | null
  /**
   * Visual grounding. The people and conversations an answer rests on, so the
   * UI can show a face and a card rather than a list of labels. Filled from
   * the citations after the answer is composed; never from the model.
   */
  people?: {
    id: string
    name: string
    src: string | null
    title?: string | null
    company?: string | null
  }[]
  conversations?: { id: string; title: string; occurredAt: string }[]
}

type Intent =
  | { kind: 'commitments' }
  // Person-scoped follow-through: "what did I promise Jason", "open loops
  // with Ravi", "what decisions did we make with Priya".
  | { kind: 'promised_to'; query: string }
  | { kind: 'loops_with'; query: string }
  | { kind: 'decisions_with'; query: string | null }
  | { kind: 'questions'; query: string | null }
  | { kind: 'last_conversation'; query: string | null }
  | { kind: 'upcoming' }
  | { kind: 'about_person'; query: string }
  | { kind: 'history_with'; query: string }
  | { kind: 'prepare_for'; query: string }
  | { kind: 'search'; query: string }
  // A pasted link, optionally naming who it is about.
  | { kind: 'review_url'; url: string; personHint: string | null }
  | { kind: 'unknown' }

/**
 * Classify a question.
 *
 * Ordered most-specific first: "what did Lucas care about" is a history
 * question, not a generic search, and matching search first would lose that.
 */
export function classifyIntent(question: string): Intent {
  const q = question.trim().toLowerCase()

  // Checked before everything else: a link is an unambiguous instruction, and
  // "review this before my meeting with Maya" would otherwise classify as a
  // prepare-for question and quietly ignore the URL.
  const link = question.match(/https?:\/\/[^\s<>"')]+/i)
  if (link?.[0]) {
    return { kind: 'review_url', url: link[0], personHint: extractPersonHint(question) }
  }

  // Person-scoped follow-through, before the generic commitment intents so
  // "what did I promise Jason" does not collapse into "everything I owe".
  const promised = q.match(
    /\b(?:what (?:did|have) i (?:promise|owe|commit(?:ted)? to)|what do i owe|what am i (?:supposed|meant) to (?:send|do|give))\s+(?:to\s+)?(.+)/,
  )
  if (promised?.[1] && !/^(people|anyone|everyone|them)\b/.test(promised[1])) {
    return { kind: 'promised_to', query: cleanTarget(promised[1]) }
  }

  const loopsWith = q.match(
    /\b(?:open loops?|loops? (?:still )?open|still open|outstanding|waiting on|what(?:'s| is) (?:still )?open)\s+(?:do i (?:still )?have\s+)?(?:with|from|for|on)\s+(.+)/,
  )
  if (loopsWith?.[1]) return { kind: 'loops_with', query: cleanTarget(loopsWith[1]) }

  const decided = q.match(
    /\b(?:decisions?|decided|agreed on|settled)\b.*?(?:with|in my (?:last )?(?:meeting|conversation|call) with)\s+(.+)/,
  )
  if (decided?.[1]) return { kind: 'decisions_with', query: cleanTarget(decided[1]) }
  if (
    /\b(what (?:was|got|did we|have we) decided|what decisions|recent decisions|decisions? (?:were|was) made)\b/.test(
      q,
    )
  ) {
    return { kind: 'decisions_with', query: null }
  }

  const questions = q.match(
    /\b(?:unanswered|unresolved|open) questions?\b(?:.*?\b(?:with|from|for)\s+(.+))?/,
  )
  if (questions)
    return { kind: 'questions', query: questions[1] ? cleanTarget(questions[1]) : null }

  const lastConversation = q.match(
    /\b(?:last (?:conversation|call|chat|talk)|what did we (?:talk|speak) about|what came (?:up|out of)(?: the)? last (?:conversation|call))\b(?:.*?\b(?:with)\s+(.+))?/,
  )
  if (lastConversation) {
    return {
      kind: 'last_conversation',
      query: lastConversation[1] ? cleanTarget(lastConversation[1]) : null,
    }
  }

  if (/\b(what|which)\b.*\b(owe|commitments?|promised|outstanding|due)\b/.test(q)) {
    return { kind: 'commitments' }
  }
  if (/\b(commitments?|what do i owe|owe people|outstanding)\b/.test(q)) {
    return { kind: 'commitments' }
  }
  if (/\b(upcoming|this week|today|tomorrow|next meeting|schedule|calendar)\b/.test(q)) {
    return { kind: 'upcoming' }
  }

  const prepare = q.match(
    /\b(?:prepare me for|prep me for|prepare for|get me ready for)\s+(?:my\s+)?(?:meeting\s+with\s+)?(.+)/,
  )
  if (prepare?.[1]) return { kind: 'prepare_for', query: cleanTarget(prepare[1]) }

  const history = q.match(
    /\b(?:what did|what has|what have i learned about|last (?:two )?meetings? with|history with|worked with)\s+(.+)/,
  )
  if (history?.[1]) return { kind: 'history_with', query: cleanTarget(history[1]) }

  const about = q.match(/\b(?:who is|tell me about|what do (?:we|i) know about|about)\s+(.+)/)
  if (about?.[1]) return { kind: 'about_person', query: cleanTarget(about[1]) }

  if (q.length > 3) return { kind: 'search', query: question.trim() }
  return { kind: 'unknown' }
}

/**
 * Pull a person's name out of a sentence that also contains a link.
 *
 * Only trusts an explicit relational phrase — "with Maya", "about Priya". A
 * bare capitalised word could be anything, and guessing the wrong person is
 * exactly the failure the identity work exists to prevent.
 */
export function extractPersonHint(question: string): string | null {
  const withoutUrl = question.replace(/https?:\/\/[^\s<>"')]+/gi, ' ')
  const match = withoutUrl.match(
    /\b(?:with|about|for|regarding)\s+([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)?)/,
  )
  if (!match?.[1]) return null
  const name = match[1].trim()
  // "With Monday" is a date, not a colleague.
  if (/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Today|Tomorrow)$/i.test(name)) {
    return null
  }
  return name
}

/** Strip trailing punctuation and filler from an extracted name. */
function cleanTarget(raw: string): string {
  return raw
    .replace(/[?.!,]+$/g, '')
    .replace(/\b(care about|in our last.*|our meetings?|the relationship)\b/g, '')
    .replace(/^(my|our|the)\s+/, '')
    .trim()
}

/**
 * Read a link the user pasted into Ask.
 *
 * Deliberately does NOT save anything. Reading a page is cheap and reversible;
 * attaching it to a person writes into their permanent record and can only be
 * done against the right person. So this reports what the page is, says who it
 * looks like it concerns, and hands the user a link to attach it properly.
 *
 * The page is fetched through the same SSRF-guarded fetcher as research, and
 * its contents are never treated as instructions.
 */
/** "3 November 2001". Never an ISO timestamp in copy a person reads. */
function humanDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d)
}

function stripTrailingStop(value: string): string {
  return value.replace(/\.\s*$/, '')
}

async function reviewUrl(
  supabase: Client,
  userId: string,
  url: string,
  personHint: string | null,
): Promise<CoachAnswer> {
  const fetched = await safeFetch(url)

  if (!fetched.ok) {
    const explanation: Record<string, string> = {
      invalid_url: 'that does not look like a web address I can open',
      blocked_host: 'that address points somewhere private, so I will not fetch it',
      not_http: 'I can only read http and https pages',
      unsupported_type: 'that is not a page I can read as text',
      too_large: 'that page is too large to read safely',
      too_many_redirects: 'that link redirects too many times',
      timeout: 'that page took too long to respond',
      http_error: 'that page returned an error',
      network_error: 'I could not reach that page',
    }
    return {
      answer: `I could not read that link — ${explanation[fetched.reason] ?? 'it could not be fetched'}.`,
      citations: [],
      followUps: ['What do I owe people?', 'What is coming up?'],
      grounded: true,
      actions: [],
    }
  }

  const content = extractFromHtml(fetched.body, fetched.finalUrl)

  if (content.wordCount < 40) {
    return {
      answer: `I opened that link but there was almost no readable text on it, so there is nothing I can tell you from it.`,
      citations: [],
      followUps: [],
      grounded: true,
      actions: [],
    }
  }

  // Match against people already in the record. The hint is preferred; failing
  // that, a name appearing in the page itself.
  const { data: people } = await supabase
    .from('people')
    .select('id, full_name, preferred_name')
    .eq('user_id', userId)
    .is('archived_at', null)
    .limit(200)

  const haystack = `${content.title ?? ''} ${content.text.slice(0, 4000)}`.toLowerCase()
  const hint = personHint?.toLowerCase() ?? null

  const match =
    (hint
      ? (people ?? []).find(
          (p) =>
            p.full_name.toLowerCase().includes(hint) ||
            (p.preferred_name ?? '').toLowerCase() === hint,
        )
      : undefined) ?? (people ?? []).find((p) => haystack.includes(p.full_name.toLowerCase()))

  const lines: string[] = []
  // stripTrailingStop: publishers frequently end in "Inc." and produced "Inc..".
  lines.push(
    `${content.title ?? 'That page'}${
      content.publisher ? ` — ${stripTrailingStop(content.publisher)}` : ''
    }.`,
  )
  if (content.publishedAt) lines.push(`Published ${humanDate(content.publishedAt)}.`)
  if (content.description) lines.push(content.description)
  lines.push(`About ${content.wordCount.toLocaleString()} words of readable text.`)

  const actions: { label: string; href: string }[] = []

  if (match) {
    const name = match.preferred_name || match.full_name
    lines.push(
      `This looks like it concerns ${name}. I have not saved it — attach it on their page and I will extract source-backed facts, keeping the link as the evidence.`,
    )
    actions.push({ label: `Add this to ${name}`, href: `/people/${match.id}` })
  } else {
    lines.push(
      `I could not tell which of your people this is about, so I have not attached it to anyone. Open the right person and paste it under Add context.`,
    )
    actions.push({ label: 'Open People', href: '/people' })
  }

  return {
    answer: lines.join(' '),
    citations: [
      {
        label: `Public source: ${content.title ?? fetched.finalUrl}`,
        evidenceLevel: 'observed',
        sourceUrl: fetched.finalUrl,
        personId: match?.id,
      },
    ],
    followUps: match
      ? [`What do I know about ${match.preferred_name || match.full_name}?`]
      : ['What is coming up?'],
    grounded: true,
    actions,
  }
}

export async function askCoach(
  supabase: Client,
  userId: string,
  question: string,
): Promise<CoachAnswer> {
  const answer = features.generativeAI
    ? ((await askWithModel(supabase, userId, question)) ??
      (await askDeterministically(supabase, userId, question)))
    : await askDeterministically(supabase, userId, question)
  return groundAnswer(supabase, userId, answer)
}

/**
 * Attach faces and conversation cards to an answer, from its citations.
 *
 * The citations are the evidence; this only turns ids in them into things
 * the screen can show. A model cannot put a person here, because a model
 * never sees this step.
 */
async function groundAnswer(
  supabase: Client,
  userId: string,
  answer: CoachAnswer,
): Promise<CoachAnswer> {
  const personIds = [
    ...new Set(answer.citations.map((c) => c.personId).filter((id): id is string => Boolean(id))),
  ].slice(0, 6)
  const interactionIds = [
    ...new Set(
      answer.citations.map((c) => c.interactionId).filter((id): id is string => Boolean(id)),
    ),
  ].slice(0, 4)

  const [{ data: people }, { data: conversations }] = await Promise.all([
    personIds.length
      ? supabase
          .from('people')
          .select(
            'id, full_name, preferred_name, avatar_url, avatar_path, job_title, organizations(name)',
          )
          .eq('user_id', userId)
          .in('id', personIds)
      : Promise.resolve({
          data: [] as {
            id: string
            full_name: string
            preferred_name: string | null
            avatar_url: string | null
            avatar_path: string | null
            job_title: string | null
            organizations: { name: string } | null
          }[],
        }),
    interactionIds.length
      ? supabase
          .from('interactions')
          .select('id, title, occurred_at')
          .eq('user_id', userId)
          .in('id', interactionIds)
          .order('occurred_at', { ascending: false })
      : Promise.resolve({ data: [] as { id: string; title: string; occurred_at: string }[] }),
  ])

  const faces = await resolveFaces(supabase, people ?? [], (p) => p.id)

  return {
    ...answer,
    people: (people ?? []).map((p) => ({
      id: p.id,
      name: p.preferred_name || p.full_name,
      src: faces.get(p.id) ?? null,
      title: p.job_title,
      company: p.organizations?.name ?? null,
    })),
    conversations: (conversations ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      occurredAt: c.occurred_at,
    })),
  }
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
    case 'promised_to':
    case 'loops_with':
    case 'decisions_with':
    case 'questions':
    case 'last_conversation': {
      return answerFollowThrough(supabase, userId, intent)
    }

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
              .map(
                (p) =>
                  `- ${p.name}${p.title ? `, ${p.title}` : ''}${p.organization ? ` at ${p.organization}` : ''}`,
              )
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

    case 'review_url': {
      return reviewUrl(supabase, userId, intent.url, intent.personHint)
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
          data
            .map((r) => `- [${r.entity}] ${r.title}${r.subtitle ? ` — ${r.subtitle}` : ''}`)
            .join('\n'),
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
 * Follow-through questions: what did I promise, what is open, what was
 * decided, what came out of the last conversation. Every line is something
 * the user confirmed, and the answer says so.
 */
async function answerFollowThrough(
  supabase: Client,
  userId: string,
  intent: Extract<
    Intent,
    { kind: 'promised_to' | 'loops_with' | 'decisions_with' | 'questions' | 'last_conversation' }
  >,
): Promise<CoachAnswer> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .maybeSingle()
  const timeZone = profile?.timezone ?? 'UTC'

  let target: { id: string; name: string } | null = null
  if (intent.query) {
    const matches = await searchPeople(supabase, userId, intent.query)
    if (matches.data.length === 0) {
      return {
        answer: `I have no record of anyone called "${intent.query}".`,
        citations: [],
        followUps: ['What do I owe people?', 'What is still open?'],
        grounded: true,
        actions: [{ label: 'Add a person', href: '/people/new' }],
      }
    }
    if (matches.data.length > 1) {
      return {
        answer:
          `More than one person matches "${intent.query}":\n\n` +
          matches.data.map((p) => `- ${p.name}${p.title ? `, ${p.title}` : ''}`).join('\n') +
          '\n\nWhich one did you mean?',
        citations: [],
        followUps: matches.data.slice(0, 3).map((p) => `What did I promise ${p.name}?`),
        grounded: true,
        actions: matches.data.slice(0, 4).map((p) => ({ label: p.name, href: `/people/${p.id}` })),
      }
    }
    target = matches.data[0]!
  }

  const first = target?.name.split(' ')[0] ?? null

  if (intent.kind === 'promised_to' || intent.kind === 'loops_with') {
    const owner = intent.kind === 'promised_to' ? ('user' as const) : undefined
    const { data, citations } = await getLoops(supabase, userId, {
      personId: target?.id,
      owner,
      timeZone,
    })
    const loops = data.filter((l) => l.kind !== 'question' || intent.kind === 'loops_with')

    if (loops.length === 0) {
      return {
        answer: target
          ? intent.kind === 'promised_to'
            ? `Nothing open that you promised ${first}. Every commitment to them on record is closed, or none was ever kept.`
            : `Nothing is open with ${first}.`
          : 'Nothing open.',
        citations: [],
        followUps: target
          ? [
              `What did we decide with ${first}?`,
              `What was my last conversation with ${first} about?`,
            ]
          : ['What is coming up?'],
        grounded: true,
        actions: target
          ? [{ label: `Open ${target.name}`, href: `/people/${target.id}` }]
          : [{ label: 'Open loops', href: '/loops' }],
      }
    }

    const line = (l: (typeof loops)[number]) =>
      `- ${l.owner === 'user' ? 'You' : l.owner === 'person' ? (l.person ?? 'They') : 'Shared'}: ${l.description}` +
      (l.dueOn ? ` — due ${l.dueOn}` : '') +
      (l.conversation ? ` (from "${l.conversation}")` : '')

    const yours = loops.filter((l) => l.owner === 'user' && l.kind !== 'question')
    const theirs = loops.filter((l) => l.owner === 'person' && l.kind !== 'question')
    const questions = loops.filter((l) => l.kind === 'question')
    const shared = loops.filter((l) => l.owner === 'shared' && l.kind !== 'question')

    const sections: string[] = []
    if (yours.length)
      sections.push(`YOU PROMISED — confirmed by you\n${yours.map(line).join('\n')}`)
    if (theirs.length)
      sections.push(`WAITING ON THEM — confirmed by you\n${theirs.map(line).join('\n')}`)
    if (questions.length)
      sections.push(`UNANSWERED\n${questions.map((q) => `- ${q.description}`).join('\n')}`)
    if (shared.length) sections.push(`BETWEEN YOU\n${shared.map(line).join('\n')}`)

    return {
      answer:
        (target
          ? `${loops.length} open ${loops.length === 1 ? 'loop' : 'loops'} with ${target.name}.`
          : `${loops.length} open ${loops.length === 1 ? 'loop' : 'loops'}.`) +
        '\n\n' +
        sections.join('\n\n'),
      citations,
      followUps: target
        ? [`What did we decide with ${first}?`, `Prepare me for ${first}`]
        : ['What did we decide recently?'],
      grounded: true,
      actions: [
        { label: 'Open loops', href: '/loops' },
        ...(target ? [{ label: `Open ${target.name}`, href: `/people/${target.id}` }] : []),
      ],
    }
  }

  if (intent.kind === 'decisions_with') {
    const { data, citations } = await getDecisions(supabase, userId, target?.id)
    if (data.length === 0) {
      return {
        answer: target
          ? `No confirmed decisions with ${first} on record. Decisions come from conversations you keep and confirm.`
          : 'No confirmed decisions on record yet.',
        citations: [],
        followUps: ['What is still open?'],
        grounded: true,
        actions: [{ label: 'Keep a conversation', href: '/conversations/new' }],
      }
    }
    return {
      answer:
        (target
          ? `Decisions with ${target.name}, confirmed by you:`
          : 'Decisions on record, confirmed by you:') +
        '\n\n' +
        data
          .map(
            (d) =>
              `- ${d.decidedOn}: ${d.description}` +
              (d.context ? ` — because ${d.context}` : '') +
              (d.conversation ? ` (from "${d.conversation}")` : ''),
          )
          .join('\n'),
      citations,
      followUps: target ? [`What did I promise ${first}?`] : ['What do I owe people?'],
      grounded: true,
      actions: target
        ? [{ label: `Open ${target.name}`, href: `/people/${target.id}` }]
        : [{ label: 'Conversations', href: '/conversations' }],
    }
  }

  if (intent.kind === 'questions') {
    const { data, citations } = await getLoops(supabase, userId, {
      personId: target?.id,
      kind: 'question',
      timeZone,
    })
    if (data.length === 0) {
      return {
        answer: target
          ? `No unanswered questions on record with ${first}.`
          : 'No unanswered questions on record.',
        citations: [],
        followUps: ['What do I owe people?'],
        grounded: true,
        actions: [{ label: 'Open loops', href: '/loops' }],
      }
    }
    return {
      answer:
        `${data.length} unanswered ${data.length === 1 ? 'question' : 'questions'}${target ? ` with ${target.name}` : ''}:\n\n` +
        data
          .map((q) => `- ${q.description}${q.conversation ? ` (from "${q.conversation}")` : ''}`)
          .join('\n'),
      citations,
      followUps: target ? [`Prepare me for ${first}`] : [],
      grounded: true,
      actions: [{ label: 'Open loops', href: '/loops' }],
    }
  }

  // last_conversation
  const { data: conversations } = await getConversations(supabase, userId, target?.id, 1)
  const latest = conversations[0]
  if (!latest) {
    return {
      answer: target
        ? `No conversation with ${first} has been kept yet.`
        : 'No conversation has been kept yet.',
      citations: [],
      followUps: [],
      grounded: true,
      actions: [
        {
          label: 'Keep a conversation',
          href: target ? `/conversations/new?person=${target.id}` : '/conversations/new',
        },
      ],
    }
  }
  const detail = await getConversationDetail(supabase, userId, latest.id, timeZone)
  const d = detail.data
  const lines: string[] = [
    `"${latest.title}", ${latest.occurredAt.slice(0, 10)}${latest.participants.length ? `, with ${latest.participants.map((p) => p.name).join(', ')}` : ''}.`,
  ]
  if (d?.summary) lines.push(d.summary)
  if (d?.outcome) lines.push(`Upshot: ${d.outcome}`)
  if (d && d.loops.length) {
    lines.push(
      `LEFT OPEN — confirmed by you\n${d.loops.map((l) => `- ${l.owner === 'user' ? 'You' : (l.ownerName ?? 'Shared')}: ${l.description}${l.dueOn ? ` — due ${l.dueOn}` : ''}`).join('\n')}`,
    )
  }
  if (d && d.decisions.length) {
    lines.push(
      `DECIDED — confirmed by you\n${d.decisions.map((x) => `- ${x.description}`).join('\n')}`,
    )
  }
  if (d && d.stillProposed > 0) {
    lines.push(
      `WHAT I DON'T KNOW\n- ${d.stillProposed} suggested ${d.stillProposed === 1 ? 'item is' : 'items are'} still waiting for your review on that conversation, so ${d.stillProposed === 1 ? 'it is' : 'they are'} not counted here.`,
    )
  }

  return {
    answer: lines.join('\n\n'),
    citations: detail.citations,
    followUps: target ? [`What did I promise ${first}?`, `Prepare me for ${first}`] : [],
    grounded: true,
    actions: [{ label: 'Open the conversation', href: `/conversations/${latest.id}` }],
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
        .map(
          (o) =>
            `- ${o.content}${o.reinforcementCount > 1 ? ` (seen ${o.reinforcementCount}x)` : ''}`,
        )
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
        .map(
          (i) => `- ${i.occurred_at.slice(0, 10)} "${i.title}"${i.summary ? `: ${i.summary}` : ''}`,
        )
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
      (unknowns.length > 0
        ? `\n\nWHAT I DON'T KNOW\n${unknowns.map((u) => `- ${u}`).join('\n')}`
        : ''),
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

    // createOpenAI()(id) routes to the OpenAI Responses API by default in
    // AI SDK 5+, which is the current path; there is no deprecated
    // chat-completions call here.
    const model =
      aiProvider === 'anthropic'
        ? (await import('@ai-sdk/anthropic')).createAnthropic({
            apiKey: serverEnv.ANTHROPIC_API_KEY,
          })(aiModel)
        : (await import('@ai-sdk/openai')).createOpenAI({ apiKey: serverEnv.OPENAI_API_KEY })(
            aiModel,
          )

    const result = await generateText({
      model,
      // Every tool closes over the authenticated userId. The model chooses WHICH
      // records to look at, never WHOSE.
      tools: {
        searchPeople: tool({
          description: "Find people in the user's record by name.",
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
        getConversations: tool({
          description:
            'Conversations the user has kept, newest first, with a summary each. Pass personId to narrow to one person.',
          inputSchema: z.object({ personId: z.string().optional() }),
          execute: async ({ personId }) => {
            const result = await getConversations(supabase, userId, personId)
            collected.push(...result.citations)
            return result.data
          },
        }),
        getConversation: tool({
          description:
            'One conversation in detail: summary, the loops and decisions the user CONFIRMED from it, and how many suggestions are still unreviewed. Use an id from getConversations.',
          inputSchema: z.object({ conversationId: z.string() }),
          execute: async ({ conversationId }) => {
            const result = await getConversationDetail(
              supabase,
              userId,
              conversationId,
              userContext.timeZone,
            )
            collected.push(...result.citations)
            return result.data ?? 'No such conversation.'
          },
        }),
        getOpenLoops: tool({
          description:
            'Open loops the user has confirmed: commitments they made (owner "user"), commitments others made (owner "person"), and unanswered questions (kind "question"). Narrow by personId, owner or kind.',
          inputSchema: z.object({
            personId: z.string().optional(),
            owner: z.enum(['user', 'person', 'shared']).optional(),
            kind: z.enum(['commitment', 'question', 'follow_up']).optional(),
          }),
          execute: async ({ personId, owner, kind }) => {
            const result = await getLoops(supabase, userId, {
              personId,
              owner,
              kind,
              timeZone: userContext.timeZone,
            })
            collected.push(...result.citations)
            return result.data
          },
        }),
        getDecisions: tool({
          description:
            'Decisions the user has confirmed, newest first, with the reason when one was recorded. Pass personId to narrow.',
          inputSchema: z.object({ personId: z.string().optional() }),
          execute: async ({ personId }) => {
            const result = await getDecisions(supabase, userId, personId)
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
        dateBlock(userContext.timeZone),
        renderUser(userContext),
        `You are answering a question about the user's own professional relationships.

- ALWAYS use the tools to look things up. Never answer from memory or assumption.
- If the tools return nothing, say so plainly. "I don't have enough recorded about them yet" is the correct answer.
- Separate what is CONFIRMED, what is OBSERVED across interactions, and what is INFERRED. Never blur them.
- Loops and decisions returned by the tools were CONFIRMED by the user. Say so. A conversation's "stillProposed" count is things the user has NOT reviewed: mention that they exist, never state their contents as fact.
- For "what did I promise X", use getOpenLoops with owner "user" and the person's id. For "what did we decide", use getDecisions. For "what came out of the last conversation", use getConversations then getConversation.
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
      usage: {
        provider: aiProvider,
        model: aiModel,
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
      },
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
  'What did I promise…?',
  'What decisions did we make with…?',
  'What is still open?',
  'What is coming up this week?',
  `What have I learned about working with…?`,
] as const

/**
 * The same screen, for an account with nothing in it yet.
 *
 * Offering "What commitments do I owe people?" to an empty record invites a
 * question that can only come back empty, and a first answer of "I have nothing
 * on that" reads as a broken product rather than an honest one. This says what
 * it needs first.
 */
export const COACH_EXAMPLES_EMPTY = [
  `What does ${brand.name} know about me so far?`,
  'How should I approach a first meeting with someone new?',
  'What should I record after a meeting?',
] as const

export const COACH_INTRO = `Ask about the people you work with, what is still open, or what is coming up. ${brand.name} answers from your own record and shows the evidence.`

export const COACH_INTRO_EMPTY = `${brand.name} answers from your own record, so it needs one first. Add a person and record a conversation, or connect your calendar, and this becomes the fastest way to ask what you are walking into.`
