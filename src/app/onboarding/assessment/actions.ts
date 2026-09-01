'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'
import { track } from '@/lib/analytics'
import { afterOnboardingPath } from '@/lib/billing/checkout-intent'
import { logger } from '@/lib/logger'
import {
  BLOCK_BY_ID,
  BLOCK_COUNT,
  INITIAL_BLOCK_COUNT,
  INSTRUMENT_VERSION,
} from '@/lib/assessment/instrument'
import { describeDimension, scoreResponses } from '@/lib/assessment/scoring'
import { runPrompt } from '@/lib/ai/provider'
import { profileNarrativePrompt } from '@/lib/ai/prompts/coaching'
import { getUserContext } from '@/lib/ai/context'

/**
 * Interaction Profile lifecycle.
 *
 * Responses are persisted per round rather than batched at the end, so closing
 * the tab twenty rounds in costs nothing. Scoring happens server-side from the
 * stored rows — the client never sends a score, only which statements were
 * chosen, so a crafted request cannot manufacture a profile.
 */

/** Reuse an in-progress run, or start a fresh one. */
export async function startOrResumeAssessment() {
  const user = await requireUser()
  const supabase = await createClient()

  // Any run of this instrument, not just an unfinished one.
  //
  // Filtering on in_progress meant that landing on this page after finishing
  // found nothing to resume and started a brand new assessment: an empty row
  // with zero responses, plus a second assessment_started, every time. It fired
  // on the way to the reveal screen, so every completed account carried one and
  // the started-to-completed funnel understated completion by half.
  //
  // Retaking is a deliberate act and belongs behind a deliberate control, not
  // behind navigating back to a page you have already finished.
  const { data: existing } = await supabase
    .from('assessments')
    .select('id, instrument_version')
    .eq('user_id', user.id)
    .eq('instrument_version', INSTRUMENT_VERSION)
    .in('status', ['in_progress', 'completed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    const { data: responses } = await supabase
      .from('assessment_responses')
      .select('round_index, block_id, most_item_id, least_item_id')
      .eq('user_id', user.id)
      .eq('assessment_id', existing.id)
      .order('round_index', { ascending: true })

    return { assessmentId: existing.id, responses: responses ?? [] }
  }

  const { data: created, error } = await supabase
    .from('assessments')
    .insert({ user_id: user.id, instrument_version: INSTRUMENT_VERSION })
    .select('id')
    .single()

  if (error || !created) {
    logger.error('assessment.create_failed', { code: error?.code })
    throw new Error('Could not start the assessment.')
  }

  await track('assessment_started')
  return { assessmentId: created.id, responses: [] }
}

const responseSchema = z.object({
  assessmentId: z.string().uuid(),
  roundIndex: z.number().int().min(0).max(BLOCK_COUNT - 1),
  blockId: z.string().min(1).max(16),
  mostItemId: z.string().min(1).max(16),
  leastItemId: z.string().min(1).max(16),
  latencyMs: z.number().int().min(0).max(3_600_000).nullable(),
})

export async function recordResponse(input: z.infer<typeof responseSchema>) {
  const parsed = responseSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'invalid_response' }

  const { assessmentId, roundIndex, blockId, mostItemId, leastItemId, latencyMs } = parsed.data

  // Validate against the instrument, not just the shape: both choices must be
  // real items belonging to the block claimed, and they must differ.
  const block = BLOCK_BY_ID[blockId]
  if (!block || block.index !== roundIndex) return { ok: false as const, error: 'unknown_block' }
  if (mostItemId === leastItemId) return { ok: false as const, error: 'duplicate_choice' }

  const ids = new Set(block.items.map((i) => i.id))
  if (!ids.has(mostItemId) || !ids.has(leastItemId)) {
    return { ok: false as const, error: 'item_not_in_block' }
  }

  const user = await requireUser()
  const supabase = await createClient()

  // Ownership is enforced by RLS, but scope explicitly so a wrong id is a
  // no-op rather than a policy violation.
  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('id', assessmentId)
    .maybeSingle()

  // 'completed' is allowed as well as 'in_progress'.
  //
  // A profile is scored once the opening sitting is done, so it is usable
  // immediately -- but the remaining blocks are still answerable. Refusing a
  // response to a completed assessment would make progressive refinement
  // impossible, which is the whole point of scoring early.
  if (!assessment || (assessment.status !== 'in_progress' && assessment.status !== 'completed')) {
    return { ok: false as const, error: 'assessment_unavailable' }
  }

  const { error } = await supabase.from('assessment_responses').upsert(
    {
      assessment_id: assessmentId,
      user_id: user.id,
      round_index: roundIndex,
      block_id: blockId,
      most_item_id: mostItemId,
      least_item_id: leastItemId,
      latency_ms: latencyMs,
    },
    { onConflict: 'assessment_id,round_index' },
  )

  if (error) {
    logger.warn('assessment.record_failed', { code: error.code, roundIndex })
    return { ok: false as const, error: 'save_failed' }
  }

  return { ok: true as const }
}

