import { z } from 'zod'
import { mobileContext, json } from '@/lib/mobile/route'
import { resolveFace } from '@/lib/conversations/avatars'
import { clearPersonPhoto, savePersonPhoto } from '@/lib/people/photos.server'
import { track } from '@/lib/analytics'
import type { PhotoResponse } from '@/lib/mobile/contracts'

/** A photo chosen on the phone (multipart, one `photo` field). Same rules as the web. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'not_found' }, 404)
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  let file: FormDataEntryValue | null = null
  try {
    file = (await request.formData()).get('photo')
  } catch {
    file = null
  }
  if (!(file instanceof Blob)) {
    return json<PhotoResponse>({ ok: false, error: 'Choose an image first.' }, 400)
  }

  const result = await savePersonPhoto(ctx.supabase, ctx.user.id, id, file)
  if (!result.ok) {
    const status = result.error === 'That person could not be found.' ? 404 : 400
    return json<PhotoResponse>({ ok: false, error: result.error }, status)
  }
  await track('person_photo_uploaded', {
    bytesBucket: file.size < 300_000 ? '<300kb' : '300kb-2mb',
  })
  const photo = await resolveFace(ctx.supabase, { avatar_path: result.path })
  return json<PhotoResponse>({ ok: true, photo })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'not_found' }, 404)
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const result = await clearPersonPhoto(ctx.supabase, ctx.user.id, id)
  if (!result.ok) return json<PhotoResponse>({ ok: false, error: result.error }, 404)
  return json<PhotoResponse>({ ok: true, photo: null })
}
