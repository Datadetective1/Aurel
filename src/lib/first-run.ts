import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { calendarCapability } from '@/lib/calendar'
import type { FirstRunState } from '@/components/app/first-run'

type Client = SupabaseClient<Database>

/**
 * What the account has actually done, for the first-run panel.
 *
 * Read in one place because Today and Meetings both need it and must agree:
 * a checklist that says "connect your calendar" on one screen while another
 * shows it connected is worse than no checklist.
 *
 * Counts only. Nothing here reads a title, a name or an email — the panel
 * describes the shape of the account, never its contents.
 */
export async function getFirstRunState(supabase: Client, userId: string): Promise<FirstRunState> {
  const calendarAvailable = calendarCapability().some((p) => p.configured)

  const horizon = new Date()
  horizon.setDate(horizon.getDate() + 14)

  const [integration, events, people, researched, briefs] = await Promise.all([
    supabase
      .from('integration_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'connected')
      .limit(1),
    supabase
      .from('external_calendar_events')
      .select('attendees')
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .gte('starts_at', new Date().toISOString())
      .lte('starts_at', horizon.toISOString())
      .limit(50),
    supabase.from('people').select('id').eq('user_id', userId).is('archived_at', null).limit(200),
    // "Researched" means a source was accepted for them, which is the honest
    // bar: a run that legitimately found nothing has not researched anybody.
    supabase.from('professional_facts').select('person_id').eq('user_id', userId).limit(200),
    supabase
      .from('ai_artifacts')
      .select('id')
      .eq('user_id', userId)
      .eq('kind', 'meeting_brief')
      .limit(1),
  ])

  const eventRows = events.data ?? []
  const attendees = eventRows.flatMap(
    (row) => (row.attendees ?? []) as { personId?: string | null }[],
  )

  return {
    calendarConnected: (integration.data ?? []).length > 0,
    calendarAvailable,
    upcomingCount: eventRows.length,
    unknownAttendees: new Set(
      attendees.filter((a) => !a.personId).map((a) => JSON.stringify(a)),
    ).size,
    peopleCount: (people.data ?? []).length,
    researchedCount: new Set((researched.data ?? []).map((f) => f.person_id)).size,
    preparedCount: (briefs.data ?? []).length,
  }
}
