'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'
import { ownership } from '@/lib/workspace'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import { safeFetchImage } from '@/lib/sources/fetch'
import { AVATAR_BUCKET, imageExtension, MAX_AVATAR_BYTES } from '@/lib/conversations/avatars'
import {
  PHOTO_PROVIDERS,
  decidedImageUrls,
  photoSuggestionsAvailable,
  suggestionStoragePath,
  suggestionsTable,
  type PhotoSuggestionRow,
} from '@/lib/photos/suggestions'
import { isRestrictedPhotoHost } from '@/lib/photos/candidates'

/**
 * PHOTO SUGGESTION ACTIONS
 * =============================================================================
 * Find, confirm, reject. Every one re-establishes the user and filters by
 * user_id on top of row level security, like every other action.
 *
 * A candidate image is copied into the user's private folder the moment it is
 * found, so reviewing it never hotlinks a third party -- the browser shows a
 * signed URL from Atturel's own bucket. Confirm moves that private copy to
 * the person's photo path. Reject deletes it and keeps the row, so the same
 * image is never offered for this person again.
 * =============================================================================
 */

export interface PhotoActionState {
  error?: string
  message?: string
}

const idSchema = z.string().uuid()

export async function findPublicPhoto(
  _prev: PhotoActionState,
  formData: FormData,
): Promise<PhotoActionState> {
  const personId = idSchema.safeParse(formData.get('personId'))
  if (!personId.success) return { error: 'That person could not be found.' }

  const user = await requireUser()
  const supabase = await createClient()
  if (!(await photoSuggestionsAvailable(supabase))) {
    return { error: 'Photo suggestions are not switched on yet.' }
  }

  const { data: person } = await supabase
    .from('people')
    .select('id, full_name')
    .eq('id', personId.data)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!person) return { error: 'That person could not be found.' }

  // Identity comes from the user's own review of a source, never from a face.
  const { data: links } = await supabase
    .from('source_person_links')
    .select('sources(id, source_url, source_title, publisher)')
    .eq('user_id', user.id)
    .eq('person_id', person.id)
    .eq('identity_match_status', 'confirmed')
    .limit(8)

  const confirmedSources = (links ?? [])
    .map((l) => l.sources)
    .filter((s): s is NonNullable<typeof s> => Boolean(s?.source_url))
    .map((s) => ({ id: s.id, url: s.source_url!, label: s.publisher ?? s.source_title ?? null }))

  if (confirmedSources.length === 0) {
    return {
      error: 'There is no confirmed source about this person to look in. Upload a photo instead.',
    }
  }

  const decided = await decidedImageUrls(supabase, user.id, person.id)
  const own = await ownership()

  for (const provider of PHOTO_PROVIDERS) {
    const candidates = await provider.find({
      personId: person.id,
      fullName: person.full_name,
      confirmedSources,
    })

    for (const candidate of candidates) {
      if (decided.has(candidate.imageUrl)) continue

      const image = await safeFetchImage(
        candidate.imageUrl,
        MAX_AVATAR_BYTES,
        (host) => !isRestrictedPhotoHost(`https://${host}/`),
      )
      if (!image.ok) continue
      const ext = imageExtension(image.contentType)
      if (!ext) continue

      const { data: row, error } = await suggestionsTable(supabase)
        .insert({
          ...own,
          person_id: person.id,
          image_url: candidate.imageUrl,
          source_url: candidate.sourceUrl,
          source_label: candidate.sourceLabel,
          source_id: candidate.sourceId,
          provider: candidate.provider,
        })
        .select('id')
        .single()
      if (error || !row) continue

      const path = suggestionStoragePath(user.id, person.id, (row as { id: string }).id, ext)
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, image.bytes, { contentType: image.contentType, upsert: true })
      if (uploadError) {
        await suggestionsTable(supabase)
          .delete()
          .eq('id', (row as { id: string }).id)
          .eq('user_id', user.id)
        continue
      }
      const { error: pathError } = await suggestionsTable(supabase)
        .update({ storage_path: path })
        .eq('id', (row as { id: string }).id)
        .eq('user_id', user.id)
      if (pathError) {
        await supabase.storage.from(AVATAR_BUCKET).remove([path])
        await suggestionsTable(supabase)
          .delete()
          .eq('id', (row as { id: string }).id)
          .eq('user_id', user.id)
        continue
      }

      await track('profile_photo_suggestion_found', { provider: provider.id })
      revalidatePath(`/people/${person.id}`)
      return { message: 'Found a possible photo. Check it before using it.' }
    }
  }

  await track('profile_photo_suggestion_found', { provider: 'none' })
  return { message: 'No usable public photo was found. You can upload one.' }
}

