import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { getPeopleContext, getUserContext } from '@/lib/ai/context'
import { runPrompt } from '@/lib/ai/provider'
import {
  conversationPrompt,
  decisionWorthProposing,
  loopWorthProposing,
  normaliseDecision,
  normaliseLoop,
} from '@/lib/ai/prompts/conversation'
import { recordUsage } from '@/lib/billing/entitlements'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'

type Client = SupabaseClient<Database>

/**
 * THE PROCESSING PIPELINE
 * =============================================================================
 * One function, called from every capture path: a meeting debrief, a voice
 * note, a pasted transcript, an uploaded file. It reads the interaction row
 * that already exists, runs the extraction, and writes the residue:
 *
 *   summary / outcome / topics  ->  onto the interaction itself
 *   loops                       ->  commitments, review_status = proposed
 *   decisions                   ->  decisions, review_status = proposed
 *   memory proposals            ->  observations, status = proposed
 *   the generation itself       ->  ai_artifacts, linked from the interaction
 *
 * Everything extracted is a PROPOSAL. Nothing reaches Today, a brief or Ask
 * until the user confirms it on the conversation page. The pipeline is
 * allowed to be wrong; it is not allowed to be wrong in the user's record.
 *
 * The interaction row is written by the caller first and survives whatever
 * happens here. If extraction fails, the words are kept, the row is marked
 * failed with a short reason, and the page offers to try again.
 * =============================================================================
 */

export interface ProcessResult {
  ok: boolean
  loopsProposed: number
  decisionsProposed: number
  memoriesProposed: number
  grounded: boolean
  error?: string
}

interface Ownership {
  user_id: string
  workspace_id: string
  visibility: 'private' | 'shared'
}

