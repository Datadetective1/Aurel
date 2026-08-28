'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import { BLOCK_BY_ID, BLOCK_COUNT } from '@/lib/assessment/instrument'
import { scoreResponses } from '@/lib/assessment/scoring'

/**
 * ONE PROFILE QUESTION, ANSWERED IN PLACE
 * =============================================================================
 * The progressive half of progressive profiling.
 *
 * Answering here goes through the same validation the full runner uses — the
 * block must exist, both items must belong to it, and they must differ — and
 * writes the same row to the same table. There is no second scoring path and
 * no second instrument; this is one round of the existing 24, asked later.
 *
 * Nothing here records which statement was chosen in analytics. The event says
 * a question was answered and which dimension family it touched, and stops.
 * =============================================================================
 */

const answerSchema = z.object({
  assessmentId: z.string().uuid(),
  roundIndex: z.number().int().min(0).max(BLOCK_COUNT - 1),
  blockId: z.string().min(1).max(16),
  mostItemId: z.string().min(1).max(16),
  leastItemId: z.string().min(1).max(16),
})

export async function answerProfileQuestion(input: z.infer<typeof answerSchema>) {
  const parsed = answerSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const }

  const { assessmentId, roundIndex, blockId, mostItemId, leastItemId } = parsed.data

  const block = BLOCK_BY_ID[blockId]
  if (!block || block.index !== roundIndex) return { ok: false as const }
  if (mostItemId === leastItemId) return { ok: false as const }
  const ids = new Set(block.items.map((i) => i.id))
  if (!ids.has(mostItemId) || !ids.has(leastItemId)) return { ok: false as const }

  const user = await requireUser()
  const supabase = await createClient()

  const { error } = await supabase.from('assessment_responses').upsert(
    {
      assessment_id: assessmentId,
      user_id: user.id,
      round_index: roundIndex,
      block_id: blockId,
      most_item_id: mostItemId,
      least_item_id: leastItemId,
    },
    { onConflict: 'assessment_id,round_index' },
  )

  if (error) {
    logger.warn('profile_prompt.save_failed', { code: error.code, roundIndex })
    return { ok: false as const }
  }

  // Re-score from everything answered so far. The profile is always the sum of
  // what the user has told us, never a cached partial plus an assumption.
  const { data: responses } = await supabase
    .from('assessment_responses')
    .select('block_id, most_item_id, least_item_id')
    .eq('user_id', user.id)
    .eq('assessment_id', assessmentId)
    .order('round_index', { ascending: true })

  if (responses && responses.length > 0) {
    const scored = scoreResponses(
      responses.map((r) => ({
        blockId: r.block_id,
        mostItemId: r.most_item_id,
        leastItemId: r.least_item_id,
      })),
    )

    await supabase
      .from('assessments')
      .update({
        scores: scored.scores,
        archetype: scored.archetype,
        coverage: scored.coverage,
        consistency: scored.consistency,
      })
      .eq('user_id', user.id)
      .eq('id', assessmentId)

    await track('profile_question_answered', {
      answered: scored.answered,
      confidence: scored.confidence,
    })

    if (scored.answered >= BLOCK_COUNT) {
      await track('assessment_fully_completed', {
        coverage: scored.coverage,
        consistency: scored.consistency,
        confidence: scored.confidence,
      })
    }
  }

  revalidatePath('/today')
  return { ok: true as const }
}

/**
 * "Not now."
 *
 * A week, not forever. Dismissing one question should not silently end
 * refinement, and a permanent opt-out is what Settings is for.
 */
export async function snoozeProfilePrompt() {
  const user = await requireUser()
  const supabase = await createClient()

  const until = new Date(Date.now() + 7 * 86_400_000).toISOString()

  const { error } = await supabase
    .from('profiles')
    .update({ profile_prompt_snoozed_until: until })
    .eq('id', user.id)

  if (error) {
    logger.warn('profile_prompt.snooze_failed', { code: error.code })
    return { ok: false as const }
  }

  await track('profile_question_dismissed', {})
  revalidatePath('/today')
  return { ok: true as const }
}
