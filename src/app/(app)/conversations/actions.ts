'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import { getProfile, requireUser } from '@/lib/auth'
import { ownership, ownershipNoVisibility } from '@/lib/workspace'
import { checkCapability } from '@/lib/billing/entitlements'
import { processConversation, touchPeopleWindows } from '@/lib/conversations/process'
import {
  attachPersonToConversation,
  detachPersonFromConversation,
} from '@/lib/conversations/attribution'
import { matchPerson } from '@/lib/conversations/speakers'
import {
  cleanTranscript,
  titleFromFileName,
  transcriptFormat,
} from '@/lib/conversations/transcript'
import { extractDocument } from '@/lib/sources/document'
import { formatDate } from '@/lib/format'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'

/**
 * CONVERSATION ACTIONS
 * =============================================================================
 * Capture, review, and remove. Everything here writes as the signed-in user
 * through the request-scoped client, so row level security applies on top of
 * the explicit user_id filters.
 *
 * Capture writes the interaction row FIRST and only then runs extraction. The
 * words the user gave us must survive whatever the model does with them.
 * =============================================================================
 */

export interface ConversationState {
  error?: string
  message?: string
  fieldErrors?: Record<string, string[]>
}

const SOURCE_KINDS = [
  'typed_notes',
  'voice_note',
  'uploaded_audio',
  'pasted_transcript',
  'uploaded_transcript',
  'meeting_recording',
  'imported',
] as const

const INTERACTION_KINDS = ['meeting', 'call', 'email', 'message', 'informal', 'other'] as const

const createSchema = z.object({
  title: z.string().trim().max(200).optional(),
  occurredAt: z.string().trim().optional(),
  kind: z.enum(INTERACTION_KINDS).catch('meeting'),
  sourceKind: z.enum(SOURCE_KINDS).catch('typed_notes'),
  source: z.string().trim().max(400_000).optional(),
  meetingId: z.union([z.string().uuid(), z.literal('')]).optional(),
  durationSeconds: z.coerce.number().int().min(0).max(86_400).optional(),
  wentWell: z.coerce.number().int().min(1).max(5).optional(),
  consent: z.string().optional(),
})

/**
 * Create a conversation from whatever the user brought: typed notes, a
 * transcript they pasted, a transcript file, or the text a recording became.
 * Audio itself never arrives here -- the transcription route turns it into
 * words in the browser's hands first, and those words are what is submitted.
 */
