import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { resolveFaces } from '@/lib/conversations/avatars'
import { listConversations, listLoops } from '@/lib/conversations/queries'
import { relationshipLabel } from '@/lib/conversations/room'
import { addDays, endOfDayUtc, todayIn } from '@/lib/tz'
import { prepState } from './glance'
import { toVisualLoop } from './meeting.server'
import type { VisualLoop, VisualMeetingSummary, VisualPerson } from './types'

type Client = SupabaseClient<Database>

/**
 * TODAY, FOR THE PHONE
 * =============================================================================
 * The next seven days of meetings as face-first summaries, the loops most
 * worth attention, and the conversations still waiting on a review. Read from
 * the same tables and helpers the web Today uses; nothing generated.
 * =============================================================================
 */

export interface TodayVisual {
  meetings: VisualMeetingSummary[]
  loops: VisualLoop[]
  awaitingReview: { id: string; title: string; occurredAt: string; pending: number }[]
}

export async function loadTodayVisual(
  supabase: Client,
  userId: string,
  options: { timeZone: string; now?: Date },
): Promise<TodayVisual> {
  const now = options.now ?? new Date()
  const { timeZone } = options
  const horizon = endOfDayUtc(addDays(todayIn(timeZone, now), 6), timeZone)
  // A meeting that started up to an hour ago is still the one being prepared for.
  const from = new Date(now.getTime() - 60 * 60_000)

  const [{ data: meetings }, loops, conversations] = await Promise.all([
    supabase
      .from('meetings')
      .select('id, title, scheduled_at, objective, is_demo')
      .eq('user_id', userId)
      .eq('status', 'upcoming')
      .gte('scheduled_at', from.toISOString())
      .lte('scheduled_at', horizon.toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(10),
    listLoops(supabase, userId, {
      scope: 'active',
      timeZone,
      now,
      limit: 80,
      excludeArchivedPeople: true,
    }),
    listConversations(supabase, userId, { limit: 8 }),
  ])

  const ids = (meetings ?? []).map((m) => m.id)
  const [{ data: briefs }, { data: attendeeRows }] = ids.length
    ? await Promise.all([
        supabase
          .from('ai_artifacts')
          .select('subject_id')
          .eq('user_id', userId)
          .eq('kind', 'meeting_brief')
          .in('subject_id', ids),
        supabase
          .from('meeting_attendees')
          .select(
            'meeting_id, person_id, role, people(id, full_name, preferred_name, avatar_url, avatar_path, job_title, relationship_type, last_interaction_at, is_demo, archived_at, organizations(name, domain))',
          )
          .eq('user_id', userId)
          .in('meeting_id', ids),
      ])
    : [{ data: [] }, { data: [] }]

  // Today prepares for what is next, so someone the user removed is not in it.
  const attendees = (attendeeRows ?? []).filter((a) => a.people && !a.people.archived_at)
  const prepared = new Set((briefs ?? []).map((b) => b.subject_id))
  const visualLoops = loops.map((l) => toVisualLoop(l, timeZone, now))
  const people = attendees
    .map((a) => a.people)
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
  const faces = await resolveFaces(supabase, people, (p) => p.id)

  const summaries: VisualMeetingSummary[] = (meetings ?? []).map((m) => {
    const rows = attendees.filter((a) => a.meeting_id === m.id && a.people)
    const room: VisualPerson[] = rows.map((a) => {
      const p = a.people!
      const mine = visualLoops.filter((l) => l.personId === p.id)
      return {
        id: p.id,
        name: p.preferred_name || p.full_name,
        fullName: p.full_name,
        src: faces.get(p.id) ?? null,
        title: p.job_title,
        company: p.organizations?.name ?? null,
        companyDomain: p.organizations?.domain ?? null,
        context: relationshipLabel(p.relationship_type),
        lastInteractionAt: p.last_interaction_at,
        openLoops: mine.length,
        owe: mine.filter((l) => l.direction === 'owe').length,
        isDemo: p.is_demo,
      }
    })
    return {
      id: m.id,
      title: m.title,
      scheduledAt: m.scheduled_at,
      objective: m.objective,
      prep: prepState({ hasBrief: prepared.has(m.id), attendeeCount: room.length }),
      people: room,
      openLoops: room.reduce((n, p) => n + p.openLoops, 0),
      isDemo: m.is_demo,
    }
  })

  const ranked = [...visualLoops].sort((a, b) => {
    const score = (l: VisualLoop) => (l.overdue ? 0 : l.direction === 'owe' ? 1 : 2)
    return score(a) - score(b)
  })

  return {
    meetings: summaries,
    loops: ranked.slice(0, 8),
    awaitingReview: conversations
      .filter((c) => c.processingStatus === 'ready' && c.pendingReview > 0 && !c.reviewedAt)
      .map((c) => ({
        id: c.id,
        title: c.title,
        occurredAt: c.occurredAt,
        pending: c.pendingReview,
      })),
  }
}
