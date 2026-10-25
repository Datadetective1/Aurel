import { getOptionalUser } from '@/lib/auth'
import { json } from '@/lib/mobile/route'
import { bearerToken, createClient } from '@/lib/supabase/server'
import { resolveFace } from '@/lib/conversations/avatars'
import { clearProfilePhoto, saveProfilePhoto } from '@/lib/people/photos.server'
import { track } from '@/lib/analytics'
import type { PhotoResponse } from '@/lib/mobile/contracts'

/** The user's own photo, shown only to them. Multipart, one `photo` field. */
export async function POST(request: Request) {
  if (!(await bearerToken())) return json({ error: 'unauthenticated' }, 401)
  const user = await getOptionalUser()
  if (!user) return json({ error: 'unauthenticated' }, 401)

  let file: FormDataEntryValue | null = null
  try {
    file = (await request.formData()).get('photo')
  } catch {
    file = null
  }
  if (!(file instanceof Blob)) {
    return json<PhotoResponse>({ ok: false, error: 'Choose an image first.' }, 400)
  }

  const supabase = await createClient()
  const result = await saveProfilePhoto(supabase, user.id, file)
  if (!result.ok) return json<PhotoResponse>({ ok: false, error: result.error }, 400)
  await track('profile_photo_uploaded')
  return json<PhotoResponse>({
    ok: true,
    photo: await resolveFace(supabase, { avatar_path: result.path }),
  })
}

export async function DELETE() {
  if (!(await bearerToken())) return json({ error: 'unauthenticated' }, 401)
  const user = await getOptionalUser()
  if (!user) return json({ error: 'unauthenticated' }, 401)

  const result = await clearProfilePhoto(await createClient(), user.id)
  if (!result.ok) return json<PhotoResponse>({ ok: false, error: result.error }, 404)
  return json<PhotoResponse>({ ok: true, photo: null })
}