export async function processConversation(
  supabase: Client,
  own: Ownership,
  interactionId: string,
): Promise<ProcessResult> {
  const userId = own.user_id
  const ownNoVis = { user_id: own.user_id, workspace_id: own.workspace_id }

  const { data: interaction } = await supabase
    .from('interactions')
    .select(
      'id, title, occurred_at, raw_notes, transcript, source_kind, went_well, meeting_id, meetings(objective)',
    )
    .eq('user_id', userId)
    .eq('id', interactionId)
    .maybeSingle()

  if (!interaction) {
    return fail(supabase, userId, interactionId, 'That conversation could not be found.')
  }

  const source = (interaction.transcript ?? interaction.raw_notes ?? '').trim()
  if (source.length < 10) {
    return fail(supabase, userId, interactionId, 'There were not enough words to read.')
  }

  await supabase
    .from('interactions')
    .update({ processing_status: 'processing', processing_error: null })
    .eq('id', interactionId)
    .eq('user_id', userId)

  const { data: participantRows } = await supabase
    .from('interaction_participants')
    .select('person_id')
    .eq('user_id', userId)
    .eq('interaction_id', interactionId)

  const personIds = (participantRows ?? []).map((r) => r.person_id)
  const [people, userContext] = await Promise.all([
    getPeopleContext(supabase, userId, personIds),
    getUserContext(supabase, userId),
  ])
  const participants = personIds
    .map((id) => people.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
  const validPersonIds = new Set(participants.map((p) => p.id))

  try {
    const generation = await runPrompt(conversationPrompt, {
      user: userContext,
      participants,
      priorObjective: interaction.meetings?.objective ?? null,
      conversation: {
        id: interaction.id,
        title: interaction.title,
        occurredAt: interaction.occurred_at,
        source,
        sourceKind: interaction.source_kind,
        wentWell: interaction.went_well,
      },
    })

    const output = generation.output

    // The generation is recorded first so every proposal can point at it.
    const { data: artifact } = await supabase
      .from('ai_artifacts')
      .insert({
        ...own,
        kind: 'debrief',
        subject_kind: 'interaction',
        subject_id: interaction.id,
        content: output as never,
        prompt_version: generation.provenance.promptVersion,
        provider: generation.provenance.provider,
        model: generation.provenance.model,
        grounded_fallback: generation.provenance.groundedFallback,
        latency_ms: generation.provenance.latencyMs,
        token_usage: generation.provenance.tokenUsage as never,
      })
      .select('id')
      .single()

    // Reprocessing replaces earlier proposals that were never acted on. A
    // confirmed or rejected row is the user's decision and stays.
    await Promise.all([
      supabase
        .from('commitments')
        .delete()
        .eq('user_id', userId)
        .eq('interaction_id', interaction.id)
        .eq('review_status', 'proposed'),
      supabase
        .from('decisions')
        .delete()
        .eq('user_id', userId)
        .eq('interaction_id', interaction.id)
        .eq('review_status', 'proposed'),
    ])

    // --- loops --------------------------------------------------------------
    let loopsProposed = 0
    for (const raw of output.loops.slice(0, 12)) {
      const loop = normaliseLoop(raw, validPersonIds)
      if (!loopWorthProposing(loop)) continue

      const { error } = await supabase.from('commitments').insert({
        ...own,
        description: loop.description,
        kind: loop.kind,
        owner: loop.owner,
        owner_person_id: loop.ownerPersonId,
        // The person the loop is filed under: whoever owes it, else the
        // first participant, so it shows on somebody's page.
        person_id: loop.ownerPersonId ?? participants[0]?.id ?? null,
        interaction_id: interaction.id,
        meeting_id: interaction.meeting_id,
        due_on: loop.dueOn,
        confidence: loop.confidence,
        excerpt: loop.excerpt,
        review_status: 'proposed',
        status: 'open',
      })

      if (error) {
        // Losing a loop is losing the thing the user most needs to remember.
        logger.warn('conversation.loop_insert_failed', { interactionId, code: error.code })
        continue
      }
      loopsProposed++
    }

    // --- decisions ------------------------------------------------------------
    let decisionsProposed = 0
    for (const raw of output.decisions.slice(0, 8)) {
      const decision = normaliseDecision(raw, validPersonIds)
      if (!decisionWorthProposing(decision)) continue

      const { data: row, error } = await supabase
        .from('decisions')
        .insert({
          ...own,
          description: decision.description,
          context: decision.context,
          decided_on: interaction.occurred_at.slice(0, 10),
          interaction_id: interaction.id,
          meeting_id: interaction.meeting_id,
          confidence: decision.confidence,
          excerpt: decision.excerpt,
          review_status: 'proposed',
        })
        .select('id')
        .single()

      if (error || !row) {
        logger.warn('conversation.decision_insert_failed', { interactionId, code: error?.code })
        continue
      }
      decisionsProposed++

      // A decision with nobody named still concerns everyone who was there.
      const linked = decision.personIds.length > 0 ? decision.personIds : participants.map((p) => p.id)
      if (linked.length > 0) {
        await supabase.from('decision_people').insert(
          linked.map((personId) => ({ ...own, decision_id: row.id, person_id: personId })),
        )
      }
    }

    // --- memory proposals ------------------------------------------------------
    let memoriesProposed = 0
    for (const proposal of output.proposedMemories.slice(0, 8)) {
      if (!validPersonIds.has(proposal.personId)) continue

      const { data: observation } = await supabase
        .from('observations')
        .insert({
          ...own,
          person_id: proposal.personId,
          content: proposal.content,
          category: proposal.category,
          evidence_level: proposal.evidenceLevel,
          status: 'proposed',
          source_kind: 'debrief',
          origin_artifact_id: artifact?.id ?? null,
        })
        .select('id')
        .single()

      if (observation) {
        memoriesProposed++
        await supabase.from('observation_sources').insert({
          ...ownNoVis,
          observation_id: observation.id,
          interaction_id: interaction.id,
          excerpt: proposal.excerpt,
        })
      }
    }

    await supabase
      .from('interactions')
      .update({
        summary: output.summary.slice(0, 4000),
        outcome: output.outcome.slice(0, 2000),
        topics: output.topics.slice(0, 6).map((t) => t.slice(0, 80)),
        processing_status: 'ready',
        processing_error: null,
        artifact_id: artifact?.id ?? null,
        // Nothing to review means the review is done.
        reviewed_at: loopsProposed + decisionsProposed === 0 ? new Date().toISOString() : null,
      })
      .eq('id', interaction.id)
      .eq('user_id', userId)

    await recordUsage({
      meter: 'transcript_analysis',
      subjectKind: 'interaction',
      subjectId: interaction.id,
      provider: generation.provenance.provider,
      model: generation.provenance.model,
      inputTokens: generation.provenance.tokenUsage?.input,
      outputTokens: generation.provenance.tokenUsage?.output,
    })

    await track('conversation_processed', {
      sourceKind: interaction.source_kind,
      participants: participants.length,
      loops: loopsProposed,
      decisions: decisionsProposed,
      proposals: memoriesProposed,
      grounded: generation.provenance.groundedFallback,
    })

    return {
      ok: true,
      loopsProposed,
      decisionsProposed,
      memoriesProposed,
      grounded: generation.provenance.groundedFallback,
    }
  } catch (error) {
    logger.error('conversation.process_failed', {
      interactionId,
      error: error instanceof Error ? error.name : 'unknown',
    })
    return fail(
      supabase,
      userId,
      interactionId,
      'The automatic reading did not run. Your words are saved; you can try again.',
    )
  }
}

async function fail(
  supabase: Client,
  userId: string,
  interactionId: string,
  message: string,
): Promise<ProcessResult> {
  await supabase
    .from('interactions')
    .update({ processing_status: 'failed', processing_error: message })
    .eq('id', interactionId)
    .eq('user_id', userId)
  return {
    ok: false,
    loopsProposed: 0,
    decisionsProposed: 0,
    memoriesProposed: 0,
    grounded: true,
    error: message,
  }
}

/**
 * Keep a person's interaction window current after a conversation is filed.
 * Copied from the debrief action so every capture path agrees.
 */
export async function touchPeopleWindows(
  supabase: Client,
  userId: string,
  personIds: string[],
  occurredAt: string,
): Promise<void> {
  for (const personId of personIds) {
    await supabase
      .from('people')
      .update({ last_interaction_at: occurredAt })
      .eq('id', personId)
      .eq('user_id', userId)
      .or(`last_interaction_at.is.null,last_interaction_at.lt.${occurredAt}`)
    await supabase
      .from('people')
      .update({ first_interaction_at: occurredAt })
      .eq('id', personId)
      .eq('user_id', userId)
      .or(`first_interaction_at.is.null,first_interaction_at.gt.${occurredAt}`)
  }
}
