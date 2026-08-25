import Link from 'next/link'
import type { Metadata } from 'next'
import { CalendarClock, CalendarPlus, CircleCheck } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge, Container, EmptyState, Eyebrow, SectionHeader } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatTime, relativeDay } from '@/lib/format'
import { brand } from '@/lib/brand'

export const metadata: Metadata = { title: 'Meetings', robots: { index: false, follow: false } }

export default async function MeetingsPage() {
  const { user } = await requireOnboardedUser()
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
          title="Prepare for a conversation"
          description={`Tell ${brand.name} who is in the room and what you need to achieve, and it will turn your relationship record into a brief for that specific conversation.`}
          action={
            <Button asChild>
              <Link href="/meetings/new">Prepare for a meeting</Link>
            </Button>
          }
        />
      ) : null}

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
