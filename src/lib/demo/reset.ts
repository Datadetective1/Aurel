import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { logger } from '@/lib/logger'

type Client = SupabaseClient<Database>

/**
 * REMOVING THE SAMPLE RECORD
 * =============================================================================
 * `clear_demo_data()` removes every row the sample seeded (`is_demo`). A
 * demonstration also creates rows that are not flagged: a conversation
 * captured "with Daniel", the loops read from it, a brief prepared for the
 * sample meeting. Left behind, they would sit in the account as if they were
 * real once the invented people were gone.
 *
 * So, before the flagged rows go:
 *   - a conversation whose every participant is a sample person, or which
 *     belongs to the sample meeting and has no real participant, is deleted
 *     with the loops and decisions read from it
 *   - a brief prepared for a sample meeting is deleted
 *
 * Anything that involves a real person is kept. Every query is the user's
 * own, under row level security, with the user id stated as well.
 * =============================================================================
 */
export async function removeSampleRecord(
  supabase: Client,
  userId: string,
): Promise<{ ok: boolean; conversationsRemoved: number }> {
  const [{ data: people }, { data: meetings }] = await Promise.all([
    supabase.from('people').select('id').eq('user_id', userId).eq('is_demo', true),
    supabase.from('meetings').select('id').eq('user_id', userId).eq('is_demo', true),
  ])
  const samplePeople = new Set((people ?? []).map((p) => p.id))
  const sampleMeetings = (meetings ?? []).map((m) => m.id)

  // --- conversations captured during a demonstration -------------------------
  const candidates = new Set<string>()
  if (samplePeople.size > 0) {
    const { data } = await supabase
      .from('interaction_participants')
      .select('interaction_id')
      .eq('user_id', userId)
      .in('person_id', [...samplePeople])
    for (const row of data ?? []) candidates.add(row.interaction_id)
  }
  if (sampleMeetings.length > 0) {
    const { data } = await supabase
      .from('interactions')
      .select('id')
      .eq('user_id', userId)
      .in('meeting_id', sampleMeetings)
    for (const row of data ?? []) candidates.add(row.id)
  }

  let removable: string[] = []
  if (candidates.size > 0) {
    const ids = [...candidates]
    const [{ data: rows }, { data: participants }] = await Promise.all([
      supabase.from('interactions').select('id, is_demo').eq('user_id', userId).in('id', ids),
      supabase
        .from('interaction_participants')
        .select('interaction_id, person_id')
        .eq('user_id', userId)
        .in('interaction_id', ids),
    ])
    const involvesRealPerson = new Set(
      (participants ?? [])
        .filter((p) => !samplePeople.has(p.person_id))
        .map((p) => p.interaction_id),
    )
    // Flagged rows are clear_demo_data's; real participants keep a conversation.
    removable = (rows ?? [])
      .filter((r) => !r.is_demo && !involvesRealPerson.has(r.id))
      .map((r) => r.id)
  }

  if (removable.length > 0) {
    // Loops keep a conversation's link only as "set null"; these have no
    // basis without it, whatever their review state.
    const { error: loopsError } = await supabase
      .from('commitments')
      .delete()
      .eq('user_id', userId)
      .in('interaction_id', removable)
    const { error } = await supabase
      .from('interactions')
      .delete()
      .eq('user_id', userId)
      .in('id', removable)
    if (loopsError || error) {
      logger.warn('demo.reset_conversations_failed', { code: (loopsError ?? error)?.code })
      return { ok: false, conversationsRemoved: 0 }
    }
  }

  // --- briefs prepared for the sample meeting --------------------------------
  if (sampleMeetings.length > 0) {
    const { error } = await supabase
      .from('ai_artifacts')
      .delete()
      .eq('user_id', userId)
      .eq('subject_kind', 'meeting')
      .in('subject_id', sampleMeetings)
    if (error) {
      logger.warn('demo.reset_briefs_failed', { code: error.code })
      return { ok: false, conversationsRemoved: removable.length }
    }
  }

  const { error } = await supabase.rpc('clear_demo_data')
  if (error) {
    logger.warn('demo.clear_failed', { code: error.code })
    return { ok: false, conversationsRemoved: removable.length }
  }
  return { ok: true, conversationsRemoved: removable.length }
}
