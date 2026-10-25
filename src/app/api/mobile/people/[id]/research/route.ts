import { z } from 'zod'
import { mobileContext, json, planRequired } from '@/lib/mobile/route'
import { researchPerson } from '@/app/(app)/people/research-actions'
import { loadResearchReview } from '@/lib/research/review.server'
import type { RunResearchResponse } from '@/lib/mobile/contracts'

/**
 * A research run reads several pages and waits on a search provider. The
 * web's run takes up to about a minute; this leaves room for a slow one.
 */
export const maxDuration = 120

/**
 * PUBLIC RESEARCH, FROM THE APP
 * =============================================================================
 * GET reads what research has found for this person, and never searches.
 * POST searches -- only because the user pressed the button that says so --
 * through the web's own research run, with one difference: every page that
 * may be about them is held for review. Nothing reaches their record until
 * the user says a page is them (`../sources/:sourceId`).
 * =============================================================================
 */

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'not_found' }, 404)
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const review = await loadResearchReview(ctx.supabase, ctx.user.id, id)
  return review ? json(review) : json({ error: 'not_found' }, 404)
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'not_found' }, 404)
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const before = await loadResearchReview(ctx.supabase, ctx.user.id, id)
  if (!before) return json({ error: 'not_found' }, 404)

  const result = await researchPerson(id, { holdForReview: true })

  // The plan's answer, not a failure: the app shows it as the plan's state,
  // with no way to buy from inside the app.
  if (result.upgrade) return planRequired(result.error ?? 'Research is not part of this plan.')
  // Refused before anything ran: a quota, an archived person, an outage.
  if (!('ok' in result)) {
    return json({ error: result.error ?? 'Research did not complete. Try again.' }, 422)
  }

  const review = await loadResearchReview(ctx.supabase, ctx.user.id, id)
  if (!review) return json({ error: 'not_found' }, 404)
  const body: RunResearchResponse = {
    ...review,
    outcome: {
      ok: result.ok === true,
      message: result.ok ? (result.message ?? null) : (result.error ?? null),
      missing: result.identity?.missing ?? null,
    },
  }
  return json(body)
}
