import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { safeFetch } from '@/lib/sources/fetch'
import { isRestrictedPhotoHost, pageImageCandidates } from './candidates'

type Client = SupabaseClient<Database>

/**
 * PHOTO SUGGESTIONS
 * =============================================================================
 * UPLOAD -> SUGGEST -> CONFIRM -> FALLBACK. See migration 0020.
 *
 * The rules this module exists to keep:
 *
 *   - A suggestion is only ever drawn from a page ALREADY confirmed to be
 *     about this person (`source_person_links.identity_match_status =
 *     'confirmed'`). Identity is established by the user's own review of the
 *     source, never by what a face looks like.
 *   - Restricted platforms are never fetched: LinkedIn, Facebook, Instagram,
 *     X/Twitter, TikTok, Threads and similar. The fetcher honours HTTP errors,
 *     logins and paywalls as outcomes, and never works around them.
 *   - Nothing is assigned. A candidate becomes a `suggested` row; only the
 *     user's confirm makes it the face. A rejected candidate is remembered and
 *     never offered again.
 *   - No portrait is ever generated.
 *
 * Providers sit behind one interface so a licensed image source can be added
 * later without touching the trust model. The only provider shipped reads
 * confirmed source pages; it needs no credential.
 * =============================================================================
 */

export interface PhotoCandidate {
  imageUrl: string
  sourceUrl: string
  sourceLabel: string | null
  sourceId: string | null
  provider: string
}

export interface PhotoProviderInput {
  personId: string
  fullName: string
  confirmedSources: { id: string; url: string; label: string | null }[]
}

export interface PhotoCandidateProvider {
  id: string
  find(input: PhotoProviderInput): Promise<PhotoCandidate[]>
}

/** Reads the declared share image of pages the user already confirmed are about this person. */
export const confirmedSourcePageProvider: PhotoCandidateProvider = {
  id: 'confirmed_source_page',
  async find(input) {
    const out: PhotoCandidate[] = []
    for (const source of input.confirmedSources.slice(0, 4)) {
      if (isRestrictedPhotoHost(source.url)) continue
      const page = await safeFetch(source.url, {
        allowHost: (host) => !isRestrictedPhotoHost(`https://${host}/`),
      })
      if (!page.ok || !page.contentType.includes('html')) continue
      for (const imageUrl of pageImageCandidates(page.body.slice(0, 300_000), page.finalUrl)) {
        if (isRestrictedPhotoHost(imageUrl)) continue
        out.push({
          imageUrl,
          sourceUrl: page.finalUrl,
          sourceLabel: source.label,
          sourceId: source.id,
          provider: 'confirmed_source_page',
        })
      }
      if (out.length >= 3) break
    }
    return out
  },
}

export const PHOTO_PROVIDERS: PhotoCandidateProvider[] = [confirmedSourcePageProvider]

// --- storage ----------------------------------------------------------------

export interface PhotoSuggestionRow {
  id: string
  person_id: string
  image_url: string
  source_url: string
  source_label: string | null
  source_id: string | null
  provider: string
  storage_path: string | null
  status: 'suggested' | 'confirmed' | 'rejected'
  created_at: string
}

/**
 * The table is not in the generated types until migration 0020 is applied
 * and types are regenerated, so it is reached through an untyped handle.
 */
export function suggestionsTable(supabase: Client) {
  return (supabase as unknown as SupabaseClient).from('person_photo_suggestions')
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /person_photo_suggestions/.test(error.message ?? '')
  )
}

/** Whether the suggestion flow can run here: the migration has been applied. */
export async function photoSuggestionsAvailable(supabase: Client): Promise<boolean> {
  const { error } = await suggestionsTable(supabase)
    .select('id', { head: true, count: 'exact' })
    .limit(1)
  if (isMissingTable(error)) return false
  return !error
}

/** The oldest pending suggestion for a person, or null -- including when the table is absent. */
export async function pendingSuggestion(
  supabase: Client,
  userId: string,
  personId: string,
): Promise<PhotoSuggestionRow | null> {
  const { data, error } = await suggestionsTable(supabase)
    .select(
      'id, person_id, image_url, source_url, source_label, source_id, provider, storage_path, status, created_at',
    )
    .eq('user_id', userId)
    .eq('person_id', personId)
    .eq('status', 'suggested')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) return null
  return (data as PhotoSuggestionRow | null) ?? null
}

/** Image URLs already decided for this person, so a refusal is never re-offered. */
export async function decidedImageUrls(
  supabase: Client,
  userId: string,
  personId: string,
): Promise<Set<string>> {
  const { data } = await suggestionsTable(supabase)
    .select('image_url')
    .eq('user_id', userId)
    .eq('person_id', personId)
  return new Set(((data ?? []) as { image_url: string }[]).map((r) => r.image_url))
}

export function suggestionStoragePath(
  userId: string,
  personId: string,
  suggestionId: string,
  ext: string,
) {
  return `${userId}/suggestions/${personId}/${suggestionId}.${ext}`
}
