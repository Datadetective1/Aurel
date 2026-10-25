'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { deleteCurrentAccount } from '@/lib/account/deletion.server'
import { getProfile, requireUser } from '@/lib/auth'
import { getWorkspace } from '@/lib/workspace'
import { seedDemoData } from '@/lib/demo/seed'
import { isValidTimezone } from '@/lib/timezones'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import { clearProfilePhoto, saveProfilePhoto } from '@/lib/people/photos.server'

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
    .refine(isValidTimezone, 'That is not a timezone we recognize.')
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
  coachingStyle: z
    .enum(['concise', 'balanced', 'detailed', 'challenging', 'supportive'])
    .catch('balanced'),
  emailNotifications: z.boolean(),
  followThroughEmail: z.boolean(),
  followThroughHour: z.coerce.number().int().min(0).max(23).catch(8),
})

export async function updatePreferences(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = preferencesSchema.safeParse({
    theme: formData.get('theme') ?? 'system',
    coachingStyle: formData.get('coachingStyle') ?? 'balanced',
    emailNotifications: formData.get('emailNotifications') === 'on',
    followThroughEmail: formData.get('followThroughEmail') === 'on',
    followThroughHour: formData.get('followThroughHour') ?? 8,
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
      follow_through_email: parsed.data.followThroughEmail,
      follow_through_hour: parsed.data.followThroughHour,
    })
    .eq('id', user.id)

  if (error) return { error: 'We could not save those preferences.' }

  await track('follow_through_preferences_changed', {
    enabled: parsed.data.emailNotifications && parsed.data.followThroughEmail,
    hour: parsed.data.followThroughHour,
  })

  revalidatePath('/settings')
  return { message: 'Saved.' }
}

/**
 * Send today's follow-through to the signed-in user, now.
 *
 * The same composer and sender the morning job uses, through the user's own
 * session, so what arrives is exactly what the schedule would send. Recorded
 * as a manual delivery: it never consumes the day, and the day never blocks
 * it. This is also the honest way to see the email before deciding to keep
 * it on.
 */
