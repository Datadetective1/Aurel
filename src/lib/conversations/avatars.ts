import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type Client = SupabaseClient<Database>

/**
 * FACES
 * =============================================================================
 * Photos live in a private bucket, one folder per user, and are signed at
 * render time. The URL is never stored: it expires, and a stored one would be
 * a stale link on every page that shows the person.
 *
 * `avatar_path` is the uploaded photo. `avatar_url` is an external image the
 * user pasted, kept for the rare case somebody has one. Uploaded wins.
 *
 * Signing is batched per page. Signing one at a time turns a list of twelve
 * people into twelve round trips to storage.
 * =============================================================================
 */

export const AVATAR_BUCKET = 'avatars'

/** An hour. Long enough to survive a page being left open, short enough to expire. */
const SIGNED_URL_SECONDS = 60 * 60

export interface FaceSource {
  avatar_path?: string | null
  avatar_url?: string | null
}

/**
 * Resolve display URLs for a set of people in one storage call.
 *
 * Returns a map keyed by whatever key the caller supplies -- a person id, a
 * profile id -- so the result can be looked up without re-deriving the path.
 */
export async function resolveFaces<T extends FaceSource>(
  supabase: Client,
  rows: T[],
  keyOf: (row: T) => string,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>()
  const paths: string[] = []
  const keysByPath = new Map<string, string[]>()

  for (const row of rows) {
    const key = keyOf(row)
    if (row.avatar_path) {
      paths.push(row.avatar_path)
      keysByPath.set(row.avatar_path, [...(keysByPath.get(row.avatar_path) ?? []), key])
      result.set(key, null)
    } else {
      result.set(key, row.avatar_url ?? null)
    }
  }

  if (paths.length === 0) return result

  const unique = [...new Set(paths)]
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_SECONDS)

  // A signing failure is a missing photo, not a missing page. The initials
  // fallback renders and the record is unaffected.
  if (error || !data) return result

  for (const signed of data) {
    if (!signed.path || signed.error || !signed.signedUrl) continue
    for (const key of keysByPath.get(signed.path) ?? []) {
      result.set(key, signed.signedUrl)
    }
  }

  return result
}

/** One person's face, for pages that show exactly one. */
export async function resolveFace(supabase: Client, row: FaceSource): Promise<string | null> {
  const faces = await resolveFaces(supabase, [row], () => 'self')
  return faces.get('self') ?? null
}

/** Storage path for a person's photo. Deterministic, so a re-upload replaces. */
export function personAvatarPath(userId: string, personId: string, extension: string): string {
  return `${userId}/people/${personId}.${extension}`
}

export function profileAvatarPath(userId: string, extension: string): string {
  return `${userId}/profile.${extension}`
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** The extension for an accepted image type, or null for anything else. */
export function imageExtension(mimeType: string): string | null {
  return IMAGE_EXTENSIONS[mimeType.split(';')[0]?.trim().toLowerCase() ?? ''] ?? null
}

/** Matches the bucket's own limit, so the user hears it before the upload. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024
