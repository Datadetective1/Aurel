import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { getPeopleContext, getOpenCommitments } from './context'
import {
  getConversation as loadConversation,
  listConversations,
  listDecisions,
  listLoops,
} from '@/lib/conversations/queries'
import type { Citation, PersonContext } from './types'

type Client = SupabaseClient<Database>

/**
 * COACH TOOLS
 * =============================================================================
 * The retrieval surface for "Ask Atturel".
 *
 * Two rules govern every function here:
 *
 *   1. AUTHORISATION IS NOT OPTIONAL. Each tool takes an explicit userId and
 *      filters by it, on top of RLS. A tool is the most likely place for an
 *      authorisation bug to hide, because it is called with model-chosen
 *      arguments — so the scope is never inferred from those arguments.
 *
 *   2. NO BULK EXPORT. Every tool is bounded and purpose-shaped. There is no
 *      "get everything" tool, because that is how a prompt-injected model
 *      exfiltrates a relationship record.
 *
 * These same functions are what a future public API or MCP server would call,
 * which is why they take a client and a userId rather than reading ambient
 * request state.
 * =============================================================================
 */

const MAX_RESULTS = 12

export interface ToolResult<T> {
  data: T
  /** Evidence behind the answer, surfaced in the UI. */
  citations: Citation[]
}

/** Find people by name fragment. The entry point for most questions. */
export async function searchPeople(
  supabase: Client,
  userId: string,
  query: string,
): Promise<
  ToolResult<{ id: string; name: string; title: string | null; organization: string | null }[]>
> {
  const term = query.trim().slice(0, 80)
  if (term.length < 2) return { data: [], citations: [] }

  const { data } = await supabase
    .from('people')
    .select('id, full_name, preferred_name, job_title, organizations(name)')
    .eq('user_id', userId)
    .is('archived_at', null)
    .or(`full_name.ilike.%${term}%,preferred_name.ilike.%${term}%`)
    .limit(MAX_RESULTS)

  return {
    data: (data ?? []).map((p) => ({
      id: p.id,
      name: p.preferred_name || p.full_name,
      title: p.job_title,
      organization: p.organizations?.name ?? null,
    })),
    citations: [],
  }
}

/** Everything known about one person, grouped by evidence level. */
export async function getPerson(
  supabase: Client,
  userId: string,
  personId: string,
): Promise<ToolResult<PersonContext | null>> {
  const map = await getPeopleContext(supabase, userId, [personId])
  const person = map.get(personId) ?? null

  if (!person) return { data: null, citations: [] }

  const citations: Citation[] = [
    ...person.observations.confirmed,
    ...person.observations.observed,
    ...person.observations.inferred,
  ].map((o) => ({
    label: o.content,
    evidenceLevel: o.evidenceLevel,
    observationId: o.id,
    personId: person.id,
  }))

  for (const interaction of person.recentInteractions) {
    citations.push({
      label: `"${interaction.title}" on ${interaction.occurredAt.slice(0, 10)}`,
      evidenceLevel: 'observed',
      interactionId: interaction.id,
      personId: person.id,
    })
  }

  return { data: person, citations }
}

/** Recorded interactions with one person, most recent first. */
export async function getRelationshipHistory(
  supabase: Client,
  userId: string,
  personId: string,
  limit = 8,
) {
  const { data } = await supabase
    .from('interaction_participants')
    .select('interactions(id, title, occurred_at, kind, summary, outcome, went_well)')
    .eq('user_id', userId)
    .eq('person_id', personId)
    .limit(limit)

  const interactions = (data ?? [])
    .map((row) => row.interactions)
    .filter((i): i is NonNullable<typeof i> => Boolean(i))
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))

  return {
    data: interactions,
    citations: interactions.map((i) => ({
      label: `"${i.title}" on ${i.occurred_at.slice(0, 10)}`,
      evidenceLevel: 'observed' as const,
      interactionId: i.id,
      personId,
    })),
  }
}

/** Everything still open, across all relationships. */
export async function getCommitments(supabase: Client, userId: string) {
  const commitments = await getOpenCommitments(supabase, userId)
  return {
    data: commitments.slice(0, 25),
    citations: commitments.slice(0, 25).map((c) => ({
      label: `${c.description}${c.dueOn ? ` (due ${c.dueOn})` : ''}`,
      evidenceLevel: 'confirmed' as const,
      commitmentId: c.id,
      personId: c.personId ?? undefined,
    })),
  }
}

