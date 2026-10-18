import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { runPrompt } from '@/lib/ai/provider'
import { getUserContext } from '@/lib/ai/context'
import { profileNarrativePrompt, type ProfileNarrative } from '@/lib/ai/prompts/coaching'
import { logger } from '@/lib/logger'
import { describeScenarioDimension, type ScenarioProfile } from './scenario-scoring'

type Client = SupabaseClient<Database>

/**
 * Write the long-form profile narrative for a scored scenario assessment.
 *
 * The scenario instrument never called this. Scores were saved, the narrative
 * column stayed null, and every scenario profile -- all of them, not a flaky
 * few -- opened on "the written summary did not generate". It is now written
 * after scoring, off the request path (see scoreScenarioAssessment).
 *
 * Safe by construction:
 *   - `runPrompt` falls back to deterministic composition when a model is
 *     unavailable or fails, so a narrative is produced either way
 *   - only the `narrative` column is written; answers and scores are never
 *     touched, so a failure here cannot corrupt the profile
 *   - any throw is caught and logged, and the first read on screen never
 *     depended on it
 *
 * `run` is injectable so the failure path can be tested without a network.
 */
export async function writeProfileNarrative(
  supabase: Client,
  userId: string,
  assessmentId: string,
  profile: ScenarioProfile,
  run: typeof runPrompt = runPrompt,
): Promise<ProfileNarrative | null> {
  try {
    const user = await getUserContext(supabase, userId)
    const generation = await run(profileNarrativePrompt, {
      user,
      archetype: profile.archetype,
      confidence: profile.confidence,
      dimensions: profile.ranked.map((d) => {
        const described = describeScenarioDimension(d)
        return {
          id: d.dimension,
          label: described.label,
          pole: described.pole,
          blurb: described.blurb,
          score: d.score,
          lean: d.lean,
        }
      }),
    })

    const { error } = await supabase
      .from('assessments')
      .update({ narrative: generation.output as never })
      .eq('user_id', userId)
      .eq('id', assessmentId)

    if (error) {
      logger.warn('scenario.narrative_save_failed', { code: error.code })
      return null
    }
    return generation.output
  } catch (error) {
    logger.warn('scenario.narrative_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
    return null
  }
}
