import { mobileContext, json } from '@/lib/mobile/route'
import { listLoops } from '@/lib/conversations/queries'
import { toVisualLoop } from '@/lib/visual/meeting.server'
import { arrangeOwed, needsNudge, readFreshness } from '@/lib/visual/owed'
import type { OwedLoop, OwedResponse } from '@/lib/mobile/contracts'

/**
 * Everything owed, both ways: what the user promised, what they were promised,
 * and what is still open between them, across every conversation and
 * meeting. Each loop carries how close it is to going stale, so the app can
 * raise it while it can still be kept.
 */
export async function GET() {
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const now = new Date()
  const loops = await listLoops(ctx.supabase, ctx.user.id, {
    scope: 'active',
    timeZone: ctx.timeZone,
    now,
    excludeArchivedPeople: true,
  })

  const read: OwedLoop[] = loops.map((loop) => ({
    ...toVisualLoop(loop, ctx.timeZone, now),
    createdAt: loop.createdAt,
    from: loop.interactionTitle,
    ...readFreshness(loop, ctx.timeZone, now),
  }))
  const sides = arrangeOwed(read)

  const body: OwedResponse = {
    timeZone: ctx.timeZone,
    now: now.toISOString(),
    ...sides,
    nudges: read.filter((l) => l.direction !== 'completed' && needsNudge(l.freshness)).length,
  }
  return json(body)
}
