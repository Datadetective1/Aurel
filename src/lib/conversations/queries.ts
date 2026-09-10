import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { resolveFaces } from './avatars'
import { compareLoops, loopIsActive, type LoopKind, type LoopOwner, type LoopStatus, type ReviewStatus } from './loops'

type Client = SupabaseClient<Database>

/**
 * READS
 * =============================================================================
 * The shapes the conversation, loop and decision surfaces render from. Every
 * query filters by user_id on top of RLS, the same defence in depth the rest
 * of the product uses, and faces are resolved once per page in a batch.
 * =============================================================================
 */

export interface Face {
  id: string
  name: string
  src: string | null
}

export interface ConversationSummary {
  id: string
  title: string
  occurredAt: string
  kind: Database['public']['Enums']['interaction_kind']
  sourceKind: Database['public']['Enums']['conversation_source']
  processingStatus: Database['public']['Enums']['conversation_processing_status']
  processingError: string | null
  summary: string | null
  outcome: string | null
  topics: string[]
  durationSeconds: number | null
  reviewedAt: string | null
  meetingId: string | null
  participants: Face[]
  /** Counts of what it left behind, confirmed only. */
  openLoops: number
  decisions: number
  /** Proposals still waiting on the user. */
  pendingReview: number
}

export interface LoopRecord {
  id: string
  description: string
  kind: LoopKind
  owner: LoopOwner
  ownerPersonId: string | null
  personId: string | null
  person: Face | null
  dueOn: string | null
  status: LoopStatus
  reviewStatus: ReviewStatus
  confidence: number | null
  excerpt: string | null
  deferredUntil: string | null
  interactionId: string | null
  interactionTitle: string | null
  meetingId: string | null
  createdAt: string
  completedAt: string | null
}

export interface DecisionRecord {
  id: string
  description: string
  context: string | null
  decidedOn: string
  reviewStatus: ReviewStatus
  confidence: number | null
  excerpt: string | null
  interactionId: string | null
  interactionTitle: string | null
  people: Face[]
}

function faceName(p: { full_name: string; preferred_name: string | null }) {
  return p.preferred_name || p.full_name
}

// =============================================================================
// CONVERSATIONS
// =============================================================================

export async function listConversations(
  supabase: Client,
  userId: string,
  options: { personId?: string; limit?: number } = {},
): Promise<ConversationSummary[]> {
  const limit = options.limit ?? 50

  let ids: string[] | null = null
  if (options.personId) {
    const { data } = await supabase
      .from('interaction_participants')
      .select('interaction_id')
      .eq('user_id', userId)
      .eq('person_id', options.personId)
    ids = (data ?? []).map((r) => r.interaction_id)
    if (ids.length === 0) return []
  }

  let query = supabase
    .from('interactions')
    .select(
      'id, title, occurred_at, kind, source_kind, processing_status, processing_error, summary, outcome, topics, duration_seconds, reviewed_at, meeting_id',
    )
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (ids) query = query.in('id', ids)

  const { data: rows } = await query
  if (!rows || rows.length === 0) return []

  return hydrateConversations(supabase, userId, rows)
}

export async function getConversation(
  supabase: Client,
  userId: string,
  id: string,
): Promise<ConversationSummary | null> {
  const { data: row } = await supabase
    .from('interactions')
    .select(
      'id, title, occurred_at, kind, source_kind, processing_status, processing_error, summary, outcome, topics, duration_seconds, reviewed_at, meeting_id',
    )
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle()
  if (!row) return null
  const [hydrated] = await hydrateConversations(supabase, userId, [row])
  return hydrated ?? null
}

type ConversationRow = {
  id: string
  title: string
  occurred_at: string
  kind: Database['public']['Enums']['interaction_kind']
  source_kind: Database['public']['Enums']['conversation_source']
  processing_status: Database['public']['Enums']['conversation_processing_status']
  processing_error: string | null
  summary: string | null
  outcome: string | null
  topics: string[]
  duration_seconds: number | null
  reviewed_at: string | null
  meeting_id: string | null
}

