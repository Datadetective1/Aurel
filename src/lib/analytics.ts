import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getOptionalUser } from '@/lib/auth'
import { logger } from '@/lib/logger'

/**
 * Product analytics.
 *
 * PRIVACY CONTRACT: event properties may only ever contain non-identifying
 * scalars — counts, booleans, enum values, durations. Never a name, a note, an
 * objective, a message body or an email address. `sanitiseProps` enforces this
 * by dropping anything that is not a small scalar, rather than trusting call
 * sites to remember.
 *
 * Events are written to the user's own `analytics_events` rows (RLS-scoped) so
 * they are included in an account export and destroyed with the account. There
 * is no third-party analytics sink.
 *
 * =============================================================================
 * WHICH EVENTS TO COUNT
 * =============================================================================
 * Two naming generations coexist. The `assessment_*` family is older and its
 * history is not trustworthy; the `interaction_profile_*` family is the one to
 * build a funnel on. Both fire, deliberately — dropping the old names would
 * orphan the rows already written, and they cost nothing.
 *
 * THE CANONICAL INTERACTION-PROFILE FUNNEL:
 *
 *   interaction_profile_started
 *     → interaction_profile_initial_completed      (the six core scenarios)
 *       → interaction_profile_refinement_shown     (one question rendered)
 *         → interaction_profile_refinement_answered | _dismissed | _skipped
 *
 * DO NOT COUNT `assessment_started` FOR ANYTHING HISTORICAL. Before the resume
 * query in `onboarding/assessment/actions.ts` was corrected to accept a
 * completed run, landing on the assessment page after finishing found nothing
 * to resume and created a fresh empty row — firing a second `assessment_started`
 * on the way to the reveal screen. Production rows from 25–27 Aug 2026 show the
 * signature clearly: seven starts for one 31-minute run on 25 Aug, and a start
 * timestamped in the same second as a completion on 27 Aug. Any
 * started-to-completed rate over that window understates completion, roughly by
 * half.
 *
 * That defect is fixed and the current scenario instrument does not reproduce
 * it — runs on 28 Aug show exactly one start per completion. The polluted rows
 * are left in place rather than rewritten: analytics is a record of what was
 * observed, and editing it to look better would be the same dishonesty the
 * evidence model exists to prevent.
 *
 * `assessment_completed`, `assessment_initial_completed` and
 * `interaction_profile_initial_completed` all fire at the same moment for the
 * same event. Count ONE of them — the third — and treat the other two as
 * legacy aliases.
 */

