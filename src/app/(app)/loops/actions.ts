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
      .select('id')
      .eq('id', v.personId)
      .eq('user_id', user.id)
      .maybeSingle()
    personId = person?.id ?? null
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
