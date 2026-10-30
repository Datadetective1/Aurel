import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { resolveFaces } from '@/lib/conversations/avatars'
import { relationshipLabel } from '@/lib/conversations/room'
import { actionDirection } from './relationship-actions'
import type { LoopRecord } from '@/lib/conversations/queries'
import type { VisualPerson } from './types'

type Client = SupabaseClient<Database>

/** The columns a person row needs to become a VisualPerson. */
export const PERSON_COLUMNS =
  'id, full_name, preferred_name, job_title, relevance, relationship_type, last_interaction_at, created_at, avatar_url, avatar_path, is_demo, organization_id, organizations(name, domain)'

export interface PersonRow {
  id: string
  full_name: string
  preferred_name: string | null
  job_title: string | null
  relevance: number
  relationship_type: string
  last_interaction_at: string | null
  created_at: string
  avatar_url: string | null
  avatar_path: string | null
  is_demo: boolean
  organization_id: string | null
  organizations: { name: string; domain: string | null } | null
}

/** People rows as the app draws them, with faces signed and loops counted. */
export async function toVisualPeople(
  supabase: Client,
  rows: PersonRow[],
  loops: LoopRecord[],
): Promise<Map<string, VisualPerson>> {
  const faces = await resolveFaces(supabase, rows, (p) => p.id)
  const out = new Map<string, VisualPerson>()
  for (const p of rows) {
    const mine = loops.filter((l) => l.personId === p.id)
    out.set(p.id, {
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
      owe: mine.filter((l) => actionDirection(l) === 'owe').length,
      isDemo: p.is_demo,
    })
  }
  return out
}