export async function createConversation(
  _prev: ConversationState,
  formData: FormData,
): Promise<ConversationState> {
  const raw = formData.get('wentWell')?.toString()
  const parsed = createSchema.safeParse({
    title: formData.get('title') || undefined,
    occurredAt: formData.get('occurredAt') || undefined,
    kind: formData.get('kind') ?? 'meeting',
    sourceKind: formData.get('sourceKind') ?? 'typed_notes',
    source: formData.get('source') || undefined,
    meetingId: formData.get('meetingId') || undefined,
    durationSeconds: formData.get('durationSeconds') || undefined,
    wentWell: raw ? Number(raw) : undefined,
    consent: formData.get('consent') || undefined,
  })

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  const capability = await checkCapability('debrief', 'transcript_analysis')
  if (!capability.allowed) return { error: capability.message }

  const v = parsed.data
  const user = await requireUser()
  const supabase = await createClient()
  const own = await ownership()
  const ownNoVis = await ownershipNoVisibility()

  // --- the words -----------------------------------------------------------------
  let text = v.source ?? ''
  let sourceKind = v.sourceKind
  let title = v.title ?? ''

  const file = formData.get('transcriptFile')
  if (file instanceof File && file.size > 0) {
    const format = transcriptFormat(file.name)
    if (format !== 'plain') {
      // Caption formats are text; the document reader would keep every
      // timestamp. Read them directly and strip the scaffolding.
      const body = await file.text()
      text = cleanTranscript(body, format)
    } else {
      const extracted = await extractDocument(file)
      if (!extracted.ok) return { fieldErrors: { transcriptFile: [extracted.message] } }
      text = cleanTranscript(extracted.text, 'plain')
    }
    sourceKind = 'uploaded_transcript'
    if (!title) title = titleFromFileName(file.name)
  }

  // A textarea submits CRLF. Stored as LF so the reader's line handling and
  // the transcript view see one line ending, not two.
  text = text.replace(/\r\n?/g, '\n').trim()
  if (text.length < 10) {
    return {
      fieldErrors: {
        source: ['Add a few lines about what happened, paste a transcript, or record one.'],
      },
    }
  }

  // Recordings of other people need the user to have told them. Asked, not
  // policed: the product cannot know, so it records that it asked.
  const isRecording = sourceKind === 'uploaded_audio' || sourceKind === 'meeting_recording'
  if (isRecording && v.consent !== 'yes') {
    return {
      fieldErrors: {
        consent: ['Confirm the people in the recording knew it was being recorded.'],
      },
    }
  }

  // --- when ----------------------------------------------------------------------
  let occurredAt = new Date()
  if (v.occurredAt) {
    const parsedDate = new Date(v.occurredAt)
    if (Number.isNaN(parsedDate.getTime())) {
      return { fieldErrors: { occurredAt: ['That date is not valid.'] } }
    }
    if (parsedDate.getTime() > Date.now() + 60_000) {
      return {
        fieldErrors: {
          occurredAt: ['That is in the future. Record a conversation once it has happened.'],
        },
      }
    }
    occurredAt = parsedDate
  }

  // --- who -----------------------------------------------------------------------
  const requested = [...new Set(formData.getAll('participant').map(String).filter(Boolean))]
  let participantIds: string[] = []
  if (requested.length > 0) {
    const { data: people } = await supabase
      .from('people')
      .select('id')
      .eq('user_id', user.id)
      .is('archived_at', null)
      .in('id', requested)
    participantIds = (people ?? []).map((p) => p.id)
  }

  // People who were there but were not on record until now. A name is all
  // that is needed; the rest of their page fills in later. A name that
  // already belongs to somebody links to them rather than making a second.
  const newNames = [
    ...new Set(
      formData
        .getAll('newParticipant')
        .map((v) => String(v).trim())
        .filter((v) => v.length >= 2),
    ),
  ].slice(0, 12)
  for (const name of newNames) {
    const person = await findOrCreatePerson(supabase, own, user.id, name)
    if (person && !participantIds.includes(person.id)) participantIds.push(person.id)
  }

  let meetingId: string | null = null
  let meetingTitle: string | null = null
  if (v.meetingId) {
    const { data: meeting } = await supabase
      .from('meetings')
      .select('id, title')
      .eq('user_id', user.id)
      .eq('id', v.meetingId)
      .maybeSingle()
    if (meeting) {
      meetingId = meeting.id
      meetingTitle = meeting.title
      if (participantIds.length === 0) {
        const { data: attendees } = await supabase
          .from('meeting_attendees')
          .select('person_id')
          .eq('user_id', user.id)
          .eq('meeting_id', meeting.id)
        participantIds = (attendees ?? []).map((a) => a.person_id)
      }
    }
  }

  if (!title) {
    const profile = await getProfile()
    title = meetingTitle ?? defaultTitle(sourceKind, occurredAt, profile?.timezone ?? 'UTC')
  }

  // --- the row, before anything clever ----------------------------------------------
  const isTranscript = sourceKind !== 'typed_notes' && sourceKind !== 'voice_note'

  const { data: interaction, error } = await supabase
    .from('interactions')
    .insert({
      ...own,
      meeting_id: meetingId,
      kind: v.kind,
      title: title.slice(0, 200),
      occurred_at: occurredAt.toISOString(),
      raw_notes: isTranscript ? null : text,
      transcript: isTranscript ? text : null,
      source_kind: sourceKind,
      processing_status: 'pending',
      duration_seconds: v.durationSeconds ?? null,
      went_well: v.wentWell ?? null,
      consent_confirmed: isRecording,
    })
    .select('id')
    .single()

  if (error || !interaction) {
    logger.error('conversation.create_failed', { code: error?.code })
    return { error: 'We could not save that conversation.' }
  }

  if (participantIds.length > 0) {
    await supabase.from('interaction_participants').insert(
      participantIds.map((personId) => ({
        ...ownNoVis,
        interaction_id: interaction.id,
        person_id: personId,
      })),
    )
    await touchPeopleWindows(supabase, user.id, participantIds, occurredAt.toISOString())
  }

  await track('conversation_created', {
    sourceKind,
    kind: v.kind,
    participants: participantIds.length,
    fromMeeting: Boolean(meetingId),
    words: Math.min(100_000, text.split(/\s+/).length),
  })

  // --- understanding ---------------------------------------------------------------------
  await processConversation(supabase, own, interaction.id)

  if (meetingId) {
    await supabase
      .from('meetings')
      .update({ status: 'completed' })
      .eq('id', meetingId)
      .eq('user_id', user.id)
  }

  revalidatePath('/conversations')
  revalidatePath('/today')
  revalidatePath('/loops')
  for (const id of participantIds) revalidatePath(`/people/${id}`)
  if (meetingId) revalidatePath(`/meetings/${meetingId}`)

  redirect(`/conversations/${interaction.id}?new=1`)
}