export async function sendFollowThroughNow(): Promise<SettingsState> {
  const user = await requireUser()
  const profile = await getProfile()
  const supabase = await createClient()

  if (!user.email) return { error: 'Your account has no email address.' }

  const { sendFollowThrough } = await import('@/lib/follow-through/send')
  const outcome = await sendFollowThrough(
    supabase,
    {
      id: user.id,
      email: user.email,
      firstName: profile?.preferred_name || profile?.full_name?.split(' ')[0] || '',
      timeZone: profile?.timezone ?? null,
    },
    { trigger: 'manual' },
  )

  if (outcome.status === 'sent') {
    await track('follow_through_manual_sent', { loops: outcome.count })
    revalidatePath('/settings/appearance')
    return {
      message: `Sent to ${user.email}. ${outcome.count === 1 ? 'One loop' : `${outcome.count} loops`} in it.`,
    }
  }
  if (outcome.status === 'skipped' && outcome.reason === 'nothing_open') {
    return { message: 'Nothing is due, overdue or waiting today, so there was nothing to send.' }
  }
  if (outcome.status === 'skipped' && outcome.reason === 'not_configured') {
    return { error: 'Email is not available yet, so nothing was sent.' }
  }
  return { error: 'That could not be sent. Try again in a moment.' }
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
export async function exportMyData(): Promise<
  { ok: true; json: string } | { ok: false; error: string }
> {
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
      decisions,
      decisionPeople,
      meetingAttendees,
      interactionParticipants,
      factSources,
      artifactSources,
      sourcePersonLinks,
      topics,
      personTopics,
      weeklyReflections,
      scenarioResponses,
      calendarEvents,
      identityCandidates,
      researchJobs,
      feedback,
      subscription,
      calendarConnections,
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
      supabase.from('decisions').select('*').eq('user_id', user.id),
      supabase.from('decision_people').select('*').eq('user_id', user.id),
      // The joins and evidence links that make the rows above mean anything:
      // who was in which meeting, which source backs which fact.
      supabase.from('meeting_attendees').select('*').eq('user_id', user.id),
      supabase.from('interaction_participants').select('*').eq('user_id', user.id),
      supabase.from('fact_sources').select('*').eq('user_id', user.id),
      supabase.from('artifact_sources').select('*').eq('user_id', user.id),
      supabase.from('source_person_links').select('*').eq('user_id', user.id),
      supabase.from('topics').select('*').eq('user_id', user.id),
      supabase.from('person_topics').select('*').eq('user_id', user.id),
      supabase.from('weekly_reflections').select('*').eq('user_id', user.id),
      supabase.from('scenario_responses').select('*').eq('user_id', user.id),
      supabase.from('external_calendar_events').select('*').eq('user_id', user.id),
      supabase.from('identity_candidates').select('*').eq('user_id', user.id),
      supabase.from('research_jobs').select('*').eq('user_id', user.id),
      supabase.from('ai_feedback').select('*').eq('user_id', user.id),
      supabase
        .from('subscriptions')
        .select('plan, status, current_period_end, cancel_at_period_end, trial_ends_at, created_at')
        .eq('user_id', user.id)
        .maybeSingle(),
      // Which calendars are connected -- never the tokens, which are secrets
      // of the connection rather than data about the account holder.
      supabase
        .from('integration_accounts')
        .select('provider, status, external_account_email, scopes, last_synced_at, created_at')
        .eq('user_id', user.id),
    ])

    const payload = {
      exportedAt: new Date().toISOString(),
      account: { id: user.id, email: user.email },
      profile: profile.data,
      interactionProfile: {
        assessments: assessments.data,
        responses: responses.data,
        scenarioResponses: scenarioResponses.data,
      },
      relationships: {
        organizations: organizations.data,
        people: people.data,
        topics: topics.data,
        personTopics: personTopics.data,
        observations: observations.data,
        observationSources: observationSources.data,
        interactions: interactions.data,
        interactionParticipants: interactionParticipants.data,
        meetings: meetings.data,
        meetingAttendees: meetingAttendees.data,
        commitments: commitments.data,
        decisions: decisions.data,
        decisionPeople: decisionPeople.data,
        notes: notes.data,
      },
      sources: {
        sources: sources.data,
        sourcePersonLinks: sourcePersonLinks.data,
        professionalFacts: facts.data,
        factSources: factSources.data,
        identityCandidates: identityCandidates.data,
        researchJobs: researchJobs.data,
      },
      generated: {
        artifacts: artifacts.data,
        artifactSources: artifactSources.data,
        feedback: feedback.data,
      },
      reflections: { daily: reflections.data, weekly: weeklyReflections.data },
      calendar: { connections: calendarConnections.data, events: calendarEvents.data },
      plan: subscription.data,
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
 * Billing is stopped before anything irreversible happens; see
 * lib/account/deletion for the order and why. If the subscription cannot be
 * confirmed stopped, nothing is deleted and the user is told.
 */
export async function deleteAccount(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = deleteSchema.safeParse({ confirmation: formData.get('confirmation') })
  if (!parsed.success || parsed.data.confirmation.toLowerCase() !== 'delete') {
    return { error: 'Type DELETE to confirm.' }
  }

  const result = await deleteCurrentAccount({
    via: 'web',
    appleAcknowledged: formData.get('appleAcknowledged') === 'yes',
  })
  if (!result.ok) return { error: result.message }

  const supabase = await createClient()
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

/**
 * Your own photo. Shown to you (in the app header and Settings) and to nobody
 * else: there is no public profile while member discovery is deferred.
 */
export async function uploadProfilePhoto(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const file = formData.get('photo')
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image first.' }

  const user = await requireUser()
  const supabase = await createClient()
  const result = await saveProfilePhoto(supabase, user.id, file)
  if (!result.ok) return { error: result.error }

  await track('profile_photo_uploaded')
  revalidatePath('/settings')
  revalidatePath('/', 'layout')
  return { message: 'Photo saved.' }
}

export async function removeProfilePhoto(): Promise<SettingsState> {
  const user = await requireUser()
  const supabase = await createClient()
  const result = await clearProfilePhoto(supabase, user.id)
  if (!result.ok) return { error: result.error }

  revalidatePath('/settings')
  revalidatePath('/', 'layout')
  return { message: 'Photo removed.' }
}
