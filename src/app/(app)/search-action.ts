'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { resolveFaces } from '@/lib/conversations/avatars'

export interface SearchResult {
  entity:
    | 'person'
    | 'organization'
    | 'meeting'
    | 'interaction'
    | 'commitment'
    | 'decision'
    | 'note'
    | 'observation'
  id: string
  title: string
  subtitle: string | null
  person_id: string | null
  occurred_at: string | null
  /** A signed photo URL for person results, so the palette can show a face. */
  image?: string | null
}

/**
 * Global search.
 *
 * Delegates to the `search_everything` SQL function, which is SECURITY INVOKER —
 * every branch of that query is filtered by the same RLS policies as a direct
 * table read, so this can only ever return the caller's own rows.
 */
export async function searchEverything(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  await requireUser()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('search_everything', {
    q: trimmed.slice(0, 120),
    max_results: 20,
  })

  if (error) {
    logger.warn('search.failed', { code: error.code })
    return []
  }

  const results = (data ?? []) as SearchResult[]

  // Faces for the people in the results. One query, one signing call; the
  // signed URLs are short-lived and never leave this response.
  const personIds = results.filter((r) => r.entity === 'person').map((r) => r.id)
  if (personIds.length === 0) return results

  const { data: people } = await supabase
    .from('people')
    .select('id, avatar_url, avatar_path')
    .in('id', personIds)
  const faces = await resolveFaces(supabase, people ?? [], (p) => p.id)

  return results.map((r) => (r.entity === 'person' ? { ...r, image: faces.get(r.id) ?? null } : r))
}
