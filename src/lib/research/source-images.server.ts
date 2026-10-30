import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { MAX_AVATAR_BYTES, imageExtension } from '@/lib/conversations/avatars'
import { isRestrictedPhotoHost } from '@/lib/photos/candidates'
import { savePersonPhoto } from '@/lib/people/photos.server'
import { safeFetchImage } from '@/lib/sources/fetch'
import { offersPhoto, sourceImageUrl, withPhotoSkipped } from './source-images'
import { reviewState } from './review'

type Client = SupabaseClient<Database>

/**
 * Pictures of research pages, fetched by Atturel's server and never by the
 * phone, so a publisher learns nothing about who the user is looking up --
 * the same reason company logos come through Atturel. Fetched with research's
 * own SSRF-hardened fetcher, raster only, bytes checked against their type.
 */

/** Thumbnails are small; a lead image larger than this is not worth the phone's data. */
const THUMBNAIL_MAX_BYTES = 600 * 1024

type Picture = { bytes: Uint8Array; type: string }
const CACHE = new Map<string, { at: number; picture: Picture | null }>()
const TTL_MS = 6 * 60 * 60 * 1000
const MAX_ENTRIES = 200

const allowHost = (host: string) => !isRestrictedPhotoHost(`https://${host}/`)

async function fetchPicture(url: string, maxBytes: number): Promise<Picture | null> {
  const image = await safeFetchImage(url, maxBytes, allowHost)
  if (!image.ok || !imageExtension(image.contentType)) return null
  return { bytes: image.bytes, type: image.contentType }
}

/** This account's link between the person and the page, with what the page holds. */
async function loadLink(supabase: Client, userId: string, personId: string, sourceId: string) {
  const { data } = await supabase
    .from('source_person_links')
    .select(
      'identity_match_status, reviewed_by_user, sources(id, source_type, access_status, metadata)',
    )
    .eq('user_id', userId)
    .eq('person_id', personId)
    .eq('source_id', sourceId)
    .maybeSingle()
  return data?.sources ? { link: data, source: data.sources } : null
}

/** The page's picture, for a page found for this person on this account; null when there is none. */
export async function sourceThumbnail(
  supabase: Client,
  userId: string,
  personId: string,
  sourceId: string,
): Promise<Picture | null> {
  const found = await loadLink(supabase, userId, personId, sourceId)
  const url = found ? sourceImageUrl(found.source.metadata) : null
  if (!url) return null

  const hit = CACHE.get(url)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.picture
  const picture = await fetchPicture(url, THUMBNAIL_MAX_BYTES)
  if (CACHE.size >= MAX_ENTRIES) {
    const oldest = CACHE.keys().next().value
    if (oldest) CACHE.delete(oldest)
  }
  CACHE.set(url, { at: Date.now(), picture })
  return picture
}

export type SourcePhotoOutcome = { ok: true; path: string | null } | { ok: false; error: string }

/**
 * "Use as photo": the page's picture, copied once into the person's photo in
 * Atturel's private storage. Only when the page is still offered: confirmed
 * by the user as them, a bio or speaker page, and the person has no photo.
 */
export async function saveSourcePhoto(
  supabase: Client,
  userId: string,
  personId: string,
  sourceId: string,
): Promise<SourcePhotoOutcome> {
  const found = await loadLink(supabase, userId, personId, sourceId)
  const { data: person } = await supabase
    .from('people')
    .select('id, avatar_path, avatar_url')
    .eq('user_id', userId)
    .eq('id', personId)
    .is('archived_at', null)
    .maybeSingle()
  if (!found || !person) return { ok: false, error: 'That page could not be found.' }

  const state = reviewState({
    status: found.link.identity_match_status,
    reviewed: found.link.reviewed_by_user,
    accessStatus: found.source.access_status,
  })
  const offered =
    state !== null &&
    offersPhoto({
      state,
      reviewed: found.link.reviewed_by_user,
      sourceType: found.source.source_type,
      metadata: found.source.metadata,
      personId,
      personHasPhoto: Boolean(person.avatar_path || person.avatar_url),
    })
  const url = sourceImageUrl(found.source.metadata)
  if (!offered || !url) return { ok: false, error: 'That photo is no longer offered.' }

  const picture = await fetchPicture(url, MAX_AVATAR_BYTES)
  if (!picture) return { ok: false, error: 'That picture could not be loaded. Upload one instead.' }
  const file = new Blob([picture.bytes as BlobPart], { type: picture.type })
  return savePersonPhoto(supabase, userId, personId, file)
}

/** "Skip": this page's picture is not offered for this person again. */
export async function skipSourcePhoto(
  supabase: Client,
  userId: string,
  personId: string,
  sourceId: string,
): Promise<{ ok: boolean }> {
  const found = await loadLink(supabase, userId, personId, sourceId)
  if (!found) return { ok: false }
  const { error } = await supabase
    .from('sources')
    .update({ metadata: withPhotoSkipped(found.source.metadata, personId) as never })
    .eq('id', sourceId)
    .eq('user_id', userId)
  return { ok: !error }
}