/**
 * The person a typed name refers to, creating them when nobody matches.
 *
 * An exact name match links the existing person: the user typed the same
 * name, and two records for one colleague is the failure the duplicate
 * review exists to undo. A merely probable match is NOT taken silently --
 * the picker shows it first and the user decides -- so by the time a name
 * reaches here as "new", the user has said it is somebody else.
 */
async function findOrCreatePerson(
  supabase: Awaited<ReturnType<typeof createClient>>,
  own: { user_id: string; workspace_id: string; visibility: 'private' | 'shared' },
  userId: string,
  name: string,
): Promise<{
  id: string
  fullName: string
  preferredName: string | null
  created: boolean
} | null> {
  const trimmed = name.trim().slice(0, 160)
  if (trimmed.length < 2) return null

  const { data: people } = await supabase
    .from('people')
    .select('id, full_name, preferred_name')
    .eq('user_id', userId)
    .is('archived_at', null)
    .limit(500)

  const match = matchPerson(
    trimmed,
    (people ?? []).map((p) => ({
      id: p.id,
      fullName: p.full_name,
      preferredName: p.preferred_name,
    })),
  )
  if (match.kind === 'exact') {
    return {
      id: match.person.id,
      fullName: match.person.fullName,
      preferredName: match.person.preferredName,
      created: false,
    }
  }

  const { data: created, error } = await supabase
    .from('people')
    .insert({ ...own, full_name: trimmed })
    .select('id, full_name, preferred_name')
    .single()
  if (error || !created) {
    logger.warn('conversation.person_create_failed', { code: error?.code })
    return null
  }
  await track('person_added', { source: 'conversation' })
  return {
    id: created.id,
    fullName: created.full_name,
    preferredName: created.preferred_name,
    created: true,
  }
}

function defaultTitle(
  sourceKind: (typeof SOURCE_KINDS)[number],
  when: Date,
  timeZone: string,
): string {
  const day = formatDate(when, timeZone)
  switch (sourceKind) {
    case 'voice_note':
      return `Voice note, ${day}`
    case 'uploaded_audio':
    case 'meeting_recording':
      return `Recording, ${day}`
    case 'pasted_transcript':
    case 'uploaded_transcript':
    case 'imported':
      return `Transcript, ${day}`
    default:
      return `Conversation, ${day}`
  }
}

// =============================================================================
// REVIEW
// =============================================================================

const reviewSchema = z.object({
  interactionId: z.string().uuid(),
})

