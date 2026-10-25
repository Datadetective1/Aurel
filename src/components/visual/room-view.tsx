import Link from 'next/link'
import { Link2 } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import type { VisualConnection, VisualPerson } from '@/lib/visual/types'
import { relativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CompanyLabel } from './company-mark'
import { Chip } from './chip'
import { DIRECTION_ICON } from './direction'

/**
 * THE ROOM
 * =============================================================================
 * Who will be at the table, arranged around it. On a wide screen the people
 * sit on an ellipse around the meeting, each with a face, a role, where they
 * work and the one fact about the relationship worth knowing on the way in.
 * On a phone the same people stack beneath the meeting in the same order --
 * an ellipse squeezed to 375px is a diagram, not a room.
 *
 * The lines run from each person to the meeting, never between people: being
 * in the same meeting is the only relationship the arrangement asserts.
 * Anything the people verifiably share is said in words underneath, with
 * what it rests on, and only when the record holds both ends of it.
 * =============================================================================
 */

const MAX_AROUND = 8

function placement(index: number, count: number) {
  // Start at the top and go clockwise. Two people sit either side, not
  // stacked top and bottom, because that is how two people sit at a table.
  const offset = count === 2 ? 0 : -Math.PI / 2
  const angle = offset + (index * 2 * Math.PI) / count
  const sin = Math.sin(angle)
  return {
    left: 50 + 38 * Math.cos(angle),
    top: 50 + 36 * sin,
    // Seats in the upper half carry their words above the face, so nothing
    // hangs down into the table; the rest carry them below.
    above: sin < -0.3,
  }
}

function personFact(person: VisualPerson, timeZone: string, now: Date): React.ReactNode {
  // Their "Archived" chip says it all; there is no relationship to summarise.
  if (person.archived) return null
  if (person.owe > 0) {
    const Icon = DIRECTION_ICON.owe
    return (
      <Chip icon={Icon} tone="accent">
        You owe {person.owe}
      </Chip>
    )
  }
  if (person.openLoops > 0) {
    return <Chip tone="neutral">{person.openLoops} open</Chip>
  }
  if (person.lastInteractionAt) {
    return (
      <span className="text-ink-muted text-xs">
        Last spoke {relativeDay(person.lastInteractionAt, timeZone, now).toLowerCase()}
      </span>
    )
  }
  return <span className="text-ink-muted text-xs">First meeting on record</span>
}

function Seat({
  person,
  timeZone,
  now,
  layout,
  above = false,
}: {
  person: VisualPerson
  timeZone: string
  now: Date
  layout: 'around' | 'stack'
  above?: boolean
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-3',
        layout === 'around' && 'w-44 flex-col gap-2 text-center',
        layout === 'around' && above && 'flex-col-reverse',
      )}
    >
      <Avatar
        name={person.fullName}
        src={person.src}
        size={layout === 'around' ? 'lg' : 'md'}
        className="bg-surface"
      />
      <div className={cn('min-w-0', layout === 'around' && 'flex flex-col items-center')}>
        <Link
          href={`/people/${person.id}`}
          className="text-ink hover:text-accent block truncate text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {person.name}
        </Link>
        {person.title ? <p className="text-ink-muted truncate text-xs">{person.title}</p> : null}
        {person.company ? (
          <p className="text-ink-secondary mt-0.5 text-xs">
            <CompanyLabel name={person.company} domain={person.companyDomain} />
          </p>
        ) : null}
        <div
          className={cn(
            'mt-1.5 flex flex-wrap items-center gap-1.5',
            layout === 'around' && 'justify-center',
          )}
        >
          {person.context ? <Chip tone="quiet">{person.context}</Chip> : null}
          {personFact(person, timeZone, now)}
        </div>
      </div>
    </div>
  )
}

export function RoomView({
  people,
  connections = [],
  centerLabel,
  centerDetail,
  timeZone,
  now,
  className,
}: {
  people: VisualPerson[]
  connections?: VisualConnection[]
  /** The meeting, as the centre of the table: its time, or its title. */
  centerLabel: string
  centerDetail?: string | null
  timeZone: string
  now: Date
  className?: string
}) {
  if (people.length === 0) return null
  const names = new Map(people.map((p) => [p.id, p.name.split(' ')[0] ?? p.name]))
  const around = people.length >= 2 && people.length <= MAX_AROUND

  return (
    <section aria-labelledby="room-view-heading" className={cn('min-w-0', className)}>
      <h2 id="room-view-heading" className="label">
        The room
      </h2>

      {/* --- around the table: wide screens --------------------------------- */}
      {around ? (
        <div className="relative mt-24 mb-28 hidden aspect-[16/9] max-h-[26rem] w-full sm:block">
          <svg
            aria-hidden="true"
            className="absolute inset-0 size-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <ellipse
              cx="50"
              cy="50"
              rx="38"
              ry="36"
              fill="none"
              stroke="var(--line)"
              strokeWidth="0.25"
              vectorEffect="non-scaling-stroke"
            />
            {people.map((p, i) => {
              const { left, top } = placement(i, people.length)
              return (
                <line
                  key={p.id}
                  x1="50"
                  y1="50"
                  x2={left}
                  y2={top}
                  stroke="var(--line-strong)"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </svg>

          <div className="border-accent/30 bg-surface absolute top-1/2 left-1/2 flex size-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border p-3 text-center">
            <span className="font-display text-ink text-lg leading-tight">{centerLabel}</span>
            {centerDetail ? (
              <span className="text-ink-muted mt-1 line-clamp-2 text-xs">{centerDetail}</span>
            ) : null}
          </div>

          <ul aria-label="People in this meeting">
            {people.map((person, i) => {
              const { left, top, above } = placement(i, people.length)
              return (
                <li
                  key={person.id}
                  // The face (56px) is centred on the seat; the words hang
                  // outward from it.
                  className={cn(
                    'absolute -translate-x-1/2',
                    above ? '-translate-y-[calc(100%-1.75rem)]' : '-translate-y-7',
                  )}
                  style={{ left: `${left}%`, top: `${top}%` }}
                >
                  <Seat
                    person={person}
                    timeZone={timeZone}
                    now={now}
                    layout="around"
                    above={above}
                  />
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {/* --- stacked: phones, and rooms too big for a table ------------------- */}
      <ul
        aria-label="People in this meeting"
        className={cn('relative mt-4 grid gap-4', around && 'sm:hidden')}
      >
        <span aria-hidden="true" className="bg-line absolute top-5 bottom-5 left-5 w-px" />
        {people.map((person) => (
          <li key={person.id} className="relative">
            <Seat person={person} timeZone={timeZone} now={now} layout="stack" />
          </li>
        ))}
      </ul>

      {/* --- what they verifiably share -------------------------------------- */}
      {connections.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-ink-muted flex items-center gap-1.5 text-xs font-medium">
            <Link2 className="size-3.5" aria-hidden="true" />
            Between them, on record
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {connections.slice(0, 6).map((c) => (
              <li key={`${c.a}-${c.b}-${c.kind}-${c.label}`}>
                <Chip
                  tone="neutral"
                  className="whitespace-normal"
                  title={
                    c.evidence === 'confirmed'
                      ? 'Confirmed in your record'
                      : 'Observed in public sources'
                  }
                >
                  {names.get(c.a)} &amp; {names.get(c.b)} · {c.description}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
