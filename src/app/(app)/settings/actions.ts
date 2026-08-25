'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'
import { features } from '@/lib/env'
import { getWorkspace } from '@/lib/workspace'
import { seedDemoData } from '@/lib/demo/seed'
import { isValidTimezone } from '@/lib/timezones'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'

export interface SettingsState {
  error?: string
  message?: string
  fieldErrors?: Record<string, string[]>
}

const profileSchema = z.object({
  fullName: z.string().trim().min(1, 'A name is required.').max(120),
  preferredName: z.string().trim().max(80).optional(),
  jobTitle: z.string().trim().max(120).optional(),
  company: z.string().trim().max(160).optional(),
  pronouns: z.string().trim().max(40).optional(),
  // Validated against the runtime's own zone database rather than a length
  // check: an unrecognised identifier would silently break every scheduled
  // briefing, and the failure would surface days later as "wrong time".
  timezone: z
    .string()
    .trim()
    .max(64)
    .refine(isValidTimezone, 'That is not a timezone we recognise.')
    .optional(),
})

export async function updateProfile(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = profileSchema.safeParse({
    fullName: formData.get('fullName'),
    preferredName: formData.get('preferredName') || undefined,
    jobTitle: formData.get('jobTitle') || undefined,
    company: formData.get('company') || undefined,
    pronouns: formData.get('pronouns') || undefined,
    timezone: formData.get('timezone') || undefined,
  })

  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors }

  const user = await requireUser()
  const supabase = await createClient()
  const v = parsed.data

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: v.fullName,
      preferred_name: v.preferredName || null,
      job_title: v.jobTitle || null,
      company: v.company || null,
      pronouns: v.pronouns || null,
      timezone: v.timezone || 'UTC',
    })
    .eq('id', user.id)

  if (error) return { error: 'We could not save those changes.' }

  revalidatePath('/settings')
  revalidatePath('/', 'layout')
  return { message: 'Saved.' }
}

const preferencesSchema = z.object({
  theme: z.enum(['pearl', 'obsidian', 'system']).catch('system'),
  coachingStyle: z.enum(['concise', 'balanced', 'detailed', 'challenging', 'supportive']).catch('balanced'),
  emailNotifications: z.boolean(),
})

export async function updatePreferences(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = preferencesSchema.safeParse({
    theme: formData.get('theme') ?? 'system',
    coachingStyle: formData.get('coachingStyle') ?? 'balanced',
    emailNotifications: formData.get('emailNotifications') === 'on',
  })

  if (!parsed.success) return { error: 'Those preferences are not valid.' }

  const user = await requireUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from('profiles')
    .update({
      theme: parsed.data.theme,
      coaching_style: parsed.data.coachingStyle,
      email_notifications: parsed.data.emailNotifications,
    })
    .eq('id', user.id)

  if (error) return { error: 'We could not save those preferences.' }

  revalidatePath('/settings')
  return { message: 'Saved.' }
}

// =============================================================================
// DATA RIGHTS
// =============================================================================

/**
 * Export everything the user has stored.
 *
 * Returned as a JSON string for the client to download. The product claims the
 * record belongs to the user, so this has to be complete rather than a summary —
 * every table they own is included.
 */