/**
 * Apply the review panel in one submit.
 *
 * Every proposed loop and decision on the conversation is either confirmed
 * (its box was ticked, possibly with edited text and date) or rejected. A
 * proposal the user did not tick is a proposal the user read and declined --
 * silence is not consent, and leaving unticked rows as `proposed` would have
 * them resurface every visit.
 */
export async function submitReview(
  _prev: ConversationState,
  formData: FormData,
): Promise<ConversationState> {
  const parsed = reviewSchema.safeParse({ interactionId: formData.get('interactionId') })
  if (!parsed.success) return { error: 'Missing conversation.' }

  const user = await requireUser()
  const supabase = await createClient()
  const { interactionId } = parsed.data
  const now = new Date().toISOString()

  const [{ data: loops }, { data: decisions }] = await Promise.all([
    supabase
      .from('commitments')
      .select('id')
      .eq('user_id', user.id)
      .eq('interaction_id', interactionId)
      .eq('review_status', 'proposed'),
    supabase
      .from('decisions')
      .select('id')
      .eq('user_id', user.id)
      .eq('interaction_id', interactionId)
      .eq('review_status', 'proposed'),
  ])

  const keepLoops = new Set(formData.getAll('keepLoop').map(String))
  const keepDecisions = new Set(formData.getAll('keepDecision').map(String))

  let confirmed = 0
  let rejected = 0

  for (const loop of loops ?? []) {
    if (keepLoops.has(loop.id)) {
      const description = formData
        .get(`loop:${loop.id}:description`)
        ?.toString()
        .trim()
        .slice(0, 500)
      const owner = formData.get(`loop:${loop.id}:owner`)?.toString()
      const dueOn = formData.get(`loop:${loop.id}:dueOn`)?.toString().trim()
      const ownerPersonId = formData.get(`loop:${loop.id}:ownerPersonId`)?.toString().trim()

      const patch: Database['public']['Tables']['commitments']['Update'] = {
        review_status: 'confirmed',
        reviewed_at: now,
      }
      if (description) patch.description = description
      if (owner === 'user' || owner === 'person' || owner === 'shared') {
        patch.owner = owner
        patch.owner_person_id = owner === 'person' && ownerPersonId ? ownerPersonId : null
        if (owner === 'person' && ownerPersonId) patch.person_id = ownerPersonId
      }
      if (dueOn !== undefined) patch.due_on = /^\d{4}-\d{2}-\d{2}$/.test(dueOn) ? dueOn : null

      const { error } = await supabase
        .from('commitments')
        .update(patch)
        .eq('id', loop.id)
        .eq('user_id', user.id)
      if (!error) confirmed++
    } else {
      await supabase
        .from('commitments')
        .update({ review_status: 'rejected', reviewed_at: now })
        .eq('id', loop.id)
        .eq('user_id', user.id)
      rejected++
    }
  }

  let decisionsConfirmed = 0
  for (const decision of decisions ?? []) {
    if (keepDecisions.has(decision.id)) {
      const description = formData
        .get(`decision:${decision.id}:description`)
        ?.toString()
        .trim()
        .slice(0, 500)
      const patch: Database['public']['Tables']['decisions']['Update'] = {
        review_status: 'confirmed',
        reviewed_at: now,
      }
      if (description) patch.description = description
      const { error } = await supabase
        .from('decisions')
        .update(patch)
        .eq('id', decision.id)
        .eq('user_id', user.id)
      if (!error) decisionsConfirmed++
    } else {
      await supabase
        .from('decisions')
        .update({ review_status: 'rejected', reviewed_at: now })
        .eq('id', decision.id)
        .eq('user_id', user.id)
    }
  }

  await supabase
    .from('interactions')
    .update({ reviewed_at: now })
    .eq('id', interactionId)
    .eq('user_id', user.id)

  await track('conversation_review_completed', {
    loopsConfirmed: confirmed,
    loopsRejected: rejected,
    decisionsConfirmed,
    decisionsRejected: (decisions ?? []).length - decisionsConfirmed,
  })

  revalidatePath(`/conversations/${interactionId}`)
  revalidatePath('/conversations')
  revalidatePath('/loops')
  revalidatePath('/today')
  revalidatePath('/people')

  return {
    message:
      confirmed + decisionsConfirmed === 0
        ? 'Nothing kept. The conversation is on record; nothing was added to your loops.'
        : `Kept ${confirmed} ${confirmed === 1 ? 'loop' : 'loops'}${
            decisionsConfirmed > 0
              ? ` and ${decisionsConfirmed} ${decisionsConfirmed === 1 ? 'decision' : 'decisions'}`
              : ''
          }.`,
  }
}

