import { mobileContext, json } from '@/lib/mobile/route'
import { resolveFaces } from '@/lib/conversations/avatars'
import { listLoops } from '@/lib/conversations/queries'
import { relationshipLabel } from '@/lib/conversations/room'
import { actionDirection } from '@/lib/visual/relationship-actions'
import type { PeopleResponse } from '@/lib/mobile/contracts'

/** Everyone on record, most recently spoken to first, with faces and what is open. */
export async function GET() {
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const [{ data: people }, loops] = await Promise.all([
    ctx.supabase
      .from('people')
      .select(
        'id, full_name, preferred_name, avatar_url, avatar_path, job_title, relationship_type, last_interaction_at, organizations(name, domain)',
      )
      .eq('user_id', ctx.user.id)
      .is('archived_at', null)
      .order('last_interaction_at', { ascending: false, nullsFirst: false })
      .limit(300),
    listLoops(ctx.supabase, ctx.user.id, { scope: 'active', timeZone: ctx.timeZone }),
  ])

  const faces = await resolveFaces(ctx.supabase, people ?? [], (p) => p.id)

  const body: PeopleResponse = {
    timeZone: ctx.timeZone,
    people: (people ?? []).map((p) => {
      const mine = loops.filter((l) => l.personId === p.id)
      const label = relationshipLabel(p.relationship_type)
      return {
        id: p.id,
        name: p.preferred_name || p.full_name,
        fullName: p.full_name,
        src: faces.get(p.id) ?? null,
        title: p.job_title,
        company: p.organizations?.name ?? null,
        companyDomain: p.organizations?.domain ?? null,
        context: label,
        relationshipLabel: label,
        lastInteractionAt: p.last_interaction_at,
        openLoops: mine.length,
        owe: mine.filter((l) => actionDirection(l) === 'owe').length,
      }
    }),
  }
  return json(body)
}
