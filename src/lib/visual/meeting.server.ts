import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { resolveFaces } from '@/lib/conversations/avatars'
import { listLoops, type LoopRecord } from '@/lib/conversations/queries'
import { relationshipLabel } from '@/lib/conversations/room'
import { roleLabel } from '@/components/app/room-strip'
import { normalizeBrief, type NormalizedBrief } from '@/lib/brief'
import { isOverdueIn } from '@/lib/tz'
import { actionDirection } from './relationship-actions'
import { composeRemember, prepState, type PrepState } from './glance'
import { describeConnection, findConnections } from './commonality'
import type { VisualConnection, VisualGlance, VisualLoop, VisualPerson } from './types'

type Client = SupabaseClient<Database>

/**
 * THE MEETING, VISUALLY
 * =============================================================================
 * One read for everything the briefing cockpit, the room view and the native
 * Prepare screen show about a meeting: who, from where, how the user knows
 * them, what is open with each of them, what they verifiably have in common,
 * and the glance composed from the stored brief.
 *
 * Nothing is generated here. The brief is read from its stored artifact; the
 * rest is read fresh from the record on every visit, because a loop closed
 * this morning must not still show as open at two o'clock.
 *
 * Faces are signed in one batch and a missing photo is null, never an error:
 * an unavailable headshot must never stop a brief from rendering.
 * =============================================================================
 */

export interface MeetingVisual {
  meeting: {
    id: string
    title: string
    scheduledAt: string | null
    kind: Database['public']['Enums']['meeting_kind']
    objective: string | null
    importance: number
    status: Database['public']['Enums']['meeting_status']
    isDemo: boolean
  }
  artifact: { id: string; createdAt: string; grounded: boolean } | null
  brief: NormalizedBrief | null
  people: VisualPerson[]
  loops: LoopRecord[]
  visualLoops: VisualLoop[]
  lastConversation: {
    id: string
    title: string
    occurredAt: string
    outcome: string | null
    summary: string | null
  } | null
  connections: VisualConnection[]
  prep: PrepState
  glance: VisualGlance
}

const ROLE_WEIGHT: Record<string, number> = {
  decision_maker: 4,
  influencer: 3,
  presenter: 2,
  contributor: 1,
}

export function toVisualLoop(loop: LoopRecord, timeZone: string, now: Date): VisualLoop {
  return {
    id: loop.id,
    description: loop.description,
    direction: actionDirection(loop),
    dueOn: loop.dueOn,
    overdue: loop.status === 'open' && isOverdueIn(loop.dueOn, timeZone, now),
    personId: loop.personId,
    personName: loop.person?.name ?? null,
    interactionId: loop.interactionId,
  }
}

/** Overdue first, then the user's own promises, then soonest. Input is already date-sorted. */
export function pickOpenLoop(loops: VisualLoop[]): VisualLoop | null {
  return (
    loops.find((l) => l.overdue) ??
    loops.find((l) => l.direction === 'owe') ??
    loops.find((l) => l.direction !== 'completed') ??
    null
  )
}

