'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile, requireUser } from '@/lib/auth'
import { ownership } from '@/lib/workspace'
import { transitionLoop, type LoopAction } from '@/lib/conversations/loops'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'

/**
 * OPEN LOOP ACTIONS
 * =============================================================================
 * Done, Later, Cancel, Reopen. One tap each. Nothing here asks a question
 * back, because the moment somebody presses Done on a phone between meetings
 * is not the moment for a dialog.
 * =============================================================================
 */

export interface LoopState {
  ok?: boolean
  error?: string
  message?: string
  fieldErrors?: Record<string, string[]>
}

const ACTIONS: LoopAction[] = ['done', 'later', 'cancel', 'reopen']

export async function setLoopStatus(loopId: string, action: LoopAction): Promise<LoopState> {
  if (!ACTIONS.includes(action)) return { error: 'Unknown action.' }

  const user = await requireUser()
  const profile = await getProfile()
  const supabase = await createClient()

  const { data: loop } = await supabase
    .from('commitments')
    .select('id, person_id, interaction_id, status')
    .eq('id', loopId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!loop) return { error: 'That loop could not be found.' }

  const patch = transitionLoop(action, {
    now: new Date(),
    timeZone: profile?.timezone ?? 'UTC',
  })

  const { error } = await supabase
    .from('commitments')
    .update(patch)
    .eq('id', loopId)
    .eq('user_id', user.id)

  if (error) {
    logger.warn('loop.transition_failed', { action, code: error.code })
    return { error: 'That could not be saved. Try again.' }
  }

  await track('loop_status_changed', { action, from: loop.status })

  revalidatePath('/loops')
  revalidatePath('/today')
  if (loop.person_id) revalidatePath(`/people/${loop.person_id}`)
  if (loop.interaction_id) revalidatePath(`/conversations/${loop.interaction_id}`)

  return { ok: true }
}

const addSchema = z.object({
  description: z.string().trim().min(1, 'What is open?').max(500),
  kind: z.enum(['commitment', 'question', 'follow_up']).catch('commitment'),
  owner: z.enum(['user', 'person', 'shared']).catch('user'),
  personId: z.union([z.string().uuid(), z.literal('')]).optional(),
  dueOn: z.string().trim().optional(),
  interactionId: z.union([z.string().uuid(), z.literal('')]).optional(),
})

/**
 * A loop the user types themselves. Confirmed on arrival: they wrote it, so
 * there is nothing to review.
 */
export async function addLoop(_prev: LoopState, formData: FormData): Promise<LoopState> {
  const parsed = addSchema.safeParse({
    description: formData.get('description'),
    kind: formData.get('kind') ?? 'commitment',
    owner: formData.get('owner') ?? 'user',
    personId: formData.get('personId') || undefined,
    dueOn: formData.get('dueOn') || undefined,
    interactionId: formData.get('interactionId') || undefined,
  })
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors }

  const v = parsed.data
  const user = await requireUser()
  const supabase = await createClient()
  const own = await ownership()

  let personId: string | null = null
  if (v.personId) {
    const { data: person } = await supabase
      .from('people')
      .select('id, archived_at')
      .eq('id', v.personId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!person) return { error: 'That person could not be found.' }
    // An archived person is out of every new workflow until restored.
    if (person.archived_at) return { error: 'Restore them first to add a loop with them.' }
    personId = person.id
  }

  const dueOn = v.dueOn && /^\d{4}-\d{2}-\d{2}$/.test(v.dueOn) ? v.dueOn : null

  const { error } = await supabase.from('commitments').insert({
    ...own,
    description: v.description,
    kind: v.kind,
    owner: v.owner,
    owner_person_id: v.owner === 'person' ? personId : null,
    person_id: personId,
    interaction_id: v.interactionId || null,
    due_on: dueOn,
    review_status: 'confirmed',
    reviewed_at: new Date().toISOString(),
    status: 'open',
  })

  if (error) {
    logger.warn('loop.add_failed', { code: error.code })
    return { error: 'We could not save that.' }
  }

  await track('loop_added', { kind: v.kind, owner: v.owner, dated: Boolean(dueOn) })

  revalidatePath('/loops')
  revalidatePath('/today')
  if (personId) revalidatePath(`/people/${personId}`)
  if (v.interactionId) revalidatePath(`/conversations/${v.interactionId}`)
  return { ok: true, message: 'Added.' }
}

const textSchema = z.string().trim().min(1, 'What is open?').max(500)

/**
 * Change what a loop says. Used where a loop's words matter on their own --
 * before deleting a person, a retained loop that names them can be reworded
 * so it no longer identifies them.
 */
export async function editLoopText(loopId: string, description: string): Promise<LoopState> {
  const parsed = textSchema.safeParse(description)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the text.' }

  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('commitments')
    .update({ description: parsed.data })
    .eq('id', loopId)
    .eq('user_id', user.id)
    .select('id, person_id')
    .maybeSingle()

  if (error || !data) {
    if (error) logger.warn('loop.edit_failed', { code: error.code })
    return { error: 'That loop could not be changed.' }
  }

  await track('loop_text_edited')
  revalidatePath('/loops')
  revalidatePath('/today')
  if (data.person_id) revalidatePath(`/people/${data.person_id}`)
  return { ok: true, message: 'Saved.' }
}

/** Delete a loop outright. A brief that cited it keeps its text; the citation is cleared. */
export async function deleteLoop(loopId: string): Promise<LoopState> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('commitments')
    .delete()
    .eq('id', loopId)
    .eq('user_id', user.id)
    .select('id, person_id')
    .maybeSingle()

  if (error || !data) {
    if (error) logger.warn('loop.delete_failed', { code: error.code })
    return { error: 'That loop could not be deleted.' }
  }

  await track('loop_deleted')
  revalidatePath('/loops')
  revalidatePath('/today')
  if (data.person_id) revalidatePath(`/people/${data.person_id}`)
  return { ok: true, message: 'Deleted.' }
}
