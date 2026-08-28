import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight,
  CalendarClock,
  CircleAlert,
  Clock,
  Handshake,
  Sparkles,
  UserPlus,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge, Container, EmptyState, Eyebrow, Panel } from '@/components/ui/primitives'
import { WelcomeBanner } from '@/components/app/welcome-banner'
import {
  UpcomingMeetings,
  type UpcomingAttendee,
  type UpcomingEvent,
} from '@/components/app/upcoming-meetings'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getUserContext, getPeopleContext, getQuietRelationships } from '@/lib/ai/context'
import { runPrompt } from '@/lib/ai/provider'
import { getFirstRunState } from '@/lib/first-run'
import { FirstRun, firstRunComplete } from '@/components/app/first-run'
import { ProfilePrompt } from '@/components/app/profile-prompt'
import { getNextProfileQuestion } from '@/lib/assessment/next-question'
import { dailyFocusPrompt } from '@/lib/ai/prompts/coaching'
import { formatDayLabel, formatTime, relativeDay } from '@/lib/format'
import { brand } from '@/lib/brand'

export const metadata: Metadata = { title: 'Today', robots: { index: false, follow: false } }

/**
 * TODAY — the briefing desk.
 *
 * Answers "what deserves my attention today", not "here are some metrics".
 * Ordering is transparent and stated in the UI: unprepared meetings the user
 * marked important, then overdue commitments, then relationships going quiet.
 * Nothing here is a hidden score.
 */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>
}) {
  const { welcome } = await searchParams
  const { user, profile } = await requireOnboardedUser()
  const supabase = await createClient()

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const horizon = new Date(todayStart.getTime() + 7 * 86_400_000)

  const [{ data: meetings }, { data: commitments }, quiet, userContext] = await Promise.all([
    supabase
      .from('meetings')
      .select('id, title, scheduled_at, kind, objective, importance, status')
      .eq('user_id', user.id)
      .eq('status', 'upcoming')
      .or(`scheduled_at.is.null,scheduled_at.gte.${todayStart.toISOString()}`)
      .lte('scheduled_at', horizon.toISOString())
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .limit(8),
    supabase
      .from('commitments')
      .select('id, description, owner, due_on, person_id, people!commitments_person_id_fkey(full_name, preferred_name)')
      .eq('user_id', user.id)
      .eq('status', 'open')
      .order('due_on', { ascending: true, nullsFirst: false })
      .limit(10),
    getQuietRelationships(supabase, user.id),
    getUserContext(supabase, user.id),
  ])

  const meetingIds = (meetings ?? []).map((m) => m.id)

  // Which of these meetings already have a brief, and who is attending.
  const [{ data: briefs }, { data: attendees }] = await Promise.all([
    meetingIds.length
      ? supabase
          .from('ai_artifacts')
          .select('subject_id')
          .eq('user_id', user.id)
          .eq('kind', 'meeting_brief')
          .in('subject_id', meetingIds)
      : Promise.resolve({ data: [] as { subject_id: string | null }[] }),
    meetingIds.length
      ? supabase
          .from('meeting_attendees')
          .select('meeting_id, person_id')
          .eq('user_id', user.id)
          .in('meeting_id', meetingIds)
      : Promise.resolve({ data: [] as { meeting_id: string; person_id: string }[] }),
  ])

  const prepared = new Set((briefs ?? []).map((b) => b.subject_id))
  const attendeesByMeeting = new Map<string, string[]>()
  for (const a of attendees ?? []) {
    attendeesByMeeting.set(a.meeting_id, [...(attendeesByMeeting.get(a.meeting_id) ?? []), a.person_id])
  }

  const peopleMap = await getPeopleContext(
    supabase,
    user.id,
    [...new Set((attendees ?? []).map((a) => a.person_id))],
  )

  const today = new Date().toISOString().slice(0, 10)
  const overdue = (commitments ?? []).filter((c) => c.due_on && c.due_on < today)
  const dueToday = (commitments ?? []).filter((c) => c.due_on === today)

  const displayName = (p: { full_name: string; preferred_name: string | null } | null) =>
    p ? p.preferred_name || p.full_name : null

  const firstRun = await getFirstRunState(supabase, user.id)

  // At most one, only on Today, only once a brief exists, and not if dismissed
  // in the last week. Usually null -- see lib/assessment/next-question.
  const profileQuestion = await getNextProfileQuestion(supabase, user.id)

  // Nothing recorded means nothing to reason about. Sending an empty record to
  // a model costs a request and a few seconds to be told, at length, that the
  // day is empty -- which the account already knows and can say better itself.
  const hasSignals =
    (meetings ?? []).length > 0 || (commitments ?? []).length > 0 || quiet.length > 0

  const focus = hasSignals
    ? await runPrompt(dailyFocusPrompt, {
    user: userContext,
    today,
    meetings: (meetings ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      scheduledAt: m.scheduled_at,
      importance: m.importance,
      objective: m.objective,
      hasBrief: prepared.has(m.id),
      participants: (attendeesByMeeting.get(m.id) ?? [])
        .map((id) => peopleMap.get(id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p)),
    })),
    overdueCommitments: overdue.map((c) => ({
      id: c.id,
      description: c.description,
      owner: c.owner,
      ownerName: null,
      dueOn: c.due_on,
      isOverdue: true,
      personName: displayName(c.people),
    })),
    dueTodayCommitments: dueToday.map((c) => ({
      id: c.id,
      description: c.description,
      owner: c.owner,
      ownerName: null,
      dueOn: c.due_on,
      isOverdue: false,
      personName: displayName(c.people),
    })),
    quietRelationships: quiet,
      })
    : null

  const hasAnything = (meetings ?? []).length > 0 || (commitments ?? []).length > 0
  const firstName = profile.preferred_name || profile.full_name?.split(' ')[0] || 'there'

  // Calendar, when one is connected. Two days only: preparation is a today and
  // tomorrow activity, and a fortnight of rows would bury the focus card.
  const calendarHorizon = new Date()
  calendarHorizon.setDate(calendarHorizon.getDate() + 2)

  const { data: calendarRows } = await supabase
    .from('external_calendar_events')
    .select('id, title, starts_at, ends_at, is_all_day, is_private, meeting_url, status, meeting_id, attendees')
    .eq('user_id', user.id)
    .gte('starts_at', new Date().toISOString())
    .lte('starts_at', calendarHorizon.toISOString())
    .order('starts_at', { ascending: true })
    .limit(8)

  const briefedMeetingIds = new Set<string>()
  const calendarMeetingIds = (calendarRows ?? [])
    .map((row) => row.meeting_id)
    .filter((id): id is string => Boolean(id))

  if (calendarMeetingIds.length > 0) {
    const { data: briefed } = await supabase
      .from('ai_artifacts')
      .select('subject_id')
      .eq('user_id', user.id)
      .eq('kind', 'meeting_brief')
      .in('subject_id', calendarMeetingIds)
    for (const row of briefed ?? []) {
      if (row.subject_id) briefedMeetingIds.add(row.subject_id)
    }
  }

  const upcomingEvents: UpcomingEvent[] = (calendarRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isAllDay: row.is_all_day ?? false,
    isPrivate: row.is_private ?? false,
    meetingUrl: row.meeting_url ?? null,
    status: row.status ?? 'confirmed',
    meetingId: row.meeting_id,
    hasBrief: Boolean(row.meeting_id && briefedMeetingIds.has(row.meeting_id)),
    attendees: ((row.attendees ?? []) as unknown as UpcomingAttendee[]).map((a) => ({
      email: a.email ?? null,
      displayName: a.displayName ?? null,
      personId: a.personId ?? null,
    })),
  }))

  return (
    <Container size="default" className="py-8 sm:py-12">
      {welcome ? <WelcomeBanner name={firstName} className="mb-8" /> : null}

      <header>
        <Eyebrow>{formatDayLabel(new Date())}</Eyebrow>
        <h1 className="mt-3 font-display text-3xl text-ink sm:text-4xl">
          Good {timeOfDay()}, {firstName}.
        </h1>
      </header>

      {/* The three things that make an empty account useful. Disappears on its
          own once they are done — see components/app/first-run. */}
      <FirstRun state={firstRun} className="mt-9" />

      {/* Today's focus — the single most important thing, with its reasoning.
          Only rendered when there is something to reason about; the first-run
          panel above is the better answer on an empty account. */}
      {focus ? (
      <section className="mt-9">
        <Panel className="p-6 sm:p-7">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <Eyebrow>Today&rsquo;s focus</Eyebrow>
              <p className="mt-3 font-display text-xl leading-snug text-ink sm:text-2xl">
                {focus.output.headline}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
                {focus.output.reasoning}
              </p>

              {focus.output.priorities.length > 1 ? (
                <ol className="mt-6 grid gap-3 border-t border-line pt-5">
                  {focus.output.priorities.slice(1).map((priority, i) => (
                    <li key={i} className="flex gap-3">
                      <span aria-hidden="true" className="mt-2 h-px w-3 shrink-0 bg-accent-graphic" />
                      <span className="min-w-0">
                        <span className="block text-sm text-ink">{priority.what}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                          {priority.why}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          </div>
        </Panel>
      </section>
      ) : null}

      <UpcomingMeetings
        events={upcomingEvents}
        timeZone={profile.timezone ?? 'UTC'}
        nowIso={new Date().toISOString()}
      />

      {/* Only once the checklist above has gone. Before that it would say the
          same thing twice, in two different shapes, on the same screen. */}
      {!hasAnything && firstRunComplete(firstRun) ? (
        <EmptyState
          className="mt-8"
          icon={<UserPlus className="size-6" />}
          title="A quiet day"
          description={`Nothing is scheduled and nothing is overdue. When you add a person or connect a meeting, ${brand.name} will have something to say here.`}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/people/new">Add a person</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/meetings">Prepare for a meeting</Link>
              </Button>
            </div>
          }
        />
      ) : null}

      {/* Upcoming interactions */}
      {(meetings ?? []).length > 0 ? (
        <section className="mt-12">
          <div className="flex items-end justify-between gap-4">
            <div>
              <Eyebrow>Upcoming</Eyebrow>
              <h2 className="mt-2 font-display text-xl text-ink">Next seven days</h2>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/meetings">
                All meetings
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <ul className="mt-5 grid gap-px overflow-hidden rounded-[var(--radius-lg)] border border-line bg-line">
            {(meetings ?? []).map((meeting) => {
              const people = (attendeesByMeeting.get(meeting.id) ?? [])
                .map((id) => peopleMap.get(id))
                .filter((p): p is NonNullable<typeof p> => Boolean(p))
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
                        {meeting.importance >= 4 ? (
                          <Badge tone="accent">Importance {meeting.importance}/5</Badge>
                        ) : null}
                        {isPrepared ? (
                          <Badge tone="positive">Prepared</Badge>
                        ) : (
                          <Badge tone="outline">Not prepared</Badge>
                        )}
                      </div>

                      <Link
                        href={`/meetings/${meeting.id}`}
                        className="mt-1.5 block font-display text-lg text-ink hover:text-accent"
                      >
                        {meeting.title}
                      </Link>

                      {meeting.objective ? (
                        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-secondary">
                          {meeting.objective}
                        </p>
                      ) : (
                        <p className="mt-1.5 text-sm text-ink-faint">No objective recorded yet.</p>
                      )}

                      {people.length > 0 ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {people.slice(0, 5).map((p) => (
                            <span key={p.id} className="flex items-center gap-1.5">
                              <Avatar name={p.displayName} size="xs" />
                              <span className="text-xs text-ink-muted">{p.displayName}</span>
                            </span>
                          ))}
                          {people.length > 5 ? (
                            <span className="text-xs text-ink-faint">+{people.length - 5} more</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <Button asChild variant={isPrepared ? 'secondary' : 'primary'} size="sm">
                      <Link href={`/meetings/${meeting.id}/brief`}>
                        {isPrepared ? 'View brief' : 'Prepare'}
                      </Link>
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {/* Open commitments */}
      {(commitments ?? []).length > 0 ? (
        <section className="mt-12">
          <Eyebrow>Open commitments</Eyebrow>
          <h2 className="mt-2 font-display text-xl text-ink">
            {overdue.length > 0 ? `${overdue.length} overdue` : 'Nothing overdue'}
          </h2>

          <ul className="mt-5 grid gap-2">
            {(commitments ?? []).slice(0, 6).map((c) => {
              const isOverdue = Boolean(c.due_on && c.due_on < today)
              const who = displayName(c.people)
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3"
                >
                  {isOverdue ? (
                    <CircleAlert className="size-4 shrink-0 text-critical" aria-hidden="true" />
                  ) : (
                    <Handshake className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1 text-sm text-ink">{c.description}</span>
                  {who ? <span className="text-xs text-ink-muted">{who}</span> : null}
                  {c.due_on ? (
                    <Badge tone={isOverdue ? 'critical' : 'neutral'}>
                      <Clock className="size-3" aria-hidden="true" />
                      {relativeDay(c.due_on)}
                    </Badge>
                  ) : (
                    <Badge tone="outline">No date</Badge>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {/* Relationship signals */}
      {focus && focus.output.watchItems.length > 0 ? (
        <section className="mt-12">
          <Eyebrow>Worth watching</Eyebrow>
          <ul className="mt-4 grid gap-2.5">
            {focus.output.watchItems.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-relaxed text-ink-secondary">
                <span aria-hidden="true" className="mt-2 h-px w-3 shrink-0 bg-line-strong" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Below the day's real content on purpose: refinement is never the most
          important thing on this screen. */}
      {profileQuestion ? <ProfilePrompt block={profileQuestion} /> : null}

      {/* Honest attribution of how this page was produced. Absent when nothing
          was produced -- an empty account has nothing to attribute. */}
      {focus ? (
        <p className="mt-14 flex items-center gap-2 text-xs text-ink-faint">
          <CalendarClock className="size-3.5" aria-hidden="true" />
          {focus.provenance.groundedFallback
            ? 'Composed directly from your records.'
            : 'Generated from your records.'}
        </p>
      ) : null}
    </Container>
  )
}

function timeOfDay(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}