/** Run extraction again, replacing proposals the user never acted on. */
export async function reprocessConversation(interactionId: string): Promise<ConversationState> {
  const capability = await checkCapability('debrief', 'transcript_analysis')
  if (!capability.allowed) return { error: capability.message }

  await requireUser()
  const supabase = await createClient()
  const own = await ownership()

  const result = await processConversation(supabase, own, interactionId)
  revalidatePath(`/conversations/${interactionId}`)
  return result.ok ? { message: 'Read again.' } : { error: result.error }
}

const retitleSchema = z.object({
  interactionId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
})

export async function retitleConversation(
  _prev: ConversationState,
  formData: FormData,
): Promise<ConversationState> {
  const parsed = retitleSchema.safeParse({
    interactionId: formData.get('interactionId'),
    title: formData.get('title'),
  })
  if (!parsed.success) return { error: 'Give it a title.' }

  const user = await requireUser()
  const supabase = await createClient()
  const { error } = await supabase
    .from('interactions')
    .update({ title: parsed.data.title })
    .eq('id', parsed.data.interactionId)
    .eq('user_id', user.id)
  if (error) return { error: 'That could not be saved.' }

  revalidatePath(`/conversations/${parsed.data.interactionId}`)
  revalidatePath('/conversations')
  return { message: 'Saved.' }
}

/**
 * Delete a conversation and everything it proposed.
 *
 * Decisions cascade from the interaction row. Loops and observations do not,
 * and that is deliberate: a confirmed loop or observation is part of the
 * user's record now, because the user chose it, and it survives with its
 * source link cleared. Proposals that were never accepted go with the
 * conversation, because their only basis was this text.
 */
export async function deleteConversation(interactionId: string): Promise<ConversationState> {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: sources } = await supabase
    .from('observation_sources')
    .select('observation_id')
    .eq('user_id', user.id)
    .eq('interaction_id', interactionId)

  const observationIds = (sources ?? []).map((s) => s.observation_id)
  if (observationIds.length > 0) {
    await supabase
      .from('observations')
      .delete()
      .eq('user_id', user.id)
      .eq('status', 'proposed')
      .in('id', observationIds)
  }

  // Unconfirmed loops have no basis once the words are gone.
  await supabase
    .from('commitments')
    .delete()
    .eq('user_id', user.id)
    .eq('interaction_id', interactionId)
    .neq('review_status', 'confirmed')

  const { data: participants } = await supabase
    .from('interaction_participants')
    .select('person_id')
    .eq('user_id', user.id)
    .eq('interaction_id', interactionId)

  const { error } = await supabase
    .from('interactions')
    .delete()
    .eq('id', interactionId)
    .eq('user_id', user.id)

  if (error) {
    logger.warn('conversation.delete_failed', { code: error.code })
    return { error: 'That conversation could not be deleted.' }
  }

  await track('conversation_deleted', {})

  revalidatePath('/conversations')
  revalidatePath('/loops')
  revalidatePath('/today')
  for (const p of participants ?? []) revalidatePath(`/people/${p.person_id}`)
  redirect('/conversations?deleted=1')
}

