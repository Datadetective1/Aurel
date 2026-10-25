import Link from 'next/link'
import { CalendarClock, CircleCheck, CircleDashed, UserPlus } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { LiveCountdown } from '@/components/app/meeting-countdown'
import type { PrepState } from '@/lib/visual/glance'
import { PREP_META } from '@/lib/visual/glance'
import type { VisualPerson } from '@/lib/visual/types'
import { formatTime, relativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Chip, ChipRow } from './chip'
import { CompanyMark } from './company-mark'
import { DIRECTION_ICON } from './direction'

/**
 * THE BRIEFING COCKPIT
 * =============================================================================
 * The top of every depth of a meeting, answering the three-second questions
 * before a word of the brief is read:
 *
 *   who is this about    faces, names, where they work
 *   what matters now     when it starts, whether it is prepared, what is open
 *   what to do next      the depth rail and the actions beneath
 *
 * Faces lead. One person gets a portrait-sized face beside their name; a room
 * gets a row of faces with first names, wrapping rather than scrolling so
 * nobody is hidden off the edge of a phone.
 * =============================================================================
 */

const PREP_ICON: Record<PrepState, typeof CircleCheck> = {
  ready: CircleCheck,
  needs_people: UserPlus,
  not_prepared: CircleDashed,
}

export function MeetingCockpit({
  title,
  scheduledAt,
  people,
  prep,
  openLoops,
  owe,
  timeZone,
  now,
  className,
}: {
  title: string
  scheduledAt: string | null
  people: VisualPerson[]
  prep: PrepState
  openLoops: number
  owe: number
  timeZone: string
  now: Date
  className?: string
}) {
  const prepMeta = PREP_META[prep]
  // The organisations at the table: an archived attendee's is not one of them.
  const companies = [
    ...new Map(people.filter((p) => p.company && !p.archived).map((p) => [p.company!, p])).values(),
  ]

  return (
    <header className={cn('min-w-0', className)}>
      <p className="text-ink-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tracking-[0.12em] uppercase">
        <CalendarClock className="text-accent size-3.5" aria-hidden="true" />
        {scheduledAt ? (
          <>
            <LiveCountdown
              startsAt={scheduledAt}
              nowIso={now.toISOString()}
              className="text-accent"
            />
            <span aria-hidden="true">·</span>
            <span>
              {relativeDay(scheduledAt, timeZone, now)} {formatTime(scheduledAt, timeZone)}
            </span>
          </>
        ) : (
          <span>Unscheduled</span>
        )}
      </p>

      <h1 className="font-display text-ink mt-2 text-2xl leading-tight text-balance sm:text-3xl">
        {title}
      </h1>

      {people.length === 1 ? (
        <div className="mt-4 flex items-center gap-3.5">
          <Avatar name={people[0]!.fullName} src={people[0]!.src} size="xl" />
          <div className="min-w-0">
            <Link
              href={`/people/${people[0]!.id}`}
              className="font-display text-ink hover:text-accent text-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              {people[0]!.name}
            </Link>
            <p className="text-ink-secondary mt-0.5 flex min-w-0 items-center gap-1.5 text-sm">
              {people[0]!.company ? (
                <CompanyMark
                  name={people[0]!.company}
                  domain={people[0]!.companyDomain}
                  size="xs"
                />
              ) : null}
              <span className="truncate">
                {[people[0]!.title, people[0]!.company, people[0]!.archived ? 'Archived' : null]
                  .filter(Boolean)
                  .join(' · ') ||
                  people[0]!.context ||
                  'No role recorded'}
              </span>
            </p>
          </div>
        </div>
      ) : people.length > 1 ? (
        <ul aria-label="In the room" className="mt-4 flex flex-wrap gap-x-4 gap-y-3">
          {people.slice(0, 6).map((p) => (
            <li key={p.id}>
              <Link
                href={`/people/${p.id}`}
                className="group flex w-16 flex-col items-center gap-1.5 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <Avatar
                  name={p.fullName}
                  src={p.src}
                  size="lg"
                  className="group-hover:ring-accent-graphic ring-2 ring-transparent transition-shadow"
                />
                <span className="text-ink w-full truncate text-xs">{p.name.split(' ')[0]}</span>
                {p.archived ? (
                  <span className="text-ink-muted text-[0.6875rem]">Archived</span>
                ) : null}
              </Link>
            </li>
          ))}
          {people.length > 6 ? (
            <li className="text-ink-muted flex h-14 items-center text-xs">
              +{people.length - 6} more
            </li>
          ) : null}
        </ul>
      ) : null}

      <ChipRow className="mt-4">
        <Chip icon={PREP_ICON[prep]} tone={prepMeta.tone}>
          {prepMeta.label}
        </Chip>
        {owe > 0 ? (
          <Chip icon={DIRECTION_ICON.owe} tone="accent">
            You owe {owe}
          </Chip>
        ) : null}
        {openLoops > owe ? (
          <Chip tone="neutral">
            {openLoops - owe} other open {openLoops - owe === 1 ? 'loop' : 'loops'}
          </Chip>
        ) : null}
        {people.length > 1
          ? companies.slice(0, 3).map((p) => (
              <Chip key={p.company} tone="quiet" className="gap-1">
                <CompanyMark name={p.company!} domain={p.companyDomain} size="xs" />
                {p.company}
              </Chip>
            ))
          : null}
      </ChipRow>
    </header>
  )
}
