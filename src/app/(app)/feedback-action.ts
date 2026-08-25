'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'
import { ownershipNoVisibility } from '@/lib/workspace'
import { logger } from '@/lib/logger'

const RATINGS = ['yes', 'partly', 'no'] as const

/**
 * Record feedback on a generation.
 *
 * Upserted on (artifact_id, user_id) so changing your mind replaces the previous
 * answer rather than accumulating duplicates.
 */
export async function submitArtifactFeedback(
  artifactId: string,
  rating: string,
  note?: string,
) {
  if (!(RATINGS as readonly string[]).includes(rating)) {
    return { ok: false as const }
  }

  const user = await requireUser()
  const supabase = await createClient()
  const own = await ownershipNoVisibility()

  // Confirm the artifact belongs to the caller before writing anything.
  const { data: artifact } = await supabase
    .from('ai_artifacts')
    .select('id')
    .eq('id', artifactId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!artifact) return { ok: false as const }

  const { error } = await supabase.from('ai_feedback').upsert(
    {
      ...own,
      artifact_id: artifactId,
      rating: rating as (typeof RATINGS)[number],
      note: note?.slice(0, 1000) ?? null,
    },
    { onConflict: 'artifact_id,user_id' },
  )

  if (error) {
    logger.warn('feedback.save_failed', { code: error.code })
    return { ok: false as const }
  }

  return { ok: true as const }
}
