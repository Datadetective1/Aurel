import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { excerptSpeaker, labelIsPerson, type KnownPerson } from './speakers'
import { touchPeopleWindows } from './process'
import { logger } from '@/lib/logger'

type Client = SupabaseClient<Database>

/**
 * ATTRIBUTION AFTER THE FACT
 * =============================================================================
 * The reading attaches promises to the people who were in the room at the
 * time. When somebody is added to a conversation later -- because they were
 * not on record yet, which is exactly what happened in the first production
 * conversation -- the rows that belong to them have to find them.
 *
 * Three rules, applied in order, and each one is a repoint, never a copy, so
 * no loop or decision is ever duplicated:
 *
 *   1. REPLACEMENT. If the person is taking somebody else's place (the wrong
 *      person was attached and is being removed), everything filed under the
 *      old person on this conversation moves to the new one.
 *   2. SPEAKER. A loop whose excerpt was recorded under this person's label
 *      ("Adama: I'll send the requirements") is theirs: owner becomes person,
 *      owner_person_id becomes them.
 *   3. FILING. A loop or decision on this conversation with nobody to show it
 *      under is filed under the new person when they are the only other
 *      person in the room. That is the same rule the reading itself uses.
 * =============================================================================
 */

export interface Ownership {
  user_id: string
  workspace_id: string
  visibility: 'private' | 'shared'
}

export interface AttributionResult {
  loopsMoved: number
  loopsOwned: number
  loopsFiled: number
  decisionsLinked: number
  observationsMoved: number
}

export async function attachPersonToConversation(
  supabase: Client,
  own: Ownership,
  interactionId: string,
  person: KnownPerson,
  options: { replacePersonId?: string | null } = {},
): Promise<AttributionResult> {
  const userId = own.user_id
  const ownNoVis = { user_id: own.user_id, workspace_id: own.workspace_id }
  const result: AttributionResult = {
    loopsMoved: 0,
    loopsOwned: 0,
    loopsFiled: 0,
    decisionsLinked: 0,
    observationsMoved: 0,
  }

  const { data: interaction } = await supabase
    .from('interactions')
    .select('id, occurred_at')
    .eq('id', interactionId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!interaction) return result

  await supabase
    .from('interaction_participants')
    .upsert(
      { ...ownNoVis, interaction_id: interactionId, person_id: person.id },
      { onConflict: 'interaction_id,person_id' },
    )
  await touchPeopleWindows(supabase, userId, [person.id], interaction.occurred_at)

  // --- 1. replacement -------------------------------------------------------
  const from = options.replacePersonId ?? null
  if (from && from !== person.id) {
    const moved = await supabase
      .from('commitments')
      .update({ person_id: person.id })
      .eq('user_id', userId)
      .eq('interaction_id', interactionId)
      .eq('person_id', from)
      .select('id')
    result.loopsMoved += moved.data?.length ?? 0

    const owned = await supabase
      .from('commitments')
      .update({ owner_person_id: person.id })
      .eq('user_id', userId)
      .eq('interaction_id', interactionId)
      .eq('owner_person_id', from)
      .select('id')
    result.loopsOwned += owned.data?.length ?? 0

    const { data: decisions } = await supabase
      .from('decisions')
      .select('id')
      .eq('user_id', userId)
      .eq('interaction_id', interactionId)
    const decisionIds = (decisions ?? []).map((d) => d.id)
    if (decisionIds.length > 0) {
      const { data: links } = await supabase
        .from('decision_people')
        .select('decision_id')
        .eq('user_id', userId)
        .eq('person_id', from)
        .in('decision_id', decisionIds)
      for (const link of links ?? []) {
        await supabase
          .from('decision_people')
          .delete()
          .eq('user_id', userId)
          .eq('decision_id', link.decision_id)
          .eq('person_id', from)
        await supabase
          .from('decision_people')
          .upsert(
            { ...own, decision_id: link.decision_id, person_id: person.id },
            { onConflict: 'decision_id,person_id' },
          )
        result.decisionsLinked++
      }
    }

    // Memory proposed about the wrong person from this conversation belongs
    // to the right one. Only proposals: a confirmed observation is the user's
    // judgement about the person they confirmed it for.
    const { data: sources } = await supabase
      .from('observation_sources')
      .select('observation_id')
      .eq('user_id', userId)
      .eq('interaction_id', interactionId)
    const observationIds = (sources ?? []).map((s) => s.observation_id)
    if (observationIds.length > 0) {
      const movedObs = await supabase
        .from('observations')
        .update({ person_id: person.id })
        .eq('user_id', userId)
        .eq('person_id', from)
        .eq('status', 'proposed')
        .in('id', observationIds)
        .select('id')
      result.observationsMoved += movedObs.data?.length ?? 0
    }

    await supabase
      .from('interaction_participants')
      .delete()
      .eq('user_id', userId)
      .eq('interaction_id', interactionId)
      .eq('person_id', from)
    await recomputeWindow(supabase, userId, from)
  }

  // --- 2. speaker -----------------------------------------------------------------
  const { data: loops } = await supabase
    .from('commitments')
    .select('id, owner, owner_person_id, person_id, excerpt, kind')
    .eq('user_id', userId)
    .eq('interaction_id', interactionId)

  for (const loop of loops ?? []) {
    const speaker = excerptSpeaker(loop.excerpt)
    if (!speaker || !labelIsPerson(speaker, person)) continue
    if (loop.owner_person_id === person.id) continue
    // A question they asked is still a question; a promise they made is theirs.
    const patch =
      loop.kind === 'question'
        ? { person_id: person.id }
        : { owner: 'person' as const, owner_person_id: person.id, person_id: person.id }
    // Only reclaim what was unowned or filed under nobody in particular. A
    // loop the user already assigned to somebody else is their call.
    if (loop.owner === 'user' || (loop.owner_person_id && loop.owner_person_id !== person.id))
      continue
    const { error } = await supabase
      .from('commitments')
      .update(patch)
      .eq('id', loop.id)
      .eq('user_id', userId)
    if (!error) result.loopsOwned++
  }

  // --- 3. filing ------------------------------------------------------------------
  const { data: participants } = await supabase
    .from('interaction_participants')
    .select('person_id')
    .eq('user_id', userId)
    .eq('interaction_id', interactionId)
  const others = (participants ?? []).filter((p) => p.person_id !== person.id)

  if (others.length === 0) {
    const filed = await supabase
      .from('commitments')
      .update({ person_id: person.id })
      .eq('user_id', userId)
      .eq('interaction_id', interactionId)
      .is('person_id', null)
      .select('id')
    result.loopsFiled += filed.data?.length ?? 0

    const { data: decisions } = await supabase
      .from('decisions')
      .select('id, decision_people(person_id)')
      .eq('user_id', userId)
      .eq('interaction_id', interactionId)
    for (const decision of decisions ?? []) {
      if ((decision.decision_people ?? []).length > 0) continue
      const { error } = await supabase
        .from('decision_people')
        .upsert(
          { ...own, decision_id: decision.id, person_id: person.id },
          { onConflict: 'decision_id,person_id' },
        )
      if (!error) result.decisionsLinked++
    }
  }

  logger.info('conversation.participant_attached', { ...result, replaced: Boolean(from) })
  return result
}