async function loadSuggestion(id: string) {
  const user = await requireUser()
  const supabase = await createClient()
  const { data } = await suggestionsTable(supabase)
    .select(
      'id, person_id, image_url, source_url, source_label, source_id, provider, storage_path, status, created_at',
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  return { user, supabase, suggestion: (data as PhotoSuggestionRow | null) ?? null }
}

export async function confirmPhotoSuggestion(
  _prev: PhotoActionState,
  formData: FormData,
): Promise<PhotoActionState> {
  const id = idSchema.safeParse(formData.get('suggestionId'))
  if (!id.success) return { error: 'That suggestion could not be found.' }

  const { user, supabase, suggestion } = await loadSuggestion(id.data)
  if (!suggestion || suggestion.status !== 'suggested' || !suggestion.storage_path) {
    return { error: 'That suggestion is no longer available.' }
  }

  const ext = suggestion.storage_path.split('.').pop() ?? 'jpg'
  // A path no existing photo can share, so nothing is overwritten before the
  // new face is safely attached.
  const target = `${user.id}/people/${suggestion.person_id}-${suggestion.id}.${ext}`

  const { data: person } = await supabase
    .from('people')
    .select('id, avatar_path')
    .eq('id', suggestion.person_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!person) return { error: 'That person could not be found.' }

  // Move, attach, and only then remove the old face. Any failure before the
  // attach leaves the person exactly as they were.
  const { error: moveError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .move(suggestion.storage_path, target)
  if (moveError) {
    logger.warn('person.photo_suggestion_move_failed', { message: moveError.message })
    return { error: 'The photo could not be attached. Try again.' }
  }

  const { error } = await (supabase as unknown as import('@supabase/supabase-js').SupabaseClient)
    .from('people')
    .update({ avatar_path: target, avatar_suggestion_id: suggestion.id })
    .eq('id', suggestion.person_id)
    .eq('user_id', user.id)
  if (error) {
    // Put the review copy back so the suggestion still works.
    await supabase.storage.from(AVATAR_BUCKET).move(target, suggestion.storage_path)
    return { error: 'The photo could not be attached. Try again.' }
  }

  if (person.avatar_path && person.avatar_path !== target) {
    await supabase.storage.from(AVATAR_BUCKET).remove([person.avatar_path])
  }

  await suggestionsTable(supabase)
    .update({ status: 'confirmed', decided_at: new Date().toISOString(), storage_path: null })
    .eq('id', suggestion.id)
    .eq('user_id', user.id)

  await track('profile_photo_confirmed', { provider: suggestion.provider })
  revalidatePath(`/people/${suggestion.person_id}`)
  revalidatePath('/people')
  return { message: 'Photo saved.' }
}

export async function rejectPhotoSuggestion(
  _prev: PhotoActionState,
  formData: FormData,
): Promise<PhotoActionState> {
  const id = idSchema.safeParse(formData.get('suggestionId'))
  if (!id.success) return { error: 'That suggestion could not be found.' }

  const { user, supabase, suggestion } = await loadSuggestion(id.data)
  if (!suggestion || suggestion.status !== 'suggested') return { message: 'Done.' }

  if (suggestion.storage_path) {
    await supabase.storage.from(AVATAR_BUCKET).remove([suggestion.storage_path])
  }
  await suggestionsTable(supabase)
    .update({ status: 'rejected', decided_at: new Date().toISOString(), storage_path: null })
    .eq('id', suggestion.id)
    .eq('user_id', user.id)

  await track('profile_photo_rejected', { provider: suggestion.provider })
  revalidatePath(`/people/${suggestion.person_id}`)
  return { message: 'Thanks — that photo will not be suggested again.' }
}
