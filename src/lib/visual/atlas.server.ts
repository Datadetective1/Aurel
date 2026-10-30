import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { describeConnection, findConnections, type Connection } from './commonality'
import type { VisualConnection } from './types'

type Client = SupabaseClient<Database>

type AtlasPerson = {
  id: string
  organization_id: string | null
  organizations: { name: string } | null
}

/**
 * Every connection the record holds at both ends, same-organisation pairs
 * included: the raw evidence the Atlas and the warm path both read.
 */
export async function loadConnections(
  supabase: Client,
  userId: string,
  people: AtlasPerson[],
): Promise<Connection[]> {
  const [{ data: facts }, { data: attendance }, { data: participation }] = await Promise.all([
    supabase
      .from('professional_facts')
      .select('person_id, kind, value, evidence_level')
      .eq('user_id', userId)
      .in('kind', ['prior_role', 'education'])
      .in('evidence_level', ['confirmed', 'observed'])
      .limit(2000),
    supabase
      .from('meeting_attendees')
      .select('meeting_id, person_id')
      .eq('user_id', userId)
      .limit(3000),
    supabase
      .from('interaction_participants')
      .select('interaction_id, person_id')
      .eq('user_id', userId)
      .limit(3000),
  ])

  const group = (rows: { key: string; person_id: string }[]) => {
    const map = new Map<string, string[]>()
    for (const r of rows) map.set(r.key, [...(map.get(r.key) ?? []), r.person_id])
    return [...map.entries()].map(([id, personIds]) => ({ id, personIds }))
  }

  return findConnections({
    people: people.map((p) => ({
      id: p.id,
      organizationId: p.organization_id,
      organizationName: p.organizations?.name ?? null,
    })),
    facts: (facts ?? []).map((f) => ({
      personId: f.person_id,
      kind: f.kind,
      value: f.value,
      evidence: f.evidence_level,
    })),
    meetings: group((attendance ?? []).map((r) => ({ key: r.meeting_id, person_id: r.person_id }))),
    conversations: group(
      (participation ?? []).map((r) => ({ key: r.interaction_id, person_id: r.person_id })),
    ),
  })
}

/**
 * Connections on record across everyone the user tracks: the evidence query
 * the web Atlas and the app's Atlas share. Same-organisation pairs are left
 * out because both surfaces already group people by organisation.
 */
export async function loadAtlasConnections(
  supabase: Client,
  userId: string,
  people: AtlasPerson[],
  limit = 12,
): Promise<VisualConnection[]> {
  const order = ['shared_conversation', 'shared_meeting', 'former_employer', 'education']
  return (await loadConnections(supabase, userId, people))
    .filter((c) => c.kind !== 'same_organization')
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.count - a.count)
    .slice(0, limit)
    .map((c) => ({ ...c, description: describeConnection(c) }))
}
