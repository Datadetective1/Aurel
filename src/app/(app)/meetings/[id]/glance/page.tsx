import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import { GlanceBriefView, type GlanceAlert } from '@/components/app/meeting-brief'
import { BriefDepthNav } from '@/components/app/brief-depth-nav'
import { LiveCountdown } from '@/components/app/meeting-countdown'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { track } from '@/lib/analytics'
import { formatTime, relativeDay } from '@/lib/format'
import { isOverdueIn } from '@/lib/tz'
import { normalizeBrief, startProximity } from '@/lib/brief'

export const metadata: Metadata = {
  title: 'What you need',
  robots: { index: false, follow: false },
}

/**
 * TEN SECONDS.
 *
 * The shortest useful view of a brief, and the destination of the countdown on
 * Today. A person walking into a room needs four things: who is in it, what
 * they want out of it, the first sentence, and anything overdue between them.
 *
 * Nothing here is generated. Every field is read from the stored artifact, so
 * this renders instantly and renders briefs written before it existed.
 */
export default async function GlancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, profile } = await requireOnboardedUser()
  const timeZone = profile.timezone ?? 'UTC'
  const now = new Date()
  const supabase = await createClient()

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, scheduled_at')
    .eq('user_id', user.id)
    .eq('id', id)
    .maybeSingle()

  if (!meeting) notFound()

  const { data: artifact } = await supabase
    .from('ai_artifacts')
    .select('content')
    .eq('user_id', user.id)
    .eq('kind', 'meeting_brief')
    .eq('subject_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // There is nothing to glance at before the brief exists. Preparing is the
  // honest next step, and the brief page is where that happens.
  if (!artifact) redirect(`/meetings/${id}/brief`)

  const brief = normalizeBrief(artifact.content)

  const { data: attendees } = await supabase
    .from('meeting_attendees')
    .select('person_id, people(full_name, preferred_name)')
    .eq('user_id', user.id)
    .eq('meeting_id', id)

  // The brief's own participant list is the better room: it is ordered by the
  // composer and carries the names as briefed. The attendee table is the
  // fallback for a brief generated before anyone was added to the room.
  const room =
    brief.participants.length > 0
      ? brief.participants.map((p) => ({ id: p.personId, name: p.name }))
      : (attendees ?? []).flatMap((a) =>
          a.people
            ? [{ id: a.person_id, name: a.people.preferred_name || a.people.full_name }]
            : [],
        )

  // --- the one warning worth interrupting for -------------------------------
  const attendeeIds = (attendees ?? []).map((a) => a.person_id)
  const { data: commitments } = attendeeIds.length
    ? await supabase
        .from('commitments')
        .select('id, description, owner, due_on')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .in('person_id', attendeeIds)
        .order('due_on', { ascending: true, nullsFirst: false })
    : { data: [] as { id: string; description: string; owner: string; due_on: string | null }[] }

  const open = commitments ?? []
  // Overdue outranks merely open, and a dated promise outranks an undated one.
  // The list is already sorted by date, so the first overdue row is the most
  // overdue and the first row overall is the next one due.
  const overdue = open.find((c) => isOverdueIn(c.due_on, timeZone, now))
  const chosen = overdue ?? open[0]

  const alert: GlanceAlert | null = chosen
    ? {
        text: chosen.description,
        note: [
          overdue ? 'Overdue' : 'Still open',
          chosen.owner === 'user' ? 'you owe this' : chosen.owner === 'person' ? 'they owe this' : 'between you',
          chosen.due_on ? relativeDay(chosen.due_on, timeZone, now).toLowerCase() : null,
        ]
          .filter(Boolean)
          .join(' · '),
        tone: overdue ? 'critical' : 'caution',
      }
    : null

  // Bucket only. See lib/brief: a duration next to an event timestamp is a
  // reconstruction of when a named person was in a specific meeting.
  await track('brief_glance_viewed', {
    proximity: startProximity(meeting.scheduled_at, now),
    participants: room.length,
    has_alert: Boolean(alert),
  })

  return (
    <Container size="narrow" className="py-6 sm:py-10">
      <header>
        <p className="text-ink-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] tracking-[0.14em] uppercase">
          {meeting.scheduled_at ? (
            <>
              <LiveCountdown
                startsAt={meeting.scheduled_at}
                nowIso={now.toISOString()}
                className="text-accent"
              />
              <span aria-hidden="true">·</span>
              <span>{formatTime(meeting.scheduled_at, timeZone)}</span>
            </>
          ) : (
            <span>Unscheduled</span>
          )}
        </p>
        <h1 className="font-display text-ink mt-2 text-2xl leading-tight sm:text-3xl">
          {meeting.title}
        </h1>
      </header>

      <BriefDepthNav meetingId={id} current="glance" className="mt-5" />

      <div className="mt-7">
        <GlanceBriefView brief={brief} room={room} alert={alert} />
      </div>

      <Button asChild size="lg" className="mt-8 w-full">
        <Link href={`/meetings/${id}/quick`}>
          Sixty seconds
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </Button>

      <p className="mt-6 text-center">
        <Link
          href={`/meetings/${id}/debrief`}
          className="text-ink-muted hover:text-ink inline-flex min-h-11 items-center text-xs"
        >
          Debrief after the meeting
        </Link>
      </p>
    </Container>
  )
}
