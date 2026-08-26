'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Loader2, Lock, Sparkles, UserPlus, Video } from 'lucide-react'
import { prepareFromEvent } from '@/app/(app)/calendar-actions'
import { Button } from '@/components/ui/button'
import { Badge, Eyebrow } from '@/components/ui/primitives'
import { brand } from '@/lib/brand'

/**
 * UPCOMING MEETINGS, FROM A CONNECTED CALENDAR
 * =============================================================================
 * Today's and tomorrow's real meetings, and nothing more.
 *
 * Deliberately not a calendar. Atturel is meeting intelligence, and a second
 * copy of someone's Outlook would be both worse than the original and a
 * distraction from the only question this section answers: which of these am I
 * walking into unprepared?
 *
 * Each card says what Atturel knows about the room, because that is what makes
 * it worth glancing at. "2 known · 1 needs research" is a reason to click.
 * =============================================================================
 */

export interface UpcomingAttendee {
  email: string | null
  displayName: string | null
  personId: string | null
}

export interface UpcomingEvent {
  id: string
  title: string | null
  startsAt: string
  endsAt: string | null
  isAllDay: boolean
  isPrivate: boolean
  meetingUrl: string | null
  status: string
  meetingId: string | null
  hasBrief: boolean
  attendees: UpcomingAttendee[]
}

function timeLabel(event: UpcomingEvent): string {
  if (event.isAllDay) return 'All day'
  return new Date(event.startsAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function dayLabel(iso: string): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((start(new Date(iso)) - start(new Date())) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })
}

/** The single most useful thing to say about a meeting at a glance. */
function readiness(event: UpcomingEvent): { label: string; tone: 'positive' | 'accent' | 'outline' | 'neutral' } {
  if (event.status === 'cancelled') return { label: 'Cancelled', tone: 'outline' }
  if (event.hasBrief) return { label: 'Prepared', tone: 'positive' }

  const people = event.attendees.length
  if (people === 0) return { label: 'No people matched', tone: 'outline' }

  const unknown = event.attendees.filter((a) => !a.personId).length
  if (unknown > 0) {
    return {
      label: `${unknown} ${unknown === 1 ? 'attendee needs' : 'attendees need'} research`,
      tone: 'accent',
    }
  }
  return { label: 'Not prepared', tone: 'neutral' }
}

export function UpcomingMeetings({ events }: { events: UpcomingEvent[] }) {
  if (events.length === 0) return null

  return (
    <section className="mt-10">
      <Eyebrow className="flex items-center gap-1.5">
        <CalendarClock className="text-accent size-3" aria-hidden="true" />
        From your calendar
      </Eyebrow>

      <ul className="mt-4 grid gap-2.5">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </ul>
    </section>
  )
}

function EventCard({ event }: { event: UpcomingEvent }) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const status = readiness(event)
  const cancelled = event.status === 'cancelled'

  const known = event.attendees.filter((a) => a.personId)
  const unknown = event.attendees.filter((a) => !a.personId)

  async function prepare() {
    setPending(true)
    const result = await prepareFromEvent(event.id)
    // A redirect throws past this; only an error returns.
    if (result?.error) setPending(false)
    else router.refresh()
  }

  return (
    <li
      className={`border-line bg-surface min-w-0 rounded-[var(--radius-md)] border p-4 ${
        cancelled ? 'opacity-60' : ''
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-ink-muted text-[0.6875rem] tracking-[0.06em] uppercase">
            {dayLabel(event.startsAt)} · {timeLabel(event)}
          </p>

          <p className="text-ink mt-1 flex items-center gap-2 text-sm font-medium">
            {event.isPrivate ? (
              <>
                <Lock className="text-ink-muted size-3.5 shrink-0" aria-hidden="true" />
                {/* The provider marked this private. Atturel keeps the time and
                    the room, and never stored the subject. */}
                <span className="text-ink-secondary italic">Private event</span>
              </>
            ) : (
              <span className={cancelled ? 'line-through' : undefined}>
                {event.title ?? 'Untitled meeting'}
              </span>
            )}
            {event.meetingUrl && !cancelled ? (
              <a
                href={event.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink-muted hover:text-accent"
                aria-label="Join the call"
              >
                <Video className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </p>

          {event.attendees.length > 0 ? (
            <p className="text-ink-secondary mt-1.5 truncate text-xs">
              {event.attendees
                .map((a) => a.displayName || a.email || 'Unknown')
                .slice(0, 4)
                .join(' · ')}
              {event.attendees.length > 4 ? ` +${event.attendees.length - 4}` : ''}
            </p>
          ) : null}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            {known.length > 0 ? (
              <span className="text-ink-muted text-[0.6875rem]">
                {known.length} known {known.length === 1 ? 'relationship' : 'relationships'}
              </span>
            ) : null}
          </div>
        </div>

        {!cancelled ? (
          <Button size="sm" variant={event.hasBrief ? 'secondary' : 'primary'} onClick={prepare} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Opening…
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" aria-hidden="true" />
                {event.hasBrief ? 'Open brief' : 'Prepare'}
              </>
            )}
          </Button>
        ) : null}
      </div>

      {unknown.length > 0 && !cancelled ? (
        <p className="border-line text-ink-muted mt-3 flex items-start gap-2 border-t pt-3 text-[0.6875rem] leading-relaxed">
          <UserPlus className="mt-px size-3 shrink-0" aria-hidden="true" />
          <span>
            {unknown.length === 1 ? 'One attendee is' : `${unknown.length} attendees are`} unknown to{' '}
            {brand.name}. Add them from the brief to research their public footprint —{' '}
            {brand.name} will not research anyone without you asking.
          </span>
        </p>
      ) : null}
    </li>
  )
}
