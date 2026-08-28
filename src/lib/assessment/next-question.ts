import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import {
  ALL_SCENARIOS,
  TOTAL_COUNT,
  SCENARIO_VERSION,
  SCENARIO_DIMENSIONS,
  type ScenarioDimension,
} from '@/lib/assessment/scenarios'
import type { PromptBlock } from '@/components/app/profile-prompt'

type Client = SupabaseClient<Database>

/**
 * How long after answering one before another may appear.
 *
 * Four hours rather than a session id: sessions are not modelled anywhere in
 * this product, and inventing one to pace a prompt would be a lot of machinery
 * for a question nobody is waiting on. A working day fits at most two.
 */
const ANSWER_SPACING_MS = 4 * 60 * 60 * 1000

/**
 * The next profile question worth asking, or nothing.
 *
 * "Or nothing" is the common answer, and deliberately so. Every condition below
 * exists to stop refinement becoming nagging:
 *
 *   - there is a current-instrument profile to refine
 *   - it is not already complete
 *   - the account has produced a brief, so the user has seen Atturel do
 *     something before being asked to invest more in it
 *   - nothing was dismissed inside the cooldown window
 *   - nothing was answered inside the spacing window, so at most one lands per
 *     working session rather than a queue of them
 *
 * WHICH question is chosen by weakest evidence first: the dimension with the
 * fewest directional answers, breaking ties in the instrument's own order.
 * Asking about what is already known is how a refinement prompt earns its
 * dismissal, and a dimension the user marked context-dependent is treated as
 * still-open rather than settled — they told us it varies, which is worth
 * confirming once, not five times.
 */
export async function getNextProfileQuestion(
  supabase: Client,
  userId: string,
): Promise<PromptBlock | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('profile_prompt_snoozed_until')
    .eq('id', userId)
    .maybeSingle()

  const snoozedUntil = profile?.profile_prompt_snoozed_until
  if (snoozedUntil && new Date(snoozedUntil).getTime() > Date.now()) return null

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, instrument_version')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .eq('instrument_version', SCENARIO_VERSION)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Only the current instrument is refined in place. A legacy profile is
  // offered a fresh start in Settings instead of being extended with questions
  // that were never part of it.
  if (!assessment) return null

  // Earned the right to ask: the account has seen a brief produced.
  const { count: briefs } = await supabase
    .from('ai_artifacts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', 'meeting_brief')

  if (!briefs || briefs === 0) return null

  const { data: responses } = await supabase
    .from('scenario_responses')
    .select('scenario_id, is_depends, answered_at')
    .eq('user_id', userId)
    .eq('assessment_id', assessment.id)

  const answered = new Set((responses ?? []).map((r) => r.scenario_id))
  if (answered.size >= TOTAL_COUNT) return null

  // One per session. The most recent answer sets the spacing window, so a user
  // who just answered one is not handed another on the next page load.
  const lastAnswer = (responses ?? [])
    .map((r) => new Date(r.answered_at).getTime())
    .sort((a, b) => b - a)[0]
  if (lastAnswer && Date.now() - lastAnswer < ANSWER_SPACING_MS) return null

  // Weakest evidence first. A dimension the user has told us nothing about is
  // worth more than a fourth question about one already settled.
  const directionalByDimension = Object.fromEntries(
    SCENARIO_DIMENSIONS.map((d) => [d, 0]),
  ) as Record<ScenarioDimension, number>

  for (const row of responses ?? []) {
    if (row.is_depends) continue
    const scenario = ALL_SCENARIOS.find((s) => s.id === row.scenario_id)
    if (scenario) directionalByDimension[scenario.dimension] += 1
  }

  const candidates = ALL_SCENARIOS.filter((s) => !answered.has(s.id))
  if (candidates.length === 0) return null

  const next = [...candidates].sort((a, b) => {
    const byEvidence = directionalByDimension[a.dimension] - directionalByDimension[b.dimension]
    if (byEvidence !== 0) return byEvidence
    // Stable and deterministic: instrument order decides the rest, so the
    // same account in the same state always gets the same question.
    return ALL_SCENARIOS.indexOf(a) - ALL_SCENARIOS.indexOf(b)
  })[0]!

  return {
    assessmentId: assessment.id,
    scenarioId: next.id,
    prompt: next.prompt,
    options: next.options.map((o) => ({ id: o.id, label: o.label })),
    answeredCount: answered.size,
    totalCount: TOTAL_COUNT,
  }
}
