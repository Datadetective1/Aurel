'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'
import { logger } from '@/lib/logger'

export interface SearchResult {
  entity: 'person' | 'organization' | 'meeting' | 'interaction' | 'commitment' | 'note' | 'observation'
  id: string
  title: string
  subtitle: string | null
  person_id: string | null
  occurred_at: string | null
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

  return (data ?? []) as SearchResult[]
}