async function hydrateConversations(
  supabase: Client,
  userId: string,
  rows: ConversationRow[],
): Promise<ConversationSummary[]> {
  const ids = rows.map((r) => r.id)

  const [{ data: participants }, { data: loops }, { data: decisions }] = await Promise.all([
    supabase
      .from('interaction_participants')
      .select('interaction_id, people(id, full_name, preferred_name, avatar_url, avatar_path)')
      .eq('user_id', userId)
      .in('interaction_id', ids),
    supabase
      .from('commitments')
      .select('interaction_id, status, review_status')
      .eq('user_id', userId)
      .in('interaction_id', ids),
    supabase
      .from('decisions')
      .select('interaction_id, review_status')
      .eq('user_id', userId)
      .in('interaction_id', ids),
  ])

  const people = (participants ?? [])
    .map((p) => p.people)
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
  const faces = await resolveFaces(supabase, people, (p) => p.id)

  const participantsByConversation = new Map<string, Face[]>()
  for (const row of participants ?? []) {
    const p = row.people
    if (!p) continue
    const list = participantsByConversation.get(row.interaction_id) ?? []
    if (!list.some((f) => f.id === p.id)) {
      list.push({ id: p.id, name: faceName(p), src: faces.get(p.id) ?? null })
    }
    participantsByConversation.set(row.interaction_id, list)
  }

  const openByConversation = new Map<string, number>()
  const pendingByConversation = new Map<string, number>()
  for (const loop of loops ?? []) {
    if (!loop.interaction_id) continue
    if (loop.review_status === 'proposed') {
      pendingByConversation.set(loop.interaction_id, (pendingByConversation.get(loop.interaction_id) ?? 0) + 1)
    } else if (loop.review_status === 'confirmed' && (loop.status === 'open' || loop.status === 'later')) {
      openByConversation.set(loop.interaction_id, (openByConversation.get(loop.interaction_id) ?? 0) + 1)
    }
  }

  const decisionsByConversation = new Map<string, number>()
  for (const d of decisions ?? []) {
    if (!d.interaction_id) continue
    if (d.review_status === 'proposed') {
      pendingByConversation.set(d.interaction_id, (pendingByConversation.get(d.interaction_id) ?? 0) + 1)
    } else if (d.review_status === 'confirmed') {
      decisionsByConversation.set(d.interaction_id, (decisionsByConversation.get(d.interaction_id) ?? 0) + 1)
    }
  }

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    occurredAt: row.occurred_at,
    kind: row.kind,
    sourceKind: row.source_kind,
    processingStatus: row.processing_status,
    processingError: row.processing_error,
    summary: row.summary,
    outcome: row.outcome,
    topics: row.topics ?? [],
    durationSeconds: row.duration_seconds,
    reviewedAt: row.reviewed_at,
    meetingId: row.meeting_id,
    participants: participantsByConversation.get(row.id) ?? [],
    openLoops: openByConversation.get(row.id) ?? 0,
    decisions: decisionsByConversation.get(row.id) ?? 0,
    pendingReview: pendingByConversation.get(row.id) ?? 0,
  }))
}

// =============================================================================
// LOOPS
// =============================================================================

export async function listLoops(
  supabase: Client,
  userId: string,
  options: {
    personId?: string
    interactionId?: string
    /** 'active' is the working list; 'all' includes closed and deferred. */
    scope?: 'active' | 'all' | 'proposed'
    timeZone: string
    now?: Date
    limit?: number
  },
): Promise<LoopRecord[]> {
  const now = options.now ?? new Date()

  let query = supabase
    .from('commitments')
    .select(
      'id, description, kind, owner, owner_person_id, person_id, due_on, status, review_status, confidence, excerpt, deferred_until, interaction_id, meeting_id, created_at, completed_at, people!commitments_person_id_fkey(id, full_name, preferred_name, avatar_url, avatar_path), interactions(title)',
    )
    .eq('user_id', userId)
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(options.limit ?? 200)

  if (options.personId) query = query.eq('person_id', options.personId)
  if (options.interactionId) query = query.eq('interaction_id', options.interactionId)
  if (options.scope === 'proposed') query = query.eq('review_status', 'proposed')
  else if (options.scope !== 'all') query = query.eq('review_status', 'confirmed').in('status', ['open', 'later'])

  const { data } = await query
  const rows = data ?? []

  const faces = await resolveFaces(
    supabase,
    rows.map((r) => r.people).filter((p): p is NonNullable<typeof p> => Boolean(p)),
    (p) => p.id,
  )

  const records: LoopRecord[] = rows.map((r) => ({
    id: r.id,
    description: r.description,
    kind: r.kind,
    owner: r.owner,
    ownerPersonId: r.owner_person_id,
    personId: r.person_id,
    person: r.people
      ? { id: r.people.id, name: faceName(r.people), src: faces.get(r.people.id) ?? null }
      : null,
    dueOn: r.due_on,
    status: r.status,
    reviewStatus: r.review_status,
    confidence: r.confidence === null ? null : Number(r.confidence),
    excerpt: r.excerpt,
    deferredUntil: r.deferred_until,
    interactionId: r.interaction_id,
    interactionTitle: r.interactions?.title ?? null,
    meetingId: r.meeting_id,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  }))

  const scoped =
    options.scope === 'active' || options.scope === undefined
      ? records.filter((r) =>
          loopIsActive(
            { status: r.status, deferred_until: r.deferredUntil, review_status: r.reviewStatus },
            options.timeZone,
            now,
          ),
        )
      : records

  return scoped.sort((a, b) =>
    compareLoops(
      { due_on: a.dueOn, created_at: a.createdAt },
      { due_on: b.dueOn, created_at: b.createdAt },
      options.timeZone,
      now,
    ),
  )
}

