'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import {
  COACHING_CONTEXTS,
  FRAMEWORKS,
  INTENTS,
  nextStep,
  stepPath,
  type OnboardingStep,
  type StepState,
} from '@/lib/onboarding'

/**
 * Onboarding server actions.
 *
 * Each step writes what it collected and advances `onboarding_stage`, so a user
 * who closes the tab halfway through resumes exactly where they stopped rather
 * than starting again.
 */


async function advance(current: OnboardingStep, patch: Record<string, unknown> = {}) {
  const user = await requireUser()
  const supabase = await createClient()
  const next = nextStep(current)

  const { error } = await supabase
    .from('profiles')
    .update({ ...patch, onboarding_stage: next })
    .eq('id', user.id)

  if (error) {
    logger.error('onboarding.update_failed', { step: current, code: error.code })
    return { error: 'We could not save that. Try again.' } satisfies StepState
  }

  revalidatePath('/onboarding', 'layout')
  redirect(stepPath(next))
}

// --- Step: welcome ------------------------------------------------------------

/**
 * Plain form action, so it must resolve to void. A failure here is logged by
 * `advance` and simply leaves the user on the welcome screen to retry — there
 * is no field state to render on this step.
 */
export async function startOnboarding(): Promise<void> {
  await advance('welcome')
}

// --- Step: about you ----------------------------------------------------------

const aboutSchema = z.object({
  fullName: z.string().trim().min(1, 'Tell us what to call you.').max(120),
  preferredName: z.string().trim().max(80).optional().or(z.literal('')),
  jobTitle: z.string().trim().max(120).optional().or(z.literal('')),
  company: z.string().trim().max(160).optional().or(z.literal('')),
  jobFunction: z.string().trim().max(80).optional().or(z.literal('')),
  seniority: z.string().trim().max(80).optional().or(z.literal('')),
  pronouns: z.string().trim().max(40).optional().or(z.literal('')),
  timezone: z.string().trim().max(64).optional().or(z.literal('')),
})

export async function saveAbout(_prev: StepState, formData: FormData): Promise<StepState> {
  const parsed = aboutSchema.safeParse({
    fullName: formData.get('fullName'),
    preferredName: formData.get('preferredName'),
    jobTitle: formData.get('jobTitle'),
    company: formData.get('company'),
    jobFunction: formData.get('jobFunction'),
    seniority: formData.get('seniority'),
    pronouns: formData.get('pronouns'),
    timezone: formData.get('timezone'),
  })

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  const v = parsed.data
  const result = await advance('about', {
    full_name: v.fullName,
    preferred_name: v.preferredName || null,
    job_title: v.jobTitle || null,
    company: v.company || null,
    job_function: v.jobFunction || null,
    seniority: v.seniority || null,
    pronouns: v.pronouns || null,
    timezone: v.timezone || 'UTC',
  })
  return result ?? {}
}

// --- Step: intent -------------------------------------------------------------

const intentValues = INTENTS.map((i) => i.value)

export async function saveIntent(_prev: StepState, formData: FormData): Promise<StepState> {
  const raw = formData.getAll('intents').map(String)
  const intents = raw.filter((v) => (intentValues as readonly string[]).includes(v)).slice(0, 4)
  const result = await advance('intent', { intents })
  return result ?? {}
}

// --- Step: prior frameworks ---------------------------------------------------

const frameworkValues = FRAMEWORKS.map((f) => f.value)

export async function saveFrameworks(_prev: StepState, formData: FormData): Promise<StepState> {
  const selected = formData
    .getAll('frameworks')
    .map(String)
    .filter((v) => (frameworkValues as readonly string[]).includes(v))

  // Stored as user-supplied context only. Aurel does not implement, validate or
  // claim any of these instruments — it just remembers what the user told us.
  const known: Record<string, { selected: true; result?: string }> = {}
  for (const value of selected) {
    if (value === 'none') continue
    const result = formData.get(`result_${value}`)?.toString().trim().slice(0, 120)
    known[value] = result ? { selected: true, result } : { selected: true }
  }

  const result = await advance('frameworks', { known_frameworks: known })
  return result ?? {}
}

// --- Step: coaching context ---------------------------------------------------

const coachingValues = COACHING_CONTEXTS.map((c) => c.value)

export async function saveCoaching(_prev: StepState, formData: FormData): Promise<StepState> {
  const context = formData
    .getAll('coaching')
    .map(String)
    .filter((v) => (coachingValues as readonly string[]).includes(v))

  const result = await advance('coaching', { coaching_context: context })
  return result ?? {}
}

// --- Step: appearance ---------------------------------------------------------

const appearanceSchema = z.object({
  theme: z.enum(['pearl', 'obsidian', 'system']),
  coachingStyle: z.enum(['concise', 'balanced', 'detailed', 'challenging', 'supportive']),
})

export async function saveAppearance(_prev: StepState, formData: FormData): Promise<StepState> {
  const parsed = appearanceSchema.safeParse({
    theme: formData.get('theme') ?? 'system',
    coachingStyle: formData.get('coachingStyle') ?? 'balanced',
  })

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  await track('onboarding_profile_completed')

  const result = await advance('appearance', {
    theme: parsed.data.theme,
    coaching_style: parsed.data.coachingStyle,
  })
  return result ?? {}
}

/** Let a user skip the assessment and enter the app; they can run it later. */
export async function skipAssessment() {
  const user = await requireUser()
  const supabase = await createClient()
  await supabase
    .from('profiles')
    .update({ onboarding_stage: 'done', onboarding_completed_at: new Date().toISOString() })
    .eq('id', user.id)

  await track('onboarding_completed', { skippedAssessment: true })
  revalidatePath('/', 'layout')
  redirect('/today?welcome=1')
}
