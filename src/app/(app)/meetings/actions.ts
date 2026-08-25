'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'
import { ownership, ownershipNoVisibility } from '@/lib/workspace'
import { checkCapability, recordUsage } from '@/lib/billing/entitlements'
import { getMeetingContext, getUserContext } from '@/lib/ai/context'
import { runPrompt } from '@/lib/ai/provider'
import { meetingBriefPrompt } from '@/lib/ai/prompts/meeting-brief'
import { debriefPrompt, normaliseCommitment } from '@/lib/ai/prompts/debrief'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'

export interface MeetingState {
  error?: string
  message?: string
  fieldErrors?: Record<string, string[]>
}

const MEETING_KINDS = [
  'one_on_one',
  'executive_review',
  'project_review',
  'customer_meeting',
  'sales_conversation',
  'negotiation',
  'difficult_conversation',
  'feedback_conversation',
  'performance_conversation',
  'interview',
  'networking',
  'presentation',
  'vendor_discussion',
  'team_meeting',
  'other',
] as const

const ATTENDEE_ROLES = [
  'decision_maker',
  'influencer',
  'contributor',
  'informed',
  'presenter',
  'other',
] as const

const meetingSchema = z.object({
  title: z.string().trim().min(1, 'Give the meeting a title.').max(200),
  kind: z.enum(MEETING_KINDS).catch('other'),
  scheduledAt: z.string().trim().optional(),
  durationMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  objective: z.string().trim().max(2000).optional(),
  stakes: z.string().trim().max(2000).optional(),
  extraContext: z.string().trim().max(4000).optional(),
  importance: z.coerce.number().int().min(1).max(5).catch(3),
})

export async function createMeeting(_prev: MeetingState, formData: FormData): Promise<MeetingState> {
  const parsed = meetingSchema.safeParse({
    title: formData.get('title'),
    kind: formData.get('kind') ?? 'other',
    scheduledAt: formData.get('scheduledAt') || undefined,
    durationMinutes: formData.get('durationMinutes') || undefined,
    objective: formData.get('objective') || undefined,
    stakes: formData.get('stakes') || undefined,
    extraContext: formData.get('extraContext') || undefined,
    importance: formData.get('importance') ?? 3,
  })

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  const supabase = await createClient()
  const own = await ownership()
  const v = parsed.data

  let scheduledAt: string | null = null
  if (v.scheduledAt) {
    const date = new Date(v.scheduledAt)
    if (Number.isNaN(date.getTime())) {
      return { fieldErrors: { scheduledAt: ['That date is not valid.'] } }
    }
    scheduledAt = date.toISOString()
  }

  const { data: meeting, error } = await supabase
    .from('meetings')
    .insert({
      ...own,
      title: v.title,
      kind: v.kind,
      scheduled_at: scheduledAt,
      duration_minutes: v.durationMinutes ?? null,
      objective: v.objective || null,
      stakes: v.stakes || null,
      extra_context: v.extraContext || null,
      importance: v.importance,
    })
    .select('id')
    .single()

  if (error || !meeting) {
    logger.error('meeting.create_failed', { code: error?.code })
    return { error: 'We could not create that meeting.' }
  }

  // Attendees arrive as repeated `attendee` fields, each "personId:role".
  const ownNoVis = await ownershipNoVisibility()
  const attendees = formData
    .getAll('attendee')
    .map(String)
    .map((entry) => {
      const [personId, role] = entry.split(':')
      return { personId, role: role ?? 'contributor' }
    })
    .filter(
      (a): a is { personId: string; role: string } =>
        Boolean(a.personId) && (ATTENDEE_ROLES as readonly string[]).includes(a.role),
    )

  if (attendees.length > 0) {
    await supabase.from('meeting_attendees').insert(
      attendees.map((a) => ({
        ...ownNoVis,
        meeting_id: meeting.id,
        person_id: a.personId,
        role: a.role as (typeof ATTENDEE_ROLES)[number],
      })),
    )
  }

  await track('meeting_created', {
    kind: v.kind,
    importance: v.importance,
    attendees: attendees.length,
    hasObjective: Boolean(v.objective),
  })

  revalidatePath('/meetings')
  revalidatePath('/today')
  redirect(`/meetings/${meeting.id}/brief`)
}

