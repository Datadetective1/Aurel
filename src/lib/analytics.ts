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
 */

export type AnalyticsEvent =
  | 'signup_completed'
  | 'onboarding_profile_completed'
  | 'onboarding_completed'
  | 'assessment_started'
  | 'assessment_completed'
  | 'assessment_calibrated'
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
  | 'meeting_prepared'
  | 'quick_brief_viewed'
  | 'meeting_debriefed'
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