/**
 * Remove a person from a conversation. What was filed under them either
 * moves to `moveTo` (through the replacement path above) or is unfiled, so
 * it stops appearing on the wrong person's page without being lost.
 */
export async function detachPersonFromConversation(
  supabase: Client,
  own: Ownership,
  interactionId: string,
  personId: string,
  moveTo: KnownPerson | null,
): Promise<AttributionResult | null> {
  if (moveTo && moveTo.id !== personId) {
    return attachPersonToConversation(supabase, own, interactionId, moveTo, {
      replacePersonId: personId,
    })
  }

  const userId = own.user_id
  await supabase
    .from('commitments')
    .update({ person_id: null })
    .eq('user_id', userId)
    .eq('interaction_id', interactionId)
    .eq('person_id', personId)
  await supabase
    .from('commitments')
    .update({ owner_person_id: null, owner: 'shared' })
    .eq('user_id', userId)
    .eq('interaction_id', interactionId)
    .eq('owner_person_id', personId)

  const { data: decisions } = await supabase
    .from('decisions')
    .select('id')
    .eq('user_id', userId)
    .eq('interaction_id', interactionId)
  const decisionIds = (decisions ?? []).map((d) => d.id)
  if (decisionIds.length > 0) {
    await supabase
      .from('decision_people')
      .delete()
      .eq('user_id', userId)
      .eq('person_id', personId)
      .in('decision_id', decisionIds)
  }

  await supabase
    .from('interaction_participants')
    .delete()
    .eq('user_id', userId)
    .eq('interaction_id', interactionId)
    .eq('person_id', personId)
  await recomputeWindow(supabase, userId, personId)
  return null
}

/**
 * A person's first/last interaction stamps, recomputed from what is left.
 * Detaching somebody from their only conversation must not leave "last spoke
 * yesterday" pointing at a conversation they were never in.
 */
async function recomputeWindow(supabase: Client, userId: string, personId: string): Promise<void> {
  const { data } = await supabase
    .from('interaction_participants')
    .select('interactions(occurred_at)')
    .eq('user_id', userId)
    .eq('person_id', personId)
  const times = (data ?? [])
    .map((r) => r.interactions?.occurred_at)
    .filter((t): t is string => Boolean(t))
    .sort()
  await supabase
    .from('people')
    .update({
      first_interaction_at: times[0] ?? null,
      last_interaction_at: times[times.length - 1] ?? null,
    })
    .eq('id', personId)
    .eq('user_id', userId)
}
