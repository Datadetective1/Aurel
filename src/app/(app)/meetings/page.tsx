import Link from 'next/link'
import type { Metadata } from 'next'
import { CalendarClock, CalendarPlus, CircleCheck } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge, Container, EmptyState, Eyebrow, SectionHeader } from '@/components/ui/primitives'
import {
  UpcomingMeetings,
  type UpcomingAttendee,
  type UpcomingEvent,
} from '@/components/app/upcoming-meetings'
import { requireOnboardedUser } from '@/lib/auth'
import { getFirstRunState } from '@/lib/first-run'
import { createClient } from '@/lib/supabase/server'
import { formatTime, relativeDay } from '@/lib/format'
import { brand } from '@/lib/brand'

export const metadata: Metadata = { title: 'Meetings', robots: { index: false, follow: false } }

export default async function MeetingsPage() {
  const { user, profile } = await requireOnboardedUser()
  const supabase = await createClient()

  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title, kind, scheduled_at, objective, importance, status')
    .eq('user_id', user.id)
    .order('status', { ascending: true })
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .limit(100)

  const list = meetings ?? []
  const ids = list.map((m) => m.id)

  const [{ data: attendees }, { data: briefs }] = await Promise.all([
    ids.length
      ? supabase
          .from('meeting_attendees')
          .select('meeting_id, people(full_name, preferred_name)')
          .eq('user_id', user.id)
          .in('meeting_id', ids)
      : Promise.resolve({
          data: [] as {
            meeting_id: string
            people: { full_name: string; preferred_name: string | null } | null
          }[],
        }),
    ids.length
      ? supabase
          .from('ai_artifacts')
          .select('subject_id')
          .eq('user_id', user.id)
          .eq('kind', 'meeting_brief')
          .in('subject_id', ids)
      : Promise.resolve({ data: [] as { subject_id: string | null }[] }),
  ])

  const namesByMeeting = new Map<string, string[]>()
  for (const a of attendees ?? []) {
    const name = a.people?.preferred_name || a.people?.full_name
    if (!name) continue
    namesByMeeting.set(a.meeting_id, [...(namesByMeeting.get(a.meeting_id) ?? []), name])
  }

  /**
   * Synced calendar events that are not yet Atturel meetings.
   *
   * Today deliberately shows only the next two days, because preparation is a
   * today-and-tomorrow activity and a fortnight of rows would bury the focus
   * card. But the sync pulls fourteen days, and without a second home the
   * other twelve were synced, counted on the Capabilities screen, and
   * unreachable -- so a calendar connected on Monday for a Thursday meeting
   * looked like a feature that did nothing. This is where the rest of the
   * fortnight lives, and where Prepare becomes reachable for it.
   */
  const firstRun = await getFirstRunState(supabase, user.id)

  const calendarHorizon = new Date()
  calendarHorizon.setDate(calendarHorizon.getDate() + 14)

  const { data: calendarRows } = await supabase
    .from('external_calendar_events')
    .select(
      'id, title, starts_at, ends_at, is_all_day, is_private, meeting_url, status, meeting_id, attendees',
    )
    .eq('user_id', user.id)
    .is('meeting_id', null)
    .gte('starts_at', new Date().toISOString())
    .lte('starts_at', calendarHorizon.toISOString())
    .order('starts_at', { ascending: true })
    .limit(20)

  const upcomingEvents: UpcomingEvent[] = (calendarRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isAllDay: row.is_all_day ?? false,
    isPrivate: row.is_private ?? false,
    meetingUrl: row.meeting_url,
    status: row.status ?? 'confirmed',
    meetingId: row.meeting_id,
    hasBrief: false,
    attendees: ((row.attendees ?? []) as unknown as UpcomingAttendee[]).map((a) => ({
      email: a.email ?? null,
      displayName: a.displayName ?? null,
      personId: a.personId ?? null,
    })),
  }))

  const prepared = new Set((briefs ?? []).map((b) => b.subject_id))
  const upcoming = list.filter((m) => m.status === 'upcoming')
  const past = list.filter((m) => m.status !== 'upcoming')

  return (
    <Container size="default" className="py-8 sm:py-12">
      <SectionHeader
        as="h1"
        eyebrow="Interactions"
        title="Meetings"
        action={
          <Button asChild>
            <Link href="/meetings/new">
              <CalendarPlus className="size-4" aria-hidden="true" />
              Prepare
            </Link>
          </Button>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<CalendarClock className="size-6" />}
          title={
            firstRun.calendarConnected
              ? 'Nothing scheduled in the next two weeks'
              : 'Prepare for a conversation'
          }
          description={
            // Three different truths, and saying the wrong one is what made
            // this screen a dead end: a user with no calendar was told to
            // enter meetings by hand, and never learned there was another way.
            firstRun.calendarConnected
              ? `Your calendar is connected and ${brand.name} is watching the next two weeks. When something is scheduled it will appear here, with the people already matched. You can also prepare for a conversation that is not in your calendar.`
              : firstRun.calendarAvailable
                ? `Connect your calendar and your next two weeks appear here automatically, with attendees matched to the people you already track. Read-only — ${brand.name} never creates, edits or answers anything. You can also add a meeting by hand.`
                : `Tell ${brand.name} who is in the room and what you need to achieve, and it will turn your relationship record into a brief for that specific conversation.`
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {!firstRun.calendarConnected && firstRun.calendarAvailable ? (
                <Button asChild>
                  <Link href="/api/calendar/microsoft/connect">Connect Microsoft 365</Link>
                </Button>
              ) : null}
              <Button
                asChild
                variant={
                  !firstRun.calendarConnected && firstRun.calendarAvailable
                    ? 'secondary'
                    : 'primary'
                }
              >
                <Link href="/meetings/new">Prepare for a meeting</Link>
              </Button>
            </div>
          }
        />
      ) : null}

      <UpcomingMeetings
        events={upcomingEvents}
        timeZone={profile.timezone ?? 'UTC'}
        nowIso={new Date().toISOString()}
      />

      {upcoming.length > 0 ? (
        <section className="mt-10">
          <Eyebrow>Upcoming</Eyebrow>
          <MeetingList
            meetings={upcoming}
            namesByMeeting={namesByMeeting}
            prepared={prepared}
          />
        </section>
      ) : null}

      {past.length > 0 ? (
        <section className="mt-12">
          <Eyebrow>Past</Eyebrow>
          <MeetingList meetings={past} namesByMeeting={namesByMeeting} prepared={prepared} past />
        </section>
      ) : null}
    </Container>
  )
}

