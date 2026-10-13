import Link from 'next/link'
import { CalendarClock, History, MessagesSquare, Tags } from 'lucide-react'
import type { ActionDirection } from '@/lib/visual/relationship-actions'
import { DIRECTION_ORDER } from '@/lib/visual/relationship-actions'
import { formatDate, isFuture, relativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Chip } from './chip'
import { DirectionChip } from './direction'

/**
 * A PERSON AT A GLANCE
 * =============================================================================
 * Four facts about the relationship, each read straight off the record, in
 * place of the paragraph and the 0-100 "pulse" that used to sit here:
 *
 *   when you last spoke   when you next meet   what is open, by direction
 *   how long you have known them on record
 *
 * No score. A number about a relationship invites reading it as how the
 * relationship is going, which nothing in the record can know. The facts the
 * score was built from are still here, as themselves.
 * =============================================================================
 */

function Tile({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: typeof History
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="label flex items-center gap-1.5">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="text-ink mt-2 text-sm leading-snug">{children}</dd>
    </div>
  )
}

export function PersonGlance({
  firstName,
  lastInteractionAt,
  firstInteractionAt,
  nextMeeting,
  directions,
  themes,
  timeZone,
  now,
  className,
}: {
  firstName: string
  lastInteractionAt: string | null
  firstInteractionAt: string | null
  nextMeeting: { id: string; title: string; scheduledAt: string | null } | null
  directions: Record<ActionDirection, number>
  themes: string[]
  timeZone: string
  now: Date
  className?: string
}) {
  const open = DIRECTION_ORDER.filter((d) => d !== 'completed' && directions[d] > 0)

  return (
    <section
      aria-label={`Where things stand with ${firstName}`}
      className={cn('min-w-0', className)}
    >
      <dl className="border-line bg-surface grid grid-cols-2 gap-x-5 gap-y-5 rounded-[var(--radius-lg)] border p-4 sm:grid-cols-4 sm:p-5">
        <Tile icon={MessagesSquare} label="Last spoke">
          {lastInteractionAt ? (
            isFuture(lastInteractionAt) ? (
              <>Logged for {relativeDay(lastInteractionAt, timeZone, now).toLowerCase()}</>
            ) : (
              relativeDay(lastInteractionAt, timeZone, now)
            )
          ) : (
            <span className="text-ink-muted">Not yet</span>
          )}
        </Tile>

        <Tile icon={CalendarClock} label="Next">
          {nextMeeting ? (
            <Link
              href={`/meetings/${nextMeeting.id}/brief`}
              className="hover:text-accent block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <span className="block">
                {nextMeeting.scheduledAt
                  ? relativeDay(nextMeeting.scheduledAt, timeZone, now)
                  : 'Planned'}
              </span>
              <span className="text-ink-muted block truncate text-xs">{nextMeeting.title}</span>
            </Link>
          ) : (
            <span className="text-ink-muted">Nothing scheduled</span>
          )}
        </Tile>

        <Tile icon={History} label="Open" className="col-span-2 sm:col-span-1">
          {open.length > 0 ? (
            <span className="flex flex-wrap gap-1.5">
              {open.map((d) => (
                <DirectionChip key={d} direction={d} count={directions[d]} short />
              ))}
            </span>
          ) : (
            <span className="text-ink-muted">Nothing open</span>
          )}
        </Tile>

        <Tile icon={History} label="On record since" className="hidden sm:block">
          {firstInteractionAt ? (
            formatDate(firstInteractionAt, timeZone)
          ) : (
            <span className="text-ink-muted">No history yet</span>
          )}
        </Tile>
      </dl>

      {themes.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-ink-muted mr-1 inline-flex items-center gap-1 text-xs">
            <Tags className="size-3.5" aria-hidden="true" />
            Recent themes
          </span>
          {themes.map((t) => (
            <Chip key={t} tone="neutral">
              {t}
            </Chip>
          ))}
        </div>
      ) : null}
    </section>
  )
}
