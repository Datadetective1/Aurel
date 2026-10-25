import { z } from 'zod'
import { mobileContext, json, readJson } from '@/lib/mobile/route'
import { confirmSourceMatch, rejectSourceMatch } from '@/app/(app)/people/research-actions'
import { loadResearchReview } from '@/lib/research/review.server'
import type { SourceDecisionRequest, SourceDecisionResponse } from '@/lib/mobile/contracts'

/**
 * "This is them" or "Not them" for one page research found: the web's own
 * confirm and reject. Confirming is the moment a held page's facts enter the
 * record; rejecting withdraws everything that rested on it alone, and the
 * page is remembered as somebody else so research never offers it again.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> },
) {
  const { id, sourceId } = await params
  const uuid = z.string().uuid()
  if (!uuid.safeParse(id).success || !uuid.safeParse(sourceId).success) {
    return json({ error: 'not_found' }, 404)
  }
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const body = await readJson<SourceDecisionRequest>(request)
  if (body?.decision !== 'confirm' && body?.decision !== 'reject') {
    return json<SourceDecisionResponse>({ ok: false, error: 'Say whether this is them.' }, 400)
  }

  // Only a page research found for this person, on this account.
  const before = await loadResearchReview(ctx.supabase, ctx.user.id, id)
  if (!before?.sources.some((s) => s.id === sourceId)) return json({ error: 'not_found' }, 404)

  const outcome =
    body.decision === 'confirm'
      ? await confirmSourceMatch(sourceId, id)
      : { ...(await rejectSourceMatch(sourceId, id)), factsCreated: 0 }

  const research = await loadResearchReview(ctx.supabase, ctx.user.id, id)
  if (!research) return json({ error: 'not_found' }, 404)
  return json<SourceDecisionResponse>({ ok: true, factsAdded: outcome.factsCreated, research })
}
