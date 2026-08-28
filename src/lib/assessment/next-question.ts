import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { BLOCKS, BLOCK_COUNT } from '@/lib/assessment/instrument'
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
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!assessment) return null

  // Earned the right to ask: the account has seen a brief produced.
  const { count: briefs } = await supabase
    .from('ai_artifacts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', 'meeting_brief')

  if (!briefs || briefs === 0) return null

  const { data: responses } = await supabase
    .from('assessment_responses')
    .select('round_index')
    .eq('user_id', userId)
    .eq('assessment_id', assessment.id)

  const answered = new Set((responses ?? []).map((r) => r.round_index))
  if (answered.size >= BLOCK_COUNT) return null

  const nextIndex = BLOCKS.findIndex((b) => !answered.has(b.index))
  if (nextIndex === -1) return null

  const block = BLOCKS[nextIndex]!

  return {
    assessmentId: assessment.id,
    roundIndex: block.index,
    blockId: block.id,
    items: block.items.map((i) => ({ id: i.id, text: i.text })),
    answeredCount: answered.size,
    totalCount: BLOCK_COUNT,
  }
}
