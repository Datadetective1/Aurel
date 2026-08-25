'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'
import { ownership } from '@/lib/workspace'
import { checkCapability, recordUsage } from '@/lib/billing/entitlements'
import { askCoach, type CoachAnswer } from '@/lib/ai/coach'
import { getPersonContext, getUserContext } from '@/lib/ai/context'
import { runPrompt } from '@/lib/ai/provider'
import {
  ADAPTATION_MODES,
  messageAdaptationPrompt,
  type MessageAdaptation,
} from '@/lib/ai/prompts/message-adaptation'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'

export interface CoachState {
  answer?: CoachAnswer
  question?: string
  error?: string
}

const questionSchema = z.string().trim().min(2, 'Ask a question.').max(2000)

export async function ask(_prev: CoachState, formData: FormData): Promise<CoachState> {
  const parsed = questionSchema.safeParse(formData.get('question'))
  if (!parsed.success) return { error: 'Ask a question first.' }

  const capability = await checkCapability('aiCoach', 'ai_coach_message')
  if (!capability.allowed) return { error: capability.message }

  const user = await requireUser()
  const supabase = await createClient()

  try {
    const answer = await askCoach(supabase, user.id, parsed.data)

    await recordUsage({ meter: 'ai_coach_message' })
    await track('coach_used', { grounded: answer.grounded, citations: answer.citations.length })

    return { answer, question: parsed.data }
  } catch (error) {
    logger.error('coach.ask_failed', { error: error instanceof Error ? error.name : 'unknown' })
    return { error: 'Something went wrong. Try again.' }
  }
}

// =============================================================================
// MESSAGE ADAPTATION
// =============================================================================

export interface AdaptState {
  result?: MessageAdaptation
  mode?: string
  recipientName?: string | null
  grounded?: boolean
  error?: string
}

const adaptSchema = z.object({
  draft: z.string().trim().min(5, 'Paste a draft first.').max(20_000),
  mode: z.enum(ADAPTATION_MODES).catch('recipient'),
  personId: z.union([z.string().uuid(), z.literal('')]).optional(),
  format: z.string().trim().max(40).catch('message'),
})

export async function adaptMessage(_prev: AdaptState, formData: FormData): Promise<AdaptState> {
  const parsed = adaptSchema.safeParse({
    draft: formData.get('draft'),
    mode: formData.get('mode') ?? 'recipient',
    personId: formData.get('personId') || undefined,
    format: formData.get('format') ?? 'message',
  })

  if (!parsed.success) {
    return { error: z.flattenError(parsed.error).fieldErrors.draft?.[0] ?? 'Check the draft.' }
  }

  const capability = await checkCapability('messageAdaptation', 'message_adaptation')
  if (!capability.allowed) return { error: capability.message }

  const user = await requireUser()
  const supabase = await createClient()
  const own = await ownership()

  try {
    const [userContext, recipient] = await Promise.all([
      getUserContext(supabase, user.id),
      parsed.data.personId
        ? getPersonContext(supabase, user.id, parsed.data.personId)
        : Promise.resolve(null),
    ])

    const generation = await runPrompt(messageAdaptationPrompt, {
      user: userContext,
      recipient,
      mode: parsed.data.mode,
      draft: parsed.data.draft,
      format: parsed.data.format,
    })

    await supabase.from('ai_artifacts').insert({
      ...own,
      kind: 'message_adaptation',
      subject_kind: recipient ? 'person' : 'none',
      subject_id: recipient?.id ?? null,
      content: generation.output as never,
      prompt_version: generation.provenance.promptVersion,
      provider: generation.provenance.provider,
      model: generation.provenance.model,
      grounded_fallback: generation.provenance.groundedFallback,
      latency_ms: generation.provenance.latencyMs,
    })

    await recordUsage({
      meter: 'message_adaptation',
      subjectKind: recipient ? 'person' : undefined,
      subjectId: recipient?.id,
    })
    await track('message_adapted', {
      mode: parsed.data.mode,
      hasRecipient: Boolean(recipient),
      grounded: generation.provenance.groundedFallback,
    })

    revalidatePath('/coach')

    return {
      result: generation.output,
      mode: parsed.data.mode,
      recipientName: recipient?.displayName ?? null,
      grounded: generation.provenance.groundedFallback,
    }
  } catch (error) {
    logger.error('adapt.failed', { error: error instanceof Error ? error.name : 'unknown' })
    return { error: 'That could not be adapted. Try again.' }
  }
}