// =============================================================================
// DECISIONS
// =============================================================================

export async function listDecisions(
  supabase: Client,
  userId: string,
  options: { personId?: string; interactionId?: string; scope?: 'confirmed' | 'all' | 'proposed'; limit?: number } = {},
): Promise<DecisionRecord[]> {
  let ids: string[] | null = null
  if (options.personId) {
    const { data } = await supabase
      .from('decision_people')
      .select('decision_id')
      .eq('user_id', userId)
      .eq('person_id', options.personId)
    ids = (data ?? []).map((r) => r.decision_id)
    if (ids.length === 0) return []
  }

  let query = supabase
    .from('decisions')
    .select(
      'id, description, context, decided_on, review_status, confidence, excerpt, interaction_id, interactions(title)',
    )
    .eq('user_id', userId)
    .order('decided_on', { ascending: false })
    .limit(options.limit ?? 100)

  if (ids) query = query.in('id', ids)
  if (options.interactionId) query = query.eq('interaction_id', options.interactionId)
  if (options.scope === 'proposed') query = query.eq('review_status', 'proposed')
  else if (options.scope !== 'all') query = query.eq('review_status', 'confirmed')

  const { data } = await query
  const rows = data ?? []
  if (rows.length === 0) return []

  const { data: links } = await supabase
    .from('decision_people')
    .select('decision_id, people(id, full_name, preferred_name, avatar_url, avatar_path)')
    .eq('user_id', userId)
    .in(
      'decision_id',
      rows.map((r) => r.id),
    )

  const people = (links ?? []).map((l) => l.people).filter((p): p is NonNullable<typeof p> => Boolean(p))
  const faces = await resolveFaces(supabase, people, (p) => p.id)

  const peopleByDecision = new Map<string, Face[]>()
  for (const link of links ?? []) {
    const p = link.people
    if (!p) continue
    const list = peopleByDecision.get(link.decision_id) ?? []
    list.push({ id: p.id, name: faceName(p), src: faces.get(p.id) ?? null })
    peopleByDecision.set(link.decision_id, list)
  }

  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    context: r.context,
    decidedOn: r.decided_on,
    reviewStatus: r.review_status,
    confidence: r.confidence === null ? null : Number(r.confidence),
    excerpt: r.excerpt,
    interactionId: r.interaction_id,
    interactionTitle: r.interactions?.title ?? null,
    people: peopleByDecision.get(r.id) ?? [],
  }))
}

/** Every open loop grouped by person, for a meeting's "since last time" panel. */
export async function loopsForPeople(
  supabase: Client,
  userId: string,
  personIds: string[],
  timeZone: string,
): Promise<Map<string, LoopRecord[]>> {
  const result = new Map<string, LoopRecord[]>()
  if (personIds.length === 0) return result
  const loops = await listLoops(supabase, userId, { timeZone, scope: 'active' })
  for (const loop of loops) {
    if (!loop.personId || !personIds.includes(loop.personId)) continue
    result.set(loop.personId, [...(result.get(loop.personId) ?? []), loop])
  }
  return result
}
