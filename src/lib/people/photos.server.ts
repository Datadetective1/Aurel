import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import {
  AVATAR_BUCKET,
  MAX_AVATAR_BYTES,
  imageExtension,
  personAvatarPath,
  profileAvatarPath,
} from '@/lib/conversations/avatars'
import { logger } from '@/lib/logger'

type Client = SupabaseClient<Database>

/**
 * Photos the user supplies, for a person or for themselves, from the web form
 * and the phone alike. Private bucket, one folder per account, a fixed path so
 * a second upload replaces the first. The row keeps the path; URLs are signed
 * when shown. Nothing here fetches a likeness from anywhere.
 */

export type PhotoOutcome = { ok: true; path: string | null } | { ok: false; error: string }

/** What arrived as a photo: a File from a form, or a Blob with a type. */
export interface PhotoFile {
  size: number
  type: string
}

function check(file: PhotoFile): { ok: true; extension: string } | { ok: false; error: string } {
  if (file.size === 0) return { ok: false, error: 'Choose an image first.' }
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, error: 'That image is larger than 2 MB. Choose a smaller one.' }
  }
  const extension = imageExtension(file.type)
  if (!extension) return { ok: false, error: 'Use a JPEG, PNG or WebP image.' }
  return { ok: true, extension }
}

async function store(
  supabase: Client,
  path: string,
  previous: string | null,
  file: PhotoFile & Blob,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' })
  if (error) {
    logger.warn('photo.upload_failed', { message: error.message })
    return { ok: false, error: 'The photo could not be uploaded. Try again.' }
  }
  // A previous photo with a different extension is orphaned otherwise.
  if (previous && previous !== path) {
    await supabase.storage.from(AVATAR_BUCKET).remove([previous])
  }
  return { ok: true }
}

/** Only an active person: a photo is new work, and an archived person is out of it. */
export async function savePersonPhoto(
  supabase: Client,
  userId: string,
  personId: string,
  file: PhotoFile & Blob,
): Promise<PhotoOutcome> {
  const checked = check(file)
  if (!checked.ok) return checked

  const { data: person } = await supabase
    .from('people')
    .select('id, avatar_path, archived_at')
    .eq('id', personId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!person) return { ok: false, error: 'That person could not be found.' }
  if (person.archived_at) return { ok: false, error: 'Restore them first to change their photo.' }

  const path = personAvatarPath(userId, personId, checked.extension)
  const stored = await store(supabase, path, person.avatar_path, file)
  if (!stored.ok) return stored

  const { error } = await supabase
    .from('people')
    .update({ avatar_path: path })
    .eq('id', personId)
    .eq('user_id', userId)
  if (error) return { ok: false, error: 'The photo was uploaded but could not be attached.' }
  return { ok: true, path }
}

export async function clearPersonPhoto(
  supabase: Client,
  userId: string,
  personId: string,
): Promise<PhotoOutcome> {
  const { data: person } = await supabase
    .from('people')
    .select('id, avatar_path')
    .eq('id', personId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!person) return { ok: false, error: 'That person could not be found.' }

  if (person.avatar_path) await supabase.storage.from(AVATAR_BUCKET).remove([person.avatar_path])
  await supabase
    .from('people')
    .update({ avatar_path: null, avatar_url: null })
    .eq('id', personId)
    .eq('user_id', userId)
  return { ok: true, path: null }
}

/**
 * The user's own photo. Shown only to them for now: there is no public
 * profile or member discovery (deferred by the owner, 24 Oct 2026).
 */
export async function saveProfilePhoto(
  supabase: Client,
  userId: string,
  file: PhotoFile & Blob,
): Promise<PhotoOutcome> {
  const checked = check(file)
  if (!checked.ok) return checked

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, avatar_path')
    .eq('id', userId)
    .maybeSingle()
  if (!profile) return { ok: false, error: 'Your profile could not be found.' }

  const path = profileAvatarPath(userId, checked.extension)
  const stored = await store(supabase, path, profile.avatar_path, file)
  if (!stored.ok) return stored

  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId)
  if (error) return { ok: false, error: 'The photo was uploaded but could not be saved.' }
  return { ok: true, path }
}

export async function clearProfilePhoto(supabase: Client, userId: string): Promise<PhotoOutcome> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, avatar_path')
    .eq('id', userId)
    .maybeSingle()
  if (!profile) return { ok: false, error: 'Your profile could not be found.' }

  if (profile.avatar_path) await supabase.storage.from(AVATAR_BUCKET).remove([profile.avatar_path])
  await supabase.from('profiles').update({ avatar_path: null, avatar_url: null }).eq('id', userId)
  return { ok: true, path: null }
}
