'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import { SCENARIO_BY_ID, SCENARIO_VERSION, TOTAL_COUNT, CORE_COUNT } from '@/lib/assessment/scenarios'
import { scoreScenarios } from '@/lib/assessment/scenario-scoring'

/**
 * Scenario instrument: start, answer, score.
 *
 * One assessment row per account per instrument version. Answering re-scores
 * from everything recorded so far, so the stored profile is always the sum of
 * what the user has actually said — never a cached partial with an assumption
 * layered on top.
 */

export async function startOrResumeScenarioAssessment() {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('assessments')
    .select('id')
    .eq('user_id', user.id)
    .eq('instrument_version', SCENARIO_VERSION)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let assessmentId = existing?.id ?? null

  if (!assessmentId) {
    const { data: created, error } = await supabase
      .from('assessments')
      .insert({ user_id: user.id, instrument_version: SCENARIO_VERSION })
      .select('id')
      .single()

    if (error || !created) {
      logger.error('scenario.create_failed', { code: error?.code })
      throw new Error('Could not start the profile.')
    }
    assessmentId = created.id
    await track('assessment_started', {})
  }

  const { data: responses } = await supabase
    .from('scenario_responses')
    .select('scenario_id, option_id')
    .eq('user_id', user.id)
    .eq('assessment_id', assessmentId)

  return {
    assessmentId,
    responses: (responses ?? []).map((r) => ({
      scenarioId: r.scenario_id,
      optionId: r.option_id,
    })),
  }
}

const answerSchema = z.object({
  assessmentId: z.string().uuid(),
  scenarioId: z.string().min(1).max(32),
  optionId: z.string().min(1).max(32),
})

export async function answerScenario(input: z.infer<typeof answerSchema>) {
  const parsed = answerSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const }

  const { assessmentId, scenarioId, optionId } = parsed.data

  // Validate against the instrument, not just the shape.
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
    logger.warn('scenario.save_failed', { code: error.code })
    return { ok: false as const }
  }

  return { ok: true as const }
}

/** Re-score from everything answered so far and store the result. */
export async function scoreScenarioAssessment(assessmentId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: responses } = await supabase
    .from('scenario_responses')
    .select('scenario_id, option_id')
    .eq('user_id', user.id)
    .eq('assessment_id', assessmentId)

  if (!responses || responses.length === 0) return { ok: false as const }

  const scored = scoreScenarios(
    responses.map((r) => ({ scenarioId: r.scenario_id, optionId: r.option_id })),
  )

  const { error } = await supabase
    .from('assessments')
    .update({
      status: 'completed',
      scores: scored.scores,
      archetype: scored.archetype,
      coverage: scored.coverage,
      // Directional answers, not total responses. A run of "it depends" must
      // not read as a well-evidenced profile.
      consistency: scored.coverage,
      directional_count: scored.directional,
      completed_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('id', assessmentId)

  if (error) {
    logger.error('scenario.score_failed', { code: error.code })
    return { ok: false as const }
  }

  await track('assessment_completed', {
    answered: scored.answered,
    directional: scored.directional,
    coverage: scored.coverage,
    confidence: scored.confidence,
  })

  if (scored.answered <= CORE_COUNT) {
    await track('assessment_initial_completed', {
      answered: scored.answered,
      directional: scored.directional,
      confidence: scored.confidence,
    })
  }
  if (scored.answered >= TOTAL_COUNT) {
    await track('assessment_fully_completed', {
      coverage: scored.coverage,
      confidence: scored.confidence,
    })
  }

  return { ok: true as const, confidence: scored.confidence }
}

/**
 * Start over.
 *
 * Archives the current assessment rather than editing it: a profile built from
 * answers somebody gave to finish a questionnaire should not be silently
 * upgraded into one built from answers they meant. The old row stays, marked
 * abandoned, and a fresh one begins.
 */
export async function resetInteractionProfile() {
  const user = await requireUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from('assessments')
    .update({ status: 'abandoned' })
    .eq('user_id', user.id)
    .in('status', ['completed', 'in_progress'])

  if (error) {
    logger.warn('scenario.reset_failed', { code: error.code })
    return { ok: false as const }
  }

  await track('assessment_reset', {})
  return { ok: true as const }
}
