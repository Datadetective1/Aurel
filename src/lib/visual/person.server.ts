import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import {
  listConversations,
  listDecisions,
  listLoops,
  type ConversationSummary,
  type DecisionRecord,
  type LoopRecord,
} from '@/lib/conversations/queries'
import { loopIsActive } from '@/lib/conversations/loops'
import { buildTimeline, type TimelineEntry } from './timeline'

type Client = SupabaseClient<Database>

/**
 * ONE PERSON, VISUALLY
 * =============================================================================
 * The record between the user and one person, read once and arranged for the
 * visual surfaces: the dated timeline, the loops (active, and closed for the
 * timeline's "kept" entries), recent themes, and the next meeting.
 *
 * Confirmed rows only reach the timeline. Themes are the topics the user's own
 * kept conversations were read as having -- never inferred from public
 * material, never about the person's character.
 * =============================================================================
 */

export interface PersonRecordVisual {
  timeline: TimelineEntry[]
  activeLoops: LoopRecord[]
  allLoops: LoopRecord[]
  conversations: ConversationSummary[]
  decisions: DecisionRecord[]
  themes: string[]
  nextMeeting: { id: string; title: string; scheduledAt: string | null } | null
  lastMeetingAt: string | null
}

export async function loadPersonRecordVisual(
  supabase: Client,
  userId: string,
  personId: string,
  options: { firstName: string; timeZone: string; now?: Date },
): Promise<PersonRecordVisual> {
  const now = options.now ?? new Date()

  const [
    allLoops,
    conversations,
    decisions,
    { data: interactions },
    { data: notes },
    { data: memories },
    { data: meetings },
  ] = await Promise.all([
    listLoops(supabase, userId, { personId, scope: 'all', timeZone: options.timeZone, now }),
    listConversations(supabase, userId, { personId, limit: 6 }),
    listDecisions(supabase, userId, { personId, limit: 20 }),
    supabase
      .from('interaction_participants')
      .select('interactions(id, title, occurred_at, kind, summary, outcome, meeting_id)')
      .eq('user_id', userId)
      .eq('person_id', personId)
      .limit(100),
    supabase
      .from('notes')
      .select('id, body, created_at')
      .eq('user_id', userId)
      .eq('person_id', personId)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('observations')
      .select('id, content, created_at, evidence_level, source_kind')
      .eq('user_id', userId)
      .eq('person_id', personId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('meeting_attendees')
      .select('meetings(id, title, scheduled_at, status)')
      .eq('user_id', userId)
      .eq('person_id', personId)
      .limit(60),
  ])

  const activeLoops = allLoops.filter((l) =>
    loopIsActive(
      { status: l.status, deferred_until: l.deferredUntil, review_status: l.reviewStatus },
      options.timeZone,
      now,
    ),
  )

  const meetingRows = (meetings ?? [])
    .map((m) => m.meetings)
    .filter((m): m is NonNullable<typeof m> => Boolean(m))

  const upcoming = meetingRows
    .filter((m) => m.status === 'upcoming' && m.scheduled_at && new Date(m.scheduled_at) > now)
    .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
  const past = meetingRows
    .filter((m) => m.scheduled_at && new Date(m.scheduled_at) <= now && m.status !== 'cancelled')
    .sort((a, b) => (b.scheduled_at ?? '').localeCompare(a.scheduled_at ?? ''))

  const timeline = buildTimeline(
    {
      personFirstName: options.firstName,
      interactions: (interactions ?? [])
        .map((p) => p.interactions)
        .filter((i): i is NonNullable<typeof i> => Boolean(i))
        .map((i) => ({
          id: i.id,
          title: i.title,
          occurredAt: i.occurred_at,
          kind: i.kind,
          summary: i.summary,
          outcome: i.outcome,
          meetingId: i.meeting_id,
        })),
      meetings: meetingRows.map((m) => ({
        id: m.id,
        title: m.title,
        scheduledAt: m.scheduled_at,
        status: m.status,
      })),
      loops: allLoops.map((l) => ({
        id: l.id,
        description: l.description,
        kind: l.kind,
        owner: l.owner,
        status: l.status,
        reviewStatus: l.reviewStatus,
        createdAt: l.createdAt,
        completedAt: l.completedAt,
        interactionId: l.interactionId,
        excerpt: l.excerpt,
      })),
      decisions: decisions.map((d) => ({
        id: d.id,
        description: d.description,
        context: d.context,
        decidedOn: d.decidedOn,
        reviewStatus: d.reviewStatus,
        interactionId: d.interactionId,
      })),
      notes: (notes ?? []).map((n) => ({ id: n.id, body: n.body, createdAt: n.created_at })),
      memories: (memories ?? []).map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: m.created_at,
        evidenceLevel: m.evidence_level,
        sourceKind: m.source_kind,
      })),
    },
    now,
  )

  // Topics from the user's own kept conversations, newest first.
  const themes: string[] = []
  const seen = new Set<string>()
  for (const c of conversations) {
    for (const topic of c.topics) {
      const key = topic.trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      themes.push(topic.trim())
    }
  }

  const next = upcoming[0] ?? null

  return {
    timeline,
    activeLoops,
    allLoops,
    conversations,
    decisions,
    themes: themes.slice(0, 8),
    nextMeeting: next ? { id: next.id, title: next.title, scheduledAt: next.scheduled_at } : null,
    lastMeetingAt: past[0]?.scheduled_at ?? null,
  }
}