function MeetingList({
  meetings,
  namesByMeeting,
  prepared,
  past = false,
}: {
  meetings: {
    id: string
    title: string
    scheduled_at: string | null
    objective: string | null
    importance: number
    status: string
  }[]
  namesByMeeting: Map<string, string[]>
  prepared: Set<string | null>
  past?: boolean
}) {
  return (
    <ul className="mt-4 grid gap-px overflow-hidden rounded-[var(--radius-lg)] border border-line bg-line">
      {meetings.map((meeting) => {
        const names = namesByMeeting.get(meeting.id) ?? []
        const isPrepared = prepared.has(meeting.id)

        return (
          <li key={meeting.id} className="bg-bg">
            <div className="flex flex-wrap items-start gap-4 p-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-ink-muted">
                    {meeting.scheduled_at
                      ? `${relativeDay(meeting.scheduled_at)} · ${formatTime(meeting.scheduled_at)}`
                      : 'Unscheduled'}
                  </span>
                  {meeting.importance >= 4 && !past ? (
                    <Badge tone="accent">Importance {meeting.importance}/5</Badge>
                  ) : null}
                  {meeting.status === 'completed' ? (
                    <Badge tone="positive">
                      <CircleCheck className="size-3" aria-hidden="true" />
                      Debriefed
                    </Badge>
                  ) : isPrepared ? (
                    <Badge tone="positive">Prepared</Badge>
                  ) : (
                    <Badge tone="outline">Not prepared</Badge>
                  )}
                </div>

                <Link
                  href={`/meetings/${meeting.id}/brief`}
                  className="mt-1.5 block font-display text-lg text-ink hover:text-accent"
                >
                  {meeting.title}
                </Link>

                {meeting.objective ? (
                  <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-secondary">
                    {meeting.objective}
                  </p>
                ) : null}

                {names.length > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {names.slice(0, 5).map((name) => (
                      <span key={name} className="flex items-center gap-1.5">
                        <Avatar name={name} size="xs" />
                        <span className="text-xs text-ink-muted">{name}</span>
                      </span>
                    ))}
                    {names.length > 5 ? (
                      <span className="text-xs text-ink-faint">+{names.length - 5}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="flex shrink-0 gap-2">
                {meeting.status !== 'completed' ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/meetings/${meeting.id}/debrief`}>Debrief</Link>
                  </Button>
                ) : null}
                <Button asChild variant={isPrepared ? 'secondary' : 'primary'} size="sm">
                  <Link href={`/meetings/${meeting.id}/brief`}>
                    {isPrepared ? 'View brief' : 'Prepare'}
                  </Link>
                </Button>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