/** Attach a person to a conversation after the fact. Idempotent by key. */
export async function addConversationParticipant(
  interactionId: string,
  personId: string,
): Promise<ConversationState> {
  const user = await requireUser()
  const supabase = await createClient()
  const ownNoVis = await ownershipNoVisibility()

  const [{ data: interaction }, { data: person }] = await Promise.all([
    supabase
      .from('interactions')
      .select('id, occurred_at')
      .eq('id', interactionId)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('people')
      .select('id, full_name, preferred_name')
      .eq('id', personId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])
  if (!interaction) return { error: 'That conversation could not be found.' }
  if (!person) return { error: 'That person could not be found.' }

  const own = await ownership()
  try {
    await attachPersonToConversation(supabase, own, interactionId, {
      id: person.id,
      fullName: person.full_name,
      preferredName: person.preferred_name,
    })
  } catch (error) {
    logger.warn('conversation.participant_attach_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
    return { error: 'We could not add that person.' }
  }
  void ownNoVis

  revalidateAround(interactionId, [personId])
  return { message: 'Added.' }
}

/**
 * Add somebody who is not on record yet, by name, and attach them.
 *
 * The minimum: a name. Their page, photo and research can come later. What
 * this conversation extracted under their label becomes theirs at once.
 */
export async function createAndAttachParticipant(
  interactionId: string,
  name: string,
): Promise<ConversationState & { personId?: string; created?: boolean }> {
  const user = await requireUser()
  const supabase = await createClient()
  const own = await ownership()

  const { data: interaction } = await supabase
    .from('interactions')
    .select('id')
    .eq('id', interactionId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!interaction) return { error: 'That conversation could not be found.' }

  const person = await findOrCreatePerson(supabase, own, user.id, name)
  if (!person) return { error: 'Give them a name of at least two letters.' }

  await attachPersonToConversation(supabase, own, interactionId, person)
  await track('conversation_participant_added', { created: person.created })

  revalidateAround(interactionId, [person.id])
  return {
    message: person.created
      ? `${person.fullName} added.`
      : `Linked to ${person.preferredName || person.fullName}.`,
    personId: person.id,
    created: person.created,
  }
}

/**
 * Remove somebody from a conversation. What was filed under them moves to
 * the person named, to a new person, or to nobody -- never nowhere silently.
 */
export async function removeConversationParticipant(
  interactionId: string,
  personId: string,
  options: { moveToPersonId?: string | null; moveToNewName?: string | null } = {},
): Promise<ConversationState> {
  const user = await requireUser()
  const supabase = await createClient()
  const own = await ownership()

  const { data: interaction } = await supabase
    .from('interactions')
    .select('id')
    .eq('id', interactionId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!interaction) return { error: 'That conversation could not be found.' }

  let moveTo: { id: string; fullName: string; preferredName: string | null } | null = null
  if (options.moveToNewName) {
    moveTo = await findOrCreatePerson(supabase, own, user.id, options.moveToNewName)
  } else if (options.moveToPersonId) {
    const { data: target } = await supabase
      .from('people')
      .select('id, full_name, preferred_name')
      .eq('id', options.moveToPersonId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (target)
      moveTo = { id: target.id, fullName: target.full_name, preferredName: target.preferred_name }
  }

  await detachPersonFromConversation(supabase, own, interactionId, personId, moveTo)
  await track('conversation_participant_removed', { moved: Boolean(moveTo) })

  revalidateAround(interactionId, [personId, ...(moveTo ? [moveTo.id] : [])])
  return { message: moveTo ? `Moved to ${moveTo.preferredName || moveTo.fullName}.` : 'Removed.' }
}

function revalidateAround(interactionId: string, personIds: string[]) {
  revalidatePath(`/conversations/${interactionId}`)
  revalidatePath('/conversations')
  revalidatePath('/loops')
  revalidatePath('/today')
  revalidatePath('/people')
  for (const id of personIds) revalidatePath(`/people/${id}`)
}