export async function updateMeetingObjective(
  _prev: MeetingState,
  formData: FormData,
): Promise<MeetingState> {
  const meetingId = formData.get('meetingId')?.toString()
  if (!meetingId) return { error: 'Missing meeting.' }

  const objective = formData.get('objective')?.toString().trim().slice(0, 2000) || null
  const stakes = formData.get('stakes')?.toString().trim().slice(0, 2000) || null

  const user = await requireUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from('meetings')
    .update({ objective, stakes })
    .eq('id', meetingId)
    .eq('user_id', user.id)

  if (error) return { error: 'We could not save that.' }

  revalidatePath(`/meetings/${meetingId}`)
  return { message: 'Saved.' }
}

/**
 * Generate the meeting brief.
 *
 * The whole brief is persisted as one artifact together with the citations that
 * produced it, so "why is Atturel recommending this" reads from stored rows rather
 * than being reconstructed later.
 */
export async function generateBrief(meetingId: string) {
  const capability = await checkCapability('meetingBrief', 'meeting_brief')
  if (!capability.allowed) {
    return { ok: false as const, error: capability.message, upgrade: true as const }
  }

  const user = await requireUser()
  const supabase = await createClient()
  const own = await ownership()

  const meeting = await getMeetingContext(supabase, user.id, meetingId)
  if (!meeting) return { ok: false as const, error: 'That meeting could not be found.' }

  const userContext = await getUserContext(supabase, user.id)

  try {
    const generation = await runPrompt(meetingBriefPrompt, { meeting, user: userContext })

    const { data: artifact, error } = await supabase
      .from('ai_artifacts')
      .insert({
        ...own,
        kind: 'meeting_brief',
        subject_kind: 'meeting',
        subject_id: meetingId,
        content: generation.output as never,
        prompt_version: generation.provenance.promptVersion,
        provider: generation.provenance.provider,
        model: generation.provenance.model,
        grounded_fallback: generation.provenance.groundedFallback,
        latency_ms: generation.provenance.latencyMs,
        token_usage: generation.provenance.tokenUsage as never,
      })
      .select('id')
      .single()

    if (error || !artifact) {
      logger.error('brief.persist_failed', { code: error?.code })
      return { ok: false as const, error: 'The brief could not be saved.' }
    }

    // Record the evidence this brief was built from.
    if (generation.citations.length > 0) {
      const ownNoVis = await ownershipNoVisibility()
      await supabase.from('artifact_sources').insert(
        generation.citations.slice(0, 60).map((citation) => ({
          ...ownNoVis,
          artifact_id: artifact.id,
          observation_id: citation.observationId ?? null,
          interaction_id: citation.interactionId ?? null,
          commitment_id: citation.commitmentId ?? null,
          person_id: citation.personId ?? null,
          label: citation.label.slice(0, 400),
          evidence_level: citation.evidenceLevel,
        })),
      )
    }

    await recordUsage({
      meter: 'meeting_brief',
      subjectKind: 'meeting',
      subjectId: meetingId,
      provider: generation.provenance.provider,
      model: generation.provenance.model,
      inputTokens: generation.provenance.tokenUsage?.input,
      outputTokens: generation.provenance.tokenUsage?.output,
    })

    await track('meeting_prepared', {
      participants: meeting.participants.length,
      grounded: generation.provenance.groundedFallback,
      hasObjective: Boolean(meeting.objective),
    })

    revalidatePath(`/meetings/${meetingId}`)
    revalidatePath('/today')
    return { ok: true as const, artifactId: artifact.id }
  } catch (error) {
    logger.error('brief.generate_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
    return { ok: false as const, error: 'The brief could not be generated. Try again.' }
  }
}

// =============================================================================
// DEBRIEF
// =============================================================================

const debriefSchema = z.object({
  meetingId: z.string().uuid(),
  notes: z.string().trim().min(10, 'Write a few lines about what happened.').max(200_000),
  wentWell: z.coerce.number().int().min(1).max(5).optional(),
})

/**
 * Debrief a meeting: turn raw notes into structure, and propose what is worth
 * remembering about each person. Proposals are written as `proposed`
 * observations — inert until the user accepts them.
 */
export async function debriefMeeting(_prev: MeetingState, formData: FormData): Promise<MeetingState> {
  const raw = formData.get('wentWell')?.toString()
  const parsed = debriefSchema.safeParse({
    meetingId: formData.get('meetingId'),
    notes: formData.get('notes'),
    wentWell: raw ? Number(raw) : undefined,
  })

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  const capability = await checkCapability('debrief', 'transcript_analysis')
  if (!capability.allowed) return { error: capability.message }

  const user = await requireUser()
  const supabase = await createClient()
  const own = await ownership()
  const ownNoVis = await ownershipNoVisibility()
  const v = parsed.data

  const meeting = await getMeetingContext(supabase, user.id, v.meetingId)
  if (!meeting) return { error: 'That meeting could not be found.' }

  const userContext = await getUserContext(supabase, user.id)
  const occurredAt = meeting.scheduledAt ?? new Date().toISOString()

  // Record the interaction itself first: it is the anchor everything else
  // attaches to, and it must exist even if extraction fails.
  const { data: interaction, error: interactionError } = await supabase
    .from('interactions')
    .insert({
      ...own,
      meeting_id: v.meetingId,
      kind: 'meeting',
      title: meeting.title,
      occurred_at: occurredAt,
      raw_notes: v.notes,
      went_well: v.wentWell ?? null,
    })
    .select('id')
    .single()

  if (interactionError || !interaction) {
    logger.error('debrief.interaction_failed', { code: interactionError?.code })
    return { error: 'We could not save that debrief.' }
  }

  for (const participant of meeting.participants) {
    await supabase.from('interaction_participants').insert({
      ...ownNoVis,
      interaction_id: interaction.id,
      person_id: participant.id,
    })
    await supabase
      .from('people')
      .update({ last_interaction_at: occurredAt })
      .eq('id', participant.id)
      .eq('user_id', user.id)
  }

  try {
    const generation = await runPrompt(debriefPrompt, {
      user: userContext,
      participants: meeting.participants,
      interaction: {
        id: interaction.id,
        title: meeting.title,
        occurredAt,
        source: v.notes,
        wentWell: v.wentWell ?? null,
      },
      priorObjective: meeting.objective,
    })

    const output = generation.output

    await supabase
      .from('interactions')
      .update({ summary: output.summary, outcome: output.outcome })
      .eq('id', interaction.id)
      .eq('user_id', user.id)

    const validPersonIds = new Set(meeting.participants.map((p) => p.id))

    // Commitments extracted from the notes. normaliseCommitment is what keeps a
    // model's answer from reaching the database unchecked - see its comment.
    for (const commitment of output.commitments.slice(0, 8)) {
      const safe = normaliseCommitment(commitment, validPersonIds)

      const { error: commitmentError } = await supabase.from('commitments').insert({
        ...own,
        description: safe.description,
        owner: safe.owner,
        owner_person_id: safe.ownerPersonId,
        person_id: safe.ownerPersonId ?? meeting.participants[0]?.id ?? null,
        interaction_id: interaction.id,
        meeting_id: v.meetingId,
        due_on: safe.dueOn,
      })

      if (commitmentError) {
        // Losing a commitment is losing the thing the user most needs to
        // remember. It must not fail quietly again.
        logger.warn('debrief.commitment_insert_failed', {
          meetingId: v.meetingId,
          code: commitmentError.code,
        })
      }
    }

    // Memory proposals — inert until the user accepts them.
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
        })
        .select('id')
        .single()

      if (observation) {
        await supabase.from('observation_sources').insert({
          ...ownNoVis,
          observation_id: observation.id,
          interaction_id: interaction.id,
          excerpt: proposal.excerpt,
        })
      }
    }

    await supabase.from('ai_artifacts').insert({
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
    })

    await supabase
      .from('meetings')
      .update({ status: 'completed' })
      .eq('id', v.meetingId)
      .eq('user_id', user.id)

    await recordUsage({
      meter: 'transcript_analysis',
      subjectKind: 'interaction',
      subjectId: interaction.id,
      provider: generation.provenance.provider,
      model: generation.provenance.model,
      inputTokens: generation.provenance.tokenUsage?.input,
      outputTokens: generation.provenance.tokenUsage?.output,
    })

    await track('meeting_debriefed', {
      commitments: output.commitments.length,
      proposals: output.proposedMemories.length,
      grounded: generation.provenance.groundedFallback,
    })
  } catch (error) {
    logger.error('debrief.extract_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
    // The interaction is saved regardless — the user's notes are never lost.
    return {
      message:
        'Your notes are saved, but the automatic extraction did not run. You can still add what you learned by hand.',
    }
  }

  revalidatePath(`/meetings/${v.meetingId}`)
  revalidatePath('/today')
  redirect(`/meetings/${v.meetingId}?debriefed=1`)
}