export type AnalyticsEvent =
  | 'signup_completed'
  | 'onboarding_profile_completed'
  | 'onboarding_completed'
  | 'assessment_started'
  | 'assessment_completed'
  | 'assessment_calibrated'
  // Progressive profiling. Counts, confidence and dimension ids only -- never
  // which statement somebody picked.
  | 'assessment_initial_completed'
  | 'assessment_fully_completed'
  | 'assessment_reset'
  | 'profile_question_shown'
  | 'profile_question_answered'
  | 'profile_question_dismissed'
  // The interaction-profile funnel, named for the thing it measures. The
  // profile_question_* events above remain so existing rows stay queryable.
  | 'interaction_profile_started'
  | 'interaction_profile_initial_completed'
  | 'interaction_profile_refinement_shown'
  | 'interaction_profile_refinement_answered'
  | 'interaction_profile_refinement_skipped'
  | 'interaction_profile_refinement_dismissed'
  | 'interaction_profile_updated'
  | 'person_added'
  // The research funnel. `person_research_started` and `..._completed` are a
  // pair on purpose: the gap between their counts is the failure rate, and the
  // gap between their timestamps is how long a user waits. Before these
  // existed, a completed research run fired `person_added` -- which inflated
  // the person count and left research itself unmeasurable.
  | 'person_research_started'
  | 'person_research_completed'
  | 'research_source_accepted'
  | 'research_source_rejected'
  | 'brief_feedback'
  // Emitted when a signed-in page loads after a gap longer than the session
  // window. Retention, without storing anything about what the session did.
  | 'return_session'
  // Calendar. Counts, providers and reasons only -- never a meeting title, an
  // attendee name or an email address. A calendar is the most sensitive thing
  // Atturel reads, and analytics is the last place it should surface.
  | 'calendar_connect_started'
  | 'calendar_connected'
  | 'calendar_connect_failed'
  | 'calendar_disconnected'
  | 'calendar_sync_completed'
  | 'calendar_sync_failed'
  | 'calendar_event_imported'
  | 'calendar_attendee_matched'
  | 'calendar_attendee_unmatched'
  | 'calendar_prepare_started'
  | 'observation_added'
  | 'observation_confirmed'
  | 'observation_dismissed'
  | 'interaction_added'
  | 'meeting_created'
  // Somebody the calendar invite did not carry, added by hand. A rising count
  // means attendee matching is missing people it should be finding.
  | 'meeting_participant_added'
  // Paired with meeting_prepared, which is the completion. The gap between
  // their counts is how often generation fails or is abandoned; the gap between
  // their timestamps is how long somebody waits at the spinner.
  | 'meeting_prepare_started'
  | 'meeting_prepared'
  // The three depths of a brief. Each carries a `proximity` BUCKET -- imminent,
  // soon, today, ahead, past, unscheduled -- and never a duration: minutes
  // to start, next to the event's own timestamp, reconstructs when a named
  // user was sitting in a specific meeting.
  //
  // The question these exist to answer is whether the short views are reached
  // in the corridor and the full brief at a desk. If `brief_glance_viewed` is
  // dominated by `ahead`, the depths are ordered wrong.
  //
  // `quick_brief_viewed` predates the other two and keeps its name: renaming it
  // would orphan the rows already written.
  | 'brief_glance_viewed'
  | 'quick_brief_viewed'
  | 'brief_deep_viewed'
  | 'meeting_debriefed'
  // Voice debrief. Buckets, latencies and error categories only -- never a
  // word of what was said, and no audio ever reaches this file.
  | 'voice_debrief_started'
  | 'voice_debrief_cancelled'
  | 'voice_debrief_transcription_started'
  | 'voice_debrief_transcription_completed'
  | 'voice_debrief_transcription_failed'
  | 'voice_debrief_submitted'
  | 'memory_confirmed'
  | 'message_adapted'
  | 'coach_used'
  | 'demo_data_seeded'
  | 'people_merged'
  | 'document_added'
  | 'demo_data_cleared'
  | 'upgrade_viewed'
  | 'checkout_started'
  | 'subscription_created'
  | 'limit_reached'
  // Access tiers. Outcomes and counts only -- never a code, never a hash.
  | 'pilot_invitation_created'
  | 'pilot_invitation_redeemed'
  | 'pilot_invitation_rejected'
  | 'data_exported'
  | 'account_deleted'

type Props = Record<string, string | number | boolean | null | undefined>

/** Values longer than this are almost certainly user content, not a label. */
const MAX_STRING_LENGTH = 48

function sanitiseProps(props: Props): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) continue
    if (typeof value === 'number' && Number.isFinite(value)) {
      safe[key] = value
      continue
    }
    if (typeof value === 'boolean') {
      safe[key] = value
      continue
    }
    if (typeof value === 'string' && value.length <= MAX_STRING_LENGTH) {
      safe[key] = value
      continue
    }
    // Anything else is dropped rather than truncated — a truncated note is still
    // a note.
    safe[key] = '[dropped]'
  }
  return safe
}

/**
 * Record a product event. Never throws: analytics failing must not fail the
 * user's actual action.
 */
export async function track(name: AnalyticsEvent, props: Props = {}): Promise<void> {
  try {
    const user = await getOptionalUser()
    if (!user) return

    const supabase = await createClient()
    await supabase.from('analytics_events').insert({
      user_id: user.id,
      name,
      props: sanitiseProps(props),
    })
  } catch (error) {
    logger.warn('analytics.track_failed', {
      name,
      error: error instanceof Error ? error.name : 'unknown',
    })
  }
}
