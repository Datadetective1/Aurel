import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { ALL_SCENARIOS, TOTAL_COUNT, SCENARIO_VERSION } from '@/lib/assessment/scenarios'
import type { PromptBlock } from '@/components/app/profile-prompt'

type Client = SupabaseClient<Database>

/**
 * The next profile question worth asking, or nothing.
 *
 * "Or nothing" is the common answer, and deliberately so. Four conditions all
 * have to hold, and each one exists to stop this becoming nagging:
 *
 *   - there is a scored profile to refine
 *   - it is not already complete
 *   - the account has produced at least one brief, so the user has seen
 *     Atturel do something before being asked to invest more in it
 *   - no question was dismissed in the last week
 *
 * The question itself is the next unanswered round in the instrument's own
 * order. Not random, not "the most informative next item" — the blocks are
 * ordered as they are for a reason, and reordering them to optimise a UI is
 * the change this whole feature was told not to make.
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
    .select('scenario_id')
    .eq('user_id', userId)
    .eq('assessment_id', assessment.id)

  const answered = new Set((responses ?? []).map((r) => r.scenario_id))
  if (answered.size >= TOTAL_COUNT) return null

  const next = ALL_SCENARIOS.find((s) => !answered.has(s.id))
  if (!next) return null

  return {
    assessmentId: assessment.id,
    scenarioId: next.id,
    prompt: next.prompt,
    options: next.options.map((o) => ({ id: o.id, label: o.label })),
    answeredCount: answered.size,
    totalCount: TOTAL_COUNT,
  }
}
