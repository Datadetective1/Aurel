import { z } from 'zod'
import { mobileContext, json } from '@/lib/mobile/route'
import { listLoops } from '@/lib/conversations/queries'
import { loadConnections } from '@/lib/visual/atlas.server'
import { PERSON_COLUMNS, toVisualPeople, type PersonRow } from '@/lib/visual/people.server'
import { warmPaths } from '@/lib/visual/warm-path'
import type { WarmPathResponse } from '@/lib/mobile/contracts'

/**
 * Who in the user's own record could introduce them to this person: people
 * they have spoken with who share something on record with them. Read from
 * the same evidence as the Atlas, never inferred.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'not_found' }, 404)
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const { data } = await ctx.supabase
    .from('people')
    .select(PERSON_COLUMNS)
    .eq('user_id', ctx.user.id)
    .is('archived_at', null)
    .limit(500)
  const rows = (data ?? []) as PersonRow[]
  const target = rows.find((p) => p.id === id)
  if (!target) return json({ error: 'not_found' }, 404)

  const now = new Date()
  const connections = await loadConnections(ctx.supabase, ctx.user.id, rows)
  const paths = warmPaths(
    id,
    connections,
    rows.map((p) => ({
      id: p.id,
      relevance: p.relevance,
      lastInteractionAt: p.last_interaction_at,
    })),
    now,
  )

  const introducers = rows.filter((p) => paths.some((w) => w.introducerId === p.id))
  const loops = introducers.length
    ? await listLoops(ctx.supabase, ctx.user.id, { scope: 'active', timeZone: ctx.timeZone, now })
    : []
  const visual = await toVisualPeople(ctx.supabase, introducers, loops)

  return json<WarmPathResponse>({
    target: { id: target.id, name: target.preferred_name || target.full_name },
    paths: paths.flatMap((w) => {
      const person = visual.get(w.introducerId)
      return person ? [{ ...w, person }] : []
    }),
  })
}
