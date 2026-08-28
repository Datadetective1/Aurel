'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import { SCENARIO_BY_ID, TOTAL_COUNT } from '@/lib/assessment/scenarios'
import { scoreScenarios } from '@/lib/assessment/scenario-scoring'

/**
 * ONE PROFILE QUESTION, ANSWERED IN PLACE
 * =============================================================================
 * The progressive half of progressive profiling.
 *
 * Answering here goes through the same validation the full runner uses — the
 * scenario must exist and the option must belong to it — and writes the same
 * row to the same table. There is no second scoring path and no second
 * instrument; this is one of the eighteen scenarios, asked later.
 *
 * Analytics record that a question was answered and whether the user leaned or
 * chose "it depends". Never which option, and never the wording.
 * =============================================================================
 */

const answerSchema = z.object({
  assessmentId: z.string().uuid(),
  scenarioId: z.string().min(1).max(32),
  optionId: z.string().min(1).max(32),
})

export async function answerProfileQuestion(input: z.infer<typeof answerSchema>) {
  const parsed = answerSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const }

  const { assessmentId, scenarioId, optionId } = parsed.data

  // Validated against the instrument, not just the shape.
  const scenario = SCENARIO_BY_ID[scenarioId]
  if (!scenario) return { ok: false as const }
  const option = scenario.options.find((o) => o.id === optionId)
  if (!option) return { ok: false as const }

  const user = await requireUser()
  const supabase = await createClient()

  const { error } = await supabase.from('scenario_responses').upsert(
    {
      assessment_id: assessmentId,
      user_id: user.id,
      scenario_id: scenarioId,
      option_id: optionId,
      is_depends: option.direction === 0,
    },
    { onConflict: 'assessment_id,scenario_id' },
  )

  if (error) {
    logger.warn('profile_prompt.save_failed', { code: error.code })
    return { ok: false as const }
  }

  // Re-score from everything answered so far. The profile is always the sum of
  // what the user has told us, never a cached partial plus an assumption.
  const { data: responses } = await supabase
    .from('scenario_responses')
    .select('scenario_id, option_id')
    .eq('user_id', user.id)
    .eq('assessment_id', assessmentId)

  if (responses && responses.length > 0) {
    const scored = scoreScenarios(
      responses.map((r) => ({ scenarioId: r.scenario_id, optionId: r.option_id })),
    )

    await supabase
      .from('assessments')
      .update({
        scores: scored.scores,
        archetype: scored.archetype,
        coverage: scored.coverage,
        consistency: scored.coverage,
        directional_count: scored.directional,
      })
      .eq('user_id', user.id)
      .eq('id', assessmentId)

    await track('interaction_profile_refinement_answered', {
      answered: scored.answered,
      directional: scored.directional,
      confidence: scored.confidence,
      declined: option.direction === 0,
    })
    await track('interaction_profile_updated', {
      answered: scored.answered,
      confidence: scored.confidence,
    })
    await track('profile_question_answered', {
      answered: scored.answered,
      directional: scored.directional,
      confidence: scored.confidence,
      // Whether they leaned or declined to. The distinction is the point of
      // offering "it depends" at all.
      declined: option.direction === 0,
    })

    if (scored.answered >= TOTAL_COUNT) {
      await track('assessment_fully_completed', {
        coverage: scored.coverage,
        confidence: scored.confidence,
      })
    }
  }

  revalidatePath('/today')
  return { ok: true as const }
}

/**
 * Record that a refinement question was actually put in front of somebody.
 *
 * Fired from the component on mount rather than from the page that selects the
 * question. Selection happens during a server render, which also runs for
 * prefetches and for revalidations triggered by unrelated actions — counting
 * those as "shown" would inflate the denominator of every funnel this event
 * exists to make calculable.
 *
 * The component de-duplicates per question per session, so reloading Today five
 * times without answering counts as one showing rather than five. Without that,
 * the shown-to-answered rate measures page loads instead of opportunities.
 *
 * Carries the scenario id only: which question, never its wording, never an
 * answer.
 */
export async function recordRefinementShown(scenarioId: string) {
  if (typeof scenarioId !== 'string' || scenarioId.length === 0 || scenarioId.length > 32) return
  await track('interaction_profile_refinement_shown', { scenarioId })
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

  await track('interaction_profile_refinement_dismissed', {})
  await track('profile_question_dismissed', {})
  revalidatePath('/today')
  return { ok: true as const }
}
