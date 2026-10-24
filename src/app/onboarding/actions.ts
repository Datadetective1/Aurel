'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { isValidTimezone } from '@/lib/timezones'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import { getProfile, requireUser } from '@/lib/auth'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import {
  COACHING_CONTEXTS,
  FRAMEWORKS,
  INTENTS,
  nextEnrichmentStep,
  stepPath,
  type EnrichmentStep,
  type StepState,
} from '@/lib/onboarding'

/**
 * Onboarding server actions.
 *
 * One required step -- who you are -- and it ends onboarding. Everything after
 * it is optional tailoring (see ENRICHMENT_STEPS), reachable from Today and
 * Settings, skippable as a group, and saved step by step so nothing answered
 * is lost by stopping.
 */

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

/** The patch that marks onboarding done, applied only if it is not already. */
async function completionPatch(): Promise<ProfileUpdate> {
  const profile = await getProfile()
  return profile?.onboarding_completed_at
    ? {}
    : { onboarding_stage: 'done', onboarding_completed_at: new Date().toISOString() }
}

/**
 * Save a tailoring step and move to the next one, or back to Today after the
 * last. An account still parked in the old flow is completed on the way: it
 * has necessarily passed the identity step already.
 */
async function advanceEnrichment(current: EnrichmentStep, patch: ProfileUpdate = {}) {
  const user = await requireUser()
  const supabase = await createClient()
  const next = nextEnrichmentStep(current)

  const { error } = await supabase
    .from('profiles')
    .update({ ...patch, ...(await completionPatch()) })
    .eq('id', user.id)

  if (error) {
    logger.error('onboarding.update_failed', { step: current, code: error.code })
    return { error: 'We could not save that. Try again.' } satisfies StepState
  }

  revalidatePath('/', 'layout')
  redirect(next ? stepPath(next) : '/today')
}

/**
 * Leave the tailoring steps from wherever you are. Nothing already answered is
 * touched; the steps stay available from Settings.
 */
export async function finishOnboardingLater(): Promise<void> {
  const user = await requireUser()
  const patch = await completionPatch()
  if (Object.keys(patch).length > 0) {
    const supabase = await createClient()
    await supabase.from('profiles').update(patch).eq('id', user.id)
    await track('onboarding_completed', { path: 'deferred' })
  }
  await track('onboarding_enrichment_deferred', {})
  revalidatePath('/', 'layout')
  redirect('/today')
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
  // Validated against the runtime's zone database, not just a length: an
  // unrecognised identifier would silently misorder someone's entire day.
  timezone: z
    .string()
    .trim()
    .max(64)
    .refine((v) => v === '' || isValidTimezone(v), 'That is not a timezone we recognize.')
    .optional()
    .or(z.literal('')),
})

export async function saveAbout(_prev: StepState, formData: FormData): Promise<StepState> {
  const result = await saveAboutCore(formData)
  if (!result.ok) return result
  redirect('/today?welcome=1')
}

/**
 * The one required step, without the navigation. The web goes to Today; the
 * native app (`POST /api/mobile/onboarding`) does the same on the phone.
 */
export async function saveAboutCore(formData: FormData): Promise<StepState & { ok?: boolean }> {
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
  const user = await requireUser()
  const supabase = await createClient()
  const completion = await completionPatch()

  // The one required step, so it is also the last. The account goes straight
  // to Today; goals, past assessments, coaching context and the Interaction
  // Profile are offered later, once there is something to tailor.
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: v.fullName,
      preferred_name: v.preferredName || null,
      job_title: v.jobTitle || null,
      company: v.company || null,
      job_function: v.jobFunction || null,
      seniority: v.seniority || null,
      pronouns: v.pronouns || null,
      timezone: v.timezone || 'UTC',
      ...completion,
    })
    .eq('id', user.id)

  if (error) {
    logger.error('onboarding.update_failed', { step: 'about', code: error.code })
    return { error: 'We could not save that. Try again.' }
  }

  if (Object.keys(completion).length > 0) {
    await track('onboarding_profile_completed')
    await track('onboarding_completed', { path: 'fast' })
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

// --- Step: intent -------------------------------------------------------------

const intentValues = INTENTS.map((i) => i.value)

export async function saveIntent(_prev: StepState, formData: FormData): Promise<StepState> {
  const raw = formData.getAll('intents').map(String)
  const intents = raw.filter((v) => (intentValues as readonly string[]).includes(v)).slice(0, 4)
  const result = await advanceEnrichment('intent', { intents })
  return result ?? {}
}

// --- Step: prior frameworks ---------------------------------------------------

const frameworkValues = FRAMEWORKS.map((f) => f.value)

export async function saveFrameworks(_prev: StepState, formData: FormData): Promise<StepState> {
  const selected = formData
    .getAll('frameworks')
    .map(String)
    .filter((v) => (frameworkValues as readonly string[]).includes(v))

  // Stored as user-supplied context only. Atturel does not implement, validate or
  // claim any of these instruments — it just remembers what the user told us.
  const known: Record<string, { selected: true; result?: string }> = {}
  for (const value of selected) {
    if (value === 'none') continue
    const result = formData.get(`result_${value}`)?.toString().trim().slice(0, 120)
    known[value] = result ? { selected: true, result } : { selected: true }
  }

  const result = await advanceEnrichment('frameworks', { known_frameworks: known })
  return result ?? {}
}

// --- Step: coaching context ---------------------------------------------------

const coachingValues = COACHING_CONTEXTS.map((c) => c.value)

export async function saveCoaching(_prev: StepState, formData: FormData): Promise<StepState> {
  const context = formData
    .getAll('coaching')
    .map(String)
    .filter((v) => (coachingValues as readonly string[]).includes(v))

  const result = await advanceEnrichment('coaching', { coaching_context: context })
  return result ?? {}
}

// --- Step: appearance — retired ------------------------------------------------
//
// Theme and coaching style are no longer asked during onboarding. Both default
// in the database and both are owned by Settings → Appearance & voice, which
// has its own action; there is nothing here that screen cannot do, and it can
// do it once the user has seen the screens they are choosing between.

/** Let a user skip the assessment and enter the app; they can run it later. */
export async function skipAssessment() {
  const user = await requireUser()
  const patch = await completionPatch()
  if (Object.keys(patch).length > 0) {
    const supabase = await createClient()
    await supabase.from('profiles').update(patch).eq('id', user.id)
    await track('onboarding_completed', { skippedAssessment: true })
  }
  revalidatePath('/', 'layout')
  redirect('/today')
}
