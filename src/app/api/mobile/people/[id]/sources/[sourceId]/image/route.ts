import { z } from 'zod'
import { mobileContext, json } from '@/lib/mobile/route'
import { sourceThumbnail } from '@/lib/research/source-images.server'

export const runtime = 'nodejs'

/**
 * The lead image of a page research found for this person, small, for the
 * research card. Through Atturel's server so the phone never tells the
 * publisher who is being looked up. 404 when the page has no usable picture;
 * the app then shows the card without one.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> },
) {
  const { id, sourceId } = await params
  const uuid = z.string().uuid()
  if (!uuid.safeParse(id).success || !uuid.safeParse(sourceId).success) {
    return json({ error: 'not_found' }, 404)
  }
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const picture = await sourceThumbnail(ctx.supabase, ctx.user.id, id, sourceId)
  if (!picture) return json({ error: 'not_found' }, 404)
  return new Response(picture.bytes as BodyInit, {
    headers: {
      'content-type': picture.type,
      'cache-control': 'private, max-age=86400',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  })
}
