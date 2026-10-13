import { mobileContext, json, planRequired } from '@/lib/mobile/route'
import { checkCapability } from '@/lib/billing/entitlements'
import { resolveFaces } from '@/lib/conversations/avatars'
import { listLoops } from '@/lib/conversations/queries'
import { relationshipLabel } from '@/lib/conversations/room'
import { loadAtlasConnections } from '@/lib/visual/atlas.server'
import { actionDirection } from '@/lib/visual/relationship-actions'
import type { AtlasResponse, VisualPerson } from '@/lib/mobile/contracts'

/**
 * The Atlas for the phone: people by organisation, the connections the record
 * verifiably holds, and the important relationships going quiet. The same
 * evidence query as the web Atlas.
 */
export async function GET() {
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const access = await checkCapability('relationshipAtlas')
  if (!access.allowed) return planRequired(access.message)

  const [{ data: people }, loops] = await Promise.all([
    ctx.supabase
      .from('people')
      .select(
        'id, full_name, preferred_name, job_title, relevance, relationship_type, last_interaction_at, avatar_url, avatar_path, organization_id, organizations(name, domain)',
      )
      .eq('user_id', ctx.user.id)
      .is('archived_at', null)
      .order('relevance', { ascending: false })
      .limit(300),
    listLoops(ctx.supabase, ctx.user.id, { scope: 'active', timeZone: ctx.timeZone }),
  ])
  const list = people ?? []
  const [faces, connections] = await Promise.all([
    resolveFaces(ctx.supabase, list, (p) => p.id),
    loadAtlasConnections(ctx.supabase, ctx.user.id, list),
  ])

  const visual = (p: (typeof list)[number]): VisualPerson => {
    const mine = loops.filter((l) => l.personId === p.id)
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
      owe: mine.filter((l) => actionDirection(l) === 'owe').length,
    }
  }

  const byOrg = new Map<string, { name: string; domain: string | null; people: VisualPerson[] }>()
  const unaffiliated: VisualPerson[] = []
  for (const p of list) {
    if (!p.organization_id || !p.organizations) {
      unaffiliated.push(visual(p))
      continue
    }
    const bucket = byOrg.get(p.organization_id) ?? {
      name: p.organizations.name,
      domain: p.organizations.domain,
      people: [],
    }
    bucket.people.push(visual(p))
    byOrg.set(p.organization_id, bucket)
  }

  const cutoff = Date.now() - 30 * 86_400_000
  const body: AtlasResponse = {
    timeZone: ctx.timeZone,
    organizations: [...byOrg.values()].sort((a, b) => b.people.length - a.people.length),
    unaffiliated,
    connections,
    goingQuiet: list
      .filter(
        (p) =>
          p.relevance >= 4 &&
          (!p.last_interaction_at || new Date(p.last_interaction_at).getTime() < cutoff),
      )
      .slice(0, 8)
      .map(visual),
  }
  return json(body)
}