/** Meetings coming up, with who is attending. */
export async function getUpcomingMeetings(supabase: Client, userId: string, limit = 8) {
  const { data } = await supabase
    .from('meetings')
    .select('id, title, scheduled_at, objective, importance, meeting_attendees(person_id)')
    .eq('user_id', userId)
    .eq('status', 'upcoming')
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .limit(limit)

  return {
    data: (data ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      scheduledAt: m.scheduled_at,
      objective: m.objective,
      importance: m.importance,
      personIds: (m.meeting_attendees ?? []).map((a) => a.person_id),
    })),
    citations: (data ?? []).map((m) => ({
      label: `Upcoming: ${m.title}`,
      evidenceLevel: 'confirmed' as const,
    })),
  }
}

/**
 * Full-text search across the user's own relationship memory.
 * Uses the RLS-scoped SQL function, so it cannot reach another user's rows.
 */
export async function searchRelationshipMemory(
  supabase: Client,
  userId: string,
  query: string,
  limit = 12,
) {
  const term = query.trim().slice(0, 120)
  if (term.length < 2) return { data: [], citations: [] }

  const { data } = await supabase.rpc('search_everything', { q: term, max_results: limit })

  const rows = (data ?? []) as {
    entity: string
    id: string
    title: string
    subtitle: string | null
    person_id: string | null
  }[]

  return {
    data: rows,
    citations: rows.map((r) => ({
      label: r.title,
      evidenceLevel: (r.entity === 'observation'
        ? 'observed'
        : 'confirmed') as Citation['evidenceLevel'],
      personId: r.person_id ?? undefined,
    })),
  }
}

/** Observations the user has explicitly confirmed about a person. */
export async function getConfirmedObservations(supabase: Client, userId: string, personId: string) {
  const { data } = await supabase
    .from('observations')
    .select('id, content, category, evidence_level, reinforcement_count')
    .eq('user_id', userId)
    .eq('person_id', personId)
    .eq('status', 'active')
    .eq('evidence_level', 'confirmed')
    .order('reinforcement_count', { ascending: false })
    .limit(20)

  return {
    data: data ?? [],
    citations: (data ?? []).map((o) => ({
      label: o.content,
      evidenceLevel: 'confirmed' as const,
      observationId: o.id,
      personId,
    })),
  }
}

/** Source-backed professional facts about a person. */
export async function getProfessionalFacts(supabase: Client, userId: string, personId: string) {
  const { data } = await supabase
    .from('professional_facts')
    .select('id, kind, value, detail, evidence_level, is_current')
    .eq('user_id', userId)
    .eq('person_id', personId)
    .eq('is_current', true)
    .limit(25)

  return {
    data: data ?? [],
    citations: (data ?? []).map((f) => ({
      label: `${f.value}${f.detail ? ` — ${f.detail}` : ''}`,
      evidenceLevel: f.evidence_level,
      personId,
    })),
  }
}

// =============================================================================
// CONVERSATIONS, LOOPS, DECISIONS
// =============================================================================

/** Conversations kept, newest first, optionally with one person. */
export async function getConversations(
  supabase: Client,
  userId: string,
  personId?: string,
  limit = 8,
) {
  const rows = await listConversations(supabase, userId, { personId, limit })
  return {
    data: rows.map((c) => ({
      id: c.id,
      title: c.title,
      occurredAt: c.occurredAt,
      summary: c.summary,
      outcome: c.outcome,
      participants: c.participants.map((p) => ({ id: p.id, name: p.name })),
      openLoops: c.openLoops,
      decisions: c.decisions,
    })),
    citations: rows.map((c) => ({
      label: `Conversation: "${c.title}" on ${c.occurredAt.slice(0, 10)}`,
      evidenceLevel: 'observed' as const,
      interactionId: c.id,
      personId: c.participants[0]?.id,
    })),
  }
}

/**
 * One conversation, with what the user confirmed from it. The transcript is
 * deliberately not returned: this is a retrieval surface, and a full transcript
 * is the bulk export every tool here refuses to be.
 */