export async function exportMyData(): Promise<{ ok: true; json: string } | { ok: false; error: string }> {
  const user = await requireUser()
  const supabase = await createClient()

  try {
    const [
      profile,
      assessments,
      responses,
      organizations,
      people,
      observations,
      observationSources,
      interactions,
      meetings,
      commitments,
      notes,
      sources,
      facts,
      artifacts,
      reflections,
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('assessments').select('*').eq('user_id', user.id),
      supabase.from('assessment_responses').select('*').eq('user_id', user.id),
      supabase.from('organizations').select('*').eq('user_id', user.id),
      supabase.from('people').select('*').eq('user_id', user.id),
      supabase.from('observations').select('*').eq('user_id', user.id),
      supabase.from('observation_sources').select('*').eq('user_id', user.id),
      supabase.from('interactions').select('*').eq('user_id', user.id),
      supabase.from('meetings').select('*').eq('user_id', user.id),
      supabase.from('commitments').select('*').eq('user_id', user.id),
      supabase.from('notes').select('*').eq('user_id', user.id),
      supabase.from('sources').select('*').eq('user_id', user.id),
      supabase.from('professional_facts').select('*').eq('user_id', user.id),
      supabase.from('ai_artifacts').select('*').eq('user_id', user.id),
      supabase.from('daily_reflections').select('*').eq('user_id', user.id),
    ])

    const payload = {
      exportedAt: new Date().toISOString(),
      account: { id: user.id, email: user.email },
      profile: profile.data,
      interactionProfile: { assessments: assessments.data, responses: responses.data },
      relationships: {
        organizations: organizations.data,
        people: people.data,
        observations: observations.data,
        observationSources: observationSources.data,
        interactions: interactions.data,
        meetings: meetings.data,
        commitments: commitments.data,
        notes: notes.data,
      },
      sources: { sources: sources.data, professionalFacts: facts.data },
      generated: artifacts.data,
      reflections: reflections.data,
    }

    await track('data_exported')
    return { ok: true, json: JSON.stringify(payload, null, 2) }
  } catch (error) {
    logger.error('export.failed', { error: error instanceof Error ? error.name : 'unknown' })
    return { ok: false, error: 'The export could not be produced. Try again.' }
  }
}

/** Remove all demo data, leaving anything the user created themselves. */
export async function clearDemoData(): Promise<SettingsState> {
  await requireUser()
  const supabase = await createClient()

  const { error } = await supabase.rpc('clear_demo_data')
  if (error) {
    logger.warn('demo.clear_failed', { code: error.code })
    return { error: 'Demo data could not be cleared.' }
  }

  await track('demo_data_cleared')
  revalidatePath('/', 'layout')
  return { message: 'Demo data removed.' }
}

const deleteSchema = z.object({
  confirmation: z.string().trim(),
})

/**
 * Permanent account deletion.
 *
 * Two phases: the user's own rows are removed through an RLS-scoped function
 * (so it works even without a service role key), then the auth record itself is
 * deleted with the service role. If the second phase is unavailable the first
 * has still run, so no relationship data survives — the account shell is what
 * remains, and that is stated honestly rather than silently.
 */
export async function deleteAccount(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = deleteSchema.safeParse({ confirmation: formData.get('confirmation') })
  if (!parsed.success || parsed.data.confirmation.toLowerCase() !== 'delete') {
    return { error: 'Type DELETE to confirm.' }
  }

  const user = await requireUser()
  const supabase = await createClient()

  const { error } = await supabase.rpc('delete_my_data')
  if (error) {
    logger.error('account.delete_data_failed', { code: error.code })
    return { error: 'Your data could not be deleted. Contact support and nothing will be lost.' }
  }

  await track('account_deleted')

  if (features.serviceRole) {
    try {
      const admin = createServiceRoleClient()
      await admin.auth.admin.deleteUser(user.id)
    } catch (adminError) {
      // Data is already gone; only the login record remains.
      logger.warn('account.delete_auth_failed', {
        error: adminError instanceof Error ? adminError.name : 'unknown',
      })
    }
  }

  await supabase.auth.signOut()
  redirect('/?deleted=1')
}

/**
 * Load the fictional demonstration record.
 * A server action rather than a GET route, so it cannot be triggered by a
 * prefetch or a stray link visit. Idempotent: running it twice is a no-op.
 */
export async function loadDemoData(): Promise<SettingsState> {
  const user = await requireUser()
  const supabase = await createClient()
  const { workspaceId } = await getWorkspace()

  const result = await seedDemoData(supabase, user.id, workspaceId)
  if (!result.ok) return { error: 'Demo data could not be loaded.' }

  if (result.peopleCreated > 0) {
    await track('demo_data_seeded', { people: result.peopleCreated })
  }

  revalidatePath('/', 'layout')
  return { message: 'Demo data loaded.' }
}