/**
 * Score whatever has been answered, and store it.
 *
 * Runs after the opening sitting and again after every refinement sitting. It
 * has always scored the responses that exist rather than requiring all 24 --
 * scoreResponses reports `answered`, `coverage` and a `confidence` that cannot
 * exceed 'provisional' on a short run -- so progressive profiling needed no
 * change to the scoring model at all.
 */
export async function completeAssessment(assessmentId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: responses } = await supabase
    .from('assessment_responses')
    .select('block_id, most_item_id, least_item_id')
    .eq('user_id', user.id)
    .eq('assessment_id', assessmentId)
    .order('round_index', { ascending: true })

  if (!responses || responses.length === 0) {
    return { ok: false as const, error: 'no_responses' }
  }

  const scored = scoreResponses(
    responses.map((r) => ({
      blockId: r.block_id,
      mostItemId: r.most_item_id,
      leastItemId: r.least_item_id,
    })),
  )

  // Narrative generation must never block the reveal. If it fails, the reveal
  // still renders from the deterministic scores.
  let narrative: unknown = null
  try {
    const userContext = await getUserContext(supabase, user.id)
    const generation = await runPrompt(profileNarrativePrompt, {
      user: userContext,
      archetype: scored.archetype,
      confidence: scored.confidence,
      dimensions: scored.ranked.map((d) => {
        const described = describeDimension(d)
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
    narrative = generation.output
  } catch (error) {
    logger.warn('assessment.narrative_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
  }

  const { error } = await supabase
    .from('assessments')
    .update({
      status: 'completed',
      scores: scored.scores,
      archetype: scored.archetype,
      coverage: scored.coverage,
      consistency: scored.consistency,
      narrative: narrative as never,
      completed_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('id', assessmentId)

  if (error) {
    logger.error('assessment.complete_failed', { code: error.code })
    return { ok: false as const, error: 'save_failed' }
  }

  await track('assessment_completed', {
    answered: scored.answered,
    coverage: scored.coverage,
    consistency: scored.consistency,
    confidence: scored.confidence,
  })

  // Two distinct milestones, and conflating them would hide the one that
  // matters: how many people come back to finish.
  if (scored.answered <= INITIAL_BLOCK_COUNT) {
    await track('assessment_initial_completed', {
      answered: scored.answered,
      confidence: scored.confidence,
    })
  }
  if (scored.answered >= BLOCK_COUNT) {
    await track('assessment_fully_completed', {
      coverage: scored.coverage,
      consistency: scored.consistency,
      confidence: scored.confidence,
    })
  }

  revalidatePath('/onboarding', 'layout')
  return { ok: true as const, assessmentId }
}

const calibrationSchema = z.object({
  assessmentId: z.string().uuid(),
  rating: z.enum(['very_accurate', 'mostly_accurate', 'partly_accurate', 'not_accurate']),
  note: z.string().trim().max(1000).optional(),
})

/**
 * The user's own verdict on their profile.
 *
 * This is deliberately stored alongside the scores rather than folded into
 * them: a correction is higher-priority evidence than the instrument's output,
 * and downstream prompts are told to weight it that way.
 */
export async function calibrateAssessment(_prev: unknown, formData: FormData) {
  const parsed = calibrationSchema.safeParse({
    assessmentId: formData.get('assessmentId'),
    rating: formData.get('rating'),
    note: formData.get('note')?.toString() || undefined,
  })

  if (!parsed.success) {
    return { error: 'Choose how accurate that felt.' }
  }

  const user = await requireUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from('assessments')
    .update({ calibration: parsed.data.rating, calibration_note: parsed.data.note ?? null })
    .eq('user_id', user.id)
    .eq('id', parsed.data.assessmentId)

  if (error) {
    logger.warn('assessment.calibration_failed', { code: error.code })
    return { error: 'We could not save that. Try again.' }
  }

  await supabase
    .from('profiles')
    .update({ onboarding_stage: 'done', onboarding_completed_at: new Date().toISOString() })
    .eq('id', user.id)

  await track('assessment_calibrated', { rating: parsed.data.rating })
  await track('onboarding_completed', { skippedAssessment: false })

  revalidatePath('/', 'layout')
  // Somebody who came from the pricing page to buy is returned to that purchase
  // rather than dropped on Today with no memory of why they signed up.
  redirect(await afterOnboardingPath())
}
