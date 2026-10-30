import { z } from 'zod'
import { mobileContext, json } from '@/lib/mobile/route'
import { resolveFace } from '@/lib/conversations/avatars'
import { loadResearchReview } from '@/lib/research/review.server'
import { skipSourcePhoto, saveSourcePhoto } from '@/lib/research/source-images.server'
import { track } from '@/lib/analytics'
import type { SourcePhotoResponse } from '@/lib/mobile/contracts'

type Params = { params: Promise<{ id: string; sourceId: string }> }

async function ids(params: Params['params']) {
  const { id, sourceId } = await params
  const uuid = z.string().uuid()
  return uuid.safeParse(id).success && uuid.safeParse(sourceId).success ? { id, sourceId } : null
}

/**
 * "Use as photo": the picture of a bio or speaker page the user said is them,
 * offered as the person's photo. Only the user's tap sets it; nothing here
 * looks at the face in it.
 */
export async function POST(_request: Request, { params }: Params) {
  const found = await ids(params)
  if (!found) return json({ error: 'not_found' }, 404)
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const result = await saveSourcePhoto(ctx.supabase, ctx.user.id, found.id, found.sourceId)
  if (!result.ok) return json<SourcePhotoResponse>({ ok: false, error: result.error }, 400)
  await track('person_photo_uploaded', { from: 'research_page' })
  const photo = await resolveFace(ctx.supabase, { avatar_path: result.path })
  const research = await loadResearchReview(ctx.supabase, ctx.user.id, found.id)
  if (!research) return json({ error: 'not_found' }, 404)
  return json<SourcePhotoResponse>({ ok: true, photo, research })
}

/** "Skip": that page's picture is not offered for this person again. */
export async function DELETE(_request: Request, { params }: Params) {
  const found = await ids(params)
  if (!found) return json({ error: 'not_found' }, 404)
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const result = await skipSourcePhoto(ctx.supabase, ctx.user.id, found.id, found.sourceId)
  if (!result.ok) return json({ error: 'not_found' }, 404)
  const research = await loadResearchReview(ctx.supabase, ctx.user.id, found.id)
  if (!research) return json({ error: 'not_found' }, 404)
  return json<SourcePhotoResponse>({ ok: true, photo: null, research })
}