export async function loadMeetingVisual(
  supabase: Client,
  userId: string,
  meetingId: string,
  options: { timeZone: string; now?: Date },
): Promise<MeetingVisual | null> {
  const now = options.now ?? new Date()
  const { timeZone } = options

  const [{ data: meeting }, { data: artifact }, { data: attendees }] = await Promise.all([
    supabase
      .from('meetings')
      .select('id, title, kind, scheduled_at, objective, importance, status, is_demo')
      .eq('user_id', userId)
      .eq('id', meetingId)
      .maybeSingle(),
    supabase
      .from('ai_artifacts')
      .select('id, content, grounded_fallback, created_at')
      .eq('user_id', userId)
      .eq('kind', 'meeting_brief')
      .eq('subject_id', meetingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('meeting_attendees')
      .select(
        'person_id, role, people(id, full_name, preferred_name, avatar_url, avatar_path, job_title, relationship_type, last_interaction_at, is_demo, archived_at, organization_id, organizations(name, domain))',
      )
      .eq('user_id', userId)
      .eq('meeting_id', meetingId),
  ])

  if (!meeting) return null

  // Someone the user removed stays in the room they were in, marked archived,
  // after everyone else. Nothing about the relationship is read for them:
  // loops, conversations, facts and connections come from the active only.
  const rows = (attendees ?? [])
    .filter((a) => a.people)
    .sort(
      (a, b) =>
        Number(Boolean(a.people!.archived_at)) - Number(Boolean(b.people!.archived_at)) ||
        (ROLE_WEIGHT[b.role ?? ''] ?? 0) - (ROLE_WEIGHT[a.role ?? ''] ?? 0),
    )
  const active = rows.filter((r) => !r.people!.archived_at)
  const ids = active.map((r) => r.person_id)

  const [faces, allLoops, participations, facts, coAttendance] = await Promise.all([
    resolveFaces(
      supabase,
      rows.map((r) => r.people!),
      (p) => p.id,
    ),
    ids.length
      ? listLoops(supabase, userId, { timeZone, now, scope: 'active' })
      : Promise.resolve([]),
    ids.length
      ? supabase
          .from('interaction_participants')
          .select(
            'interaction_id, person_id, interactions(id, title, occurred_at, outcome, summary)',
          )
          .eq('user_id', userId)
          .in('person_id', ids)
      : Promise.resolve({ data: [] as never[] }),
    ids.length > 1
      ? supabase
          .from('professional_facts')
          .select('person_id, kind, value, evidence_level')
          .eq('user_id', userId)
          .in('person_id', ids)
          .in('kind', ['prior_role', 'education'])
      : Promise.resolve({ data: [] as never[] }),
    ids.length > 1
      ? supabase
          .from('meeting_attendees')
          .select('meeting_id, person_id')
          .eq('user_id', userId)
          .in('person_id', ids)
          .neq('meeting_id', meetingId)
      : Promise.resolve({ data: [] as never[] }),
  ])

  const loops = allLoops.filter((l) => l.personId && ids.includes(l.personId))
  const visualLoops = loops.map((l) => toVisualLoop(l, timeZone, now))

  const people: VisualPerson[] = rows.map((r) => {
    const p = r.people!
    const archived = Boolean(p.archived_at)
    const mine = archived ? [] : visualLoops.filter((l) => l.personId === p.id)
    return {
      id: p.id,
      name: p.preferred_name || p.full_name,
      fullName: p.full_name,
      src: faces.get(p.id) ?? null,
      title: p.job_title,
      company: p.organizations?.name ?? null,
      companyDomain: p.organizations?.domain ?? null,
      context: archived ? 'Archived' : roleLabel(r.role) || relationshipLabel(p.relationship_type),
      lastInteractionAt: archived ? null : p.last_interaction_at,
      openLoops: mine.length,
      owe: mine.filter((l) => l.direction === 'owe').length,
      isDemo: p.is_demo,
      ...(archived ? { archived: true } : {}),
    }
  })

  // --- the last conversation with anyone in this room -----------------------
  type Participation = {
    interaction_id: string
    person_id: string
    interactions: {
      id: string
      title: string | null
      occurred_at: string
      outcome: string | null
      summary: string | null
    } | null
  }
  const parts = ((participations.data ?? []) as Participation[]).filter((p) => p.interactions)
  const latest = parts
    .map((p) => p.interactions!)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0]
  const lastConversation = latest
    ? {
        id: latest.id,
        title: latest.title?.trim() || 'Your last conversation',
        occurredAt: latest.occurred_at,
        outcome: latest.outcome,
        summary: latest.summary,
      }
    : null

  // --- what the people in the room verifiably share -------------------------
  const byInteraction = new Map<string, string[]>()
  for (const p of parts) {
    byInteraction.set(p.interaction_id, [
      ...(byInteraction.get(p.interaction_id) ?? []),
      p.person_id,
    ])
  }
  const byMeeting = new Map<string, string[]>()
  for (const row of (coAttendance.data ?? []) as { meeting_id: string; person_id: string }[]) {
    byMeeting.set(row.meeting_id, [...(byMeeting.get(row.meeting_id) ?? []), row.person_id])
  }
  const connections: VisualConnection[] =
    ids.length > 1
      ? findConnections({
          people: active.map((r) => ({
            id: r.person_id,
            organizationId: r.people!.organization_id,
            organizationName: r.people!.organizations?.name ?? null,
          })),
          facts: (
            (facts.data ?? []) as {
              person_id: string
              kind: string
              value: string
              evidence_level: 'confirmed' | 'observed' | 'inferred' | 'unknown'
            }[]
          ).map((f) => ({
            personId: f.person_id,
            kind: f.kind,
            value: f.value,
            evidence: f.evidence_level,
          })),
          meetings: [...byMeeting.entries()].map(([id, personIds]) => ({ id, personIds })),
          conversations: [...byInteraction.entries()].map(([id, personIds]) => ({ id, personIds })),
        }).map((c) => ({ ...c, description: describeConnection(c) }))
      : []

  const brief = artifact ? normalizeBrief(artifact.content) : null
  const prep = prepState({ hasBrief: Boolean(artifact), attendeeCount: active.length })

  const glance: VisualGlance = {
    objective: brief?.objective ?? meeting.objective ?? null,
    howToOpen: brief?.howToOpen ?? null,
    remember: composeRemember({
      brief,
      lastConversation,
      openLoopCount: visualLoops.length,
    }),
    openLoop: pickOpenLoop(visualLoops),
  }

  return {
    meeting: {
      id: meeting.id,
      title: meeting.title,
      scheduledAt: meeting.scheduled_at,
      kind: meeting.kind,
      objective: meeting.objective,
      importance: meeting.importance,
      status: meeting.status,
      isDemo: meeting.is_demo,
    },
    artifact: artifact
      ? { id: artifact.id, createdAt: artifact.created_at, grounded: artifact.grounded_fallback }
      : null,
    brief,
    people,
    loops,
    visualLoops,
    lastConversation,
    connections,
    prep,
    glance,
  }
}