export async function getConversationDetail(
  supabase: Client,
  userId: string,
  interactionId: string,
  timeZone: string,
) {
  const conversation = await loadConversation(supabase, userId, interactionId)
  if (!conversation) return { data: null, citations: [] as Citation[] }

  const [loops, decisions] = await Promise.all([
    listLoops(supabase, userId, { interactionId, scope: 'all', timeZone }),
    listDecisions(supabase, userId, { interactionId, scope: 'confirmed' }),
  ])
  const confirmed = loops.filter((l) => l.reviewStatus === 'confirmed')

  const citations: Citation[] = [
    {
      label: `Conversation: "${conversation.title}" on ${conversation.occurredAt.slice(0, 10)}`,
      evidenceLevel: 'observed',
      interactionId: conversation.id,
    },
    ...confirmed.map((l) => ({
      label: `${l.owner === 'user' ? 'You promised' : l.owner === 'person' ? `${l.person?.name ?? 'They'} promised` : 'Open'}: ${l.description}`,
      evidenceLevel: 'confirmed' as const,
      commitmentId: l.id,
      personId: l.personId ?? undefined,
    })),
    ...decisions.map((d) => ({
      label: `Decided: ${d.description}`,
      evidenceLevel: 'confirmed' as const,
      decisionId: d.id,
    })),
  ]

  return {
    data: {
      id: conversation.id,
      title: conversation.title,
      occurredAt: conversation.occurredAt,
      participants: conversation.participants.map((p) => ({ id: p.id, name: p.name })),
      summary: conversation.summary,
      outcome: conversation.outcome,
      topics: conversation.topics,
      loops: confirmed.map((l) => ({
        id: l.id,
        description: l.description,
        kind: l.kind,
        owner: l.owner,
        ownerName:
          l.owner === 'person' ? (l.person?.name ?? null) : l.owner === 'user' ? 'you' : null,
        dueOn: l.dueOn,
        status: l.status,
      })),
      decisions: decisions.map((d) => ({
        id: d.id,
        description: d.description,
        context: d.context,
        decidedOn: d.decidedOn,
      })),
      stillProposed: loops.filter((l) => l.reviewStatus === 'proposed').length,
    },
    citations,
  }
}

/** Confirmed decisions, newest first, optionally with one person. */
export async function getDecisions(
  supabase: Client,
  userId: string,
  personId?: string,
  limit = 12,
) {
  const rows = await listDecisions(supabase, userId, { personId, limit })
  return {
    data: rows.map((d) => ({
      id: d.id,
      description: d.description,
      context: d.context,
      decidedOn: d.decidedOn,
      conversation: d.interactionTitle,
      interactionId: d.interactionId,
      people: d.people.map((p) => p.name),
    })),
    citations: rows.map((d) => ({
      label: `Decided ${d.decidedOn}: ${d.description}`,
      evidenceLevel: 'confirmed' as const,
      decisionId: d.id,
      interactionId: d.interactionId ?? undefined,
      personId: d.people[0]?.id,
    })),
  }
}

/**
 * Open loops, optionally narrowed to one person, one owner, or one kind.
 * Confirmed only, and only what is active right now.
 */
export async function getLoops(
  supabase: Client,
  userId: string,
  options: {
    personId?: string
    owner?: 'user' | 'person' | 'shared'
    kind?: 'commitment' | 'question' | 'follow_up'
    timeZone: string
  },
) {
  const rows = (
    await listLoops(supabase, userId, {
      personId: options.personId,
      scope: 'active',
      timeZone: options.timeZone,
    })
  )
    .filter((l) => (options.owner ? l.owner === options.owner : true))
    .filter((l) => (options.kind ? l.kind === options.kind : true))
    .slice(0, 25)

  return {
    data: rows.map((l) => ({
      id: l.id,
      description: l.description,
      kind: l.kind,
      owner: l.owner,
      person: l.person?.name ?? null,
      personId: l.personId,
      dueOn: l.dueOn,
      status: l.status,
      conversation: l.interactionTitle,
      interactionId: l.interactionId,
    })),
    citations: rows.map((l) => ({
      label: `${l.owner === 'user' ? 'You promised' : l.owner === 'person' ? `${l.person?.name ?? 'They'} promised` : 'Open'}: ${l.description}${l.dueOn ? ` (due ${l.dueOn})` : ''}`,
      evidenceLevel: 'confirmed' as const,
      commitmentId: l.id,
      interactionId: l.interactionId ?? undefined,
      personId: l.personId ?? undefined,
    })),
  }
}
