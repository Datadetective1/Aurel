import { mobileContext, json } from '@/lib/mobile/route'
import { loadTodayVisual } from '@/lib/visual/today.server'
import { track } from '@/lib/analytics'
import type { TodayResponse } from '@/lib/mobile/contracts'

export async function GET() {
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response
  const now = new Date()
  const today = await loadTodayVisual(ctx.supabase, ctx.user.id, { timeZone: ctx.timeZone, now })

  await track('mobile_today_opened', {
    meetings: today.meetings.length,
    loops: today.loops.length,
    awaiting_review: today.awaitingReview.length,
  })

  const body: TodayResponse = {
    name: ctx.profile.preferred_name || ctx.profile.full_name || 'You',
    timeZone: ctx.timeZone,
    now: now.toISOString(),
    ...today,
  }
  return json(body)
}
