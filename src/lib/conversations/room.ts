import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { resolveFaces } from './avatars'
import type { RoomPerson } from '@/components/app/room-strip'
import { roleLabel } from '@/components/app/room-strip'

type Client = SupabaseClient<Database>

const RELATIONSHIP_LABEL: Record<string, string> = {
  manager: 'Your manager',
  report: 'Your report',
  skip_level: 'Your skip-level',
  peer: 'Peer',
  cross_functional: 'Cross-functional partner',
  customer: 'Customer',
  prospect: 'Prospect',
  vendor: 'Vendor',
  partner: 'Partner',
  candidate: 'Candidate',
  mentor: 'Your mentor',
  external: 'External contact',
  other: 'Colleague',
}

export function relationshipLabel(type: string | null | undefined): string {
  return (type && RELATIONSHIP_LABEL[type]) || 'Colleague'
}

/**
 * The people in a meeting, as the room strip wants them: face, name, role,
 * company, and how they relate to the user. One query, one signing call.
 * Decision makers first, because that is how a room is worked.
 */
export async function loadMeetingRoom(
  supabase: Client,
  userId: string,
  meetingId: string,
): Promise<RoomPerson[]> {
  const { data } = await supabase
    .from('meeting_attendees')
    .select(
      'person_id, role, people(id, full_name, preferred_name, avatar_url, avatar_path, job_title, relationship_type, organizations(name))',
    )
    .eq('user_id', userId)
    .eq('meeting_id', meetingId)

  const rows = (data ?? []).filter((r) => r.people)
  const faces = await resolveFaces(
    supabase,
    rows.map((r) => r.people!),
    (p) => p.id,
  )

  const weight = (role: string | null) =>
    role === 'decision_maker'
      ? 4
      : role === 'influencer'
        ? 3
        : role === 'presenter'
          ? 2
          : role === 'contributor'
            ? 1
            : 0

  return rows
    .sort((a, b) => weight(b.role) - weight(a.role))
    .map((r) => ({
      id: r.people!.id,
      name: r.people!.preferred_name || r.people!.full_name,
      fullName: r.people!.full_name,
      src: faces.get(r.people!.id) ?? null,
      title: r.people!.job_title,
      company: r.people!.organizations?.name ?? null,
      context: roleLabel(r.role) || relationshipLabel(r.people!.relationship_type),
    }))
}

/** The people in a conversation, same shape. */
export async function loadConversationRoom(
  supabase: Client,
  userId: string,
  interactionId: string,
): Promise<RoomPerson[]> {
  const { data } = await supabase
    .from('interaction_participants')
    .select(
      'people(id, full_name, preferred_name, avatar_url, avatar_path, job_title, relationship_type, organizations(name))',
    )
    .eq('user_id', userId)
    .eq('interaction_id', interactionId)

  const rows = (data ?? []).filter((r) => r.people)
  const faces = await resolveFaces(
    supabase,
    rows.map((r) => r.people!),
    (p) => p.id,
  )

  return rows.map((r) => ({
    id: r.people!.id,
    name: r.people!.preferred_name || r.people!.full_name,
    fullName: r.people!.full_name,
    src: faces.get(r.people!.id) ?? null,
    title: r.people!.job_title,
    company: r.people!.organizations?.name ?? null,
    context: relationshipLabel(r.people!.relationship_type),
  }))
}
