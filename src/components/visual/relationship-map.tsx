import { Fragment } from 'react'
import Link from 'next/link'
import { CalendarClock, GraduationCap, History, MessagesSquare, Tags, Users } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import type { ActionDirection } from '@/lib/visual/relationship-actions'
import { DIRECTION_ORDER } from '@/lib/visual/relationship-actions'
import { formatDate, pluralise, relativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Chip } from './chip'
import { CompanyMark } from './company-mark'
import { DirectionChip } from './direction'

/**
 * HOW YOU ARE CONNECTED
 * =============================================================================
 * The relationship drawn as what it is made of -- you, them, and the things
 * your record holds between you:
 *
 *   YOU ── PERSON
 *          ├── their organisation (and who else you know there)
 *          ├── meetings together, and the next one
 *          ├── conversations kept, and the last one
 *          ├── what is open, by direction
 *          └── shared background, only from confirmed or observed facts
 *
 * Every branch is a row the record already holds; a branch with nothing
 * behind it is not drawn. No score, no strength, no inferred association.
 * It replaces the four-tile glance and carries the same facts.
 * =============================================================================
 */

export interface RelationshipMapProps {
  you: { name: string; src: string | null }
  person: { name: string; fullName: string; src: string | null }
  organization: {
    name: string
    domain: string | null
    title: string | null
    /** Others in the user's record at the same organisation. */
    colleagues: { id: string; name: string; src: string | null }[]
  } | null
  meetings: {
    held: number
    next: { id: string; title: string; scheduledAt: string | null } | null
  }
  conversations: {
    count: number
    lastAt: string | null
    firstAt: string | null
    lastId: string | null
  }
  directions: Record<ActionDirection, number>
  /** Sourced background facts (education, prior employers). */
  background: { label: string; kind: 'education' | 'prior_role' }[]
  themes: string[]
  timeZone: string
  now: Date
  className?: string
}

function Branch({
  icon: Icon,
  children,
  href,
  last = false,
}: {
  icon: typeof History
  children: React.ReactNode
  href?: string | null
  last?: boolean
}) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className="border-line bg-bg text-ink-secondary flex size-7 shrink-0 items-center justify-center rounded-full border"
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 text-sm leading-snug">{children}</span>
    </>
  )
  return (
    <li
      className={cn(
        'relative min-w-0 pl-6',
        // the trunk, and the twig into this branch
        'before:bg-line-strong before:absolute before:top-0 before:left-0 before:w-px',
        last ? 'before:h-[1.375rem]' : 'before:h-full',
        'after:bg-line-strong after:absolute after:top-[1.375rem] after:left-0 after:h-px after:w-5',
      )}
    >
      {href ? (
        <Link
          href={href}
          className="hover:bg-bg-sunken/60 -mx-1.5 flex min-h-11 items-center gap-2.5 rounded-[var(--radius-md)] px-1.5 py-1.5 focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-h-11 items-center gap-2.5 py-1.5">{body}</div>
      )}
    </li>
  )
}

export function RelationshipMap({
  you,
  person,
  organization,
  meetings,
  conversations,
  directions,
  background,
  themes,
  timeZone,
  now,
  className,
}: RelationshipMapProps) {
  const first = person.name.split(' ')[0] ?? person.name
  const open = DIRECTION_ORDER.filter((d) => d !== 'completed' && directions[d] > 0)

  const branches: { key: string; node: (last: boolean) => React.ReactNode }[] = []

  if (organization) {
    branches.push({
      key: 'org',
      node: (last) => (
        <Branch icon={Users} last={last}>
          <span className="flex min-w-0 items-center gap-1.5">
            <CompanyMark name={organization.name} domain={organization.domain} size="xs" />
            <span className="text-ink truncate font-medium">{organization.name}</span>
          </span>
          {organization.title || organization.colleagues.length > 0 ? (
            <span className="text-ink-muted mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
              {organization.title ? (
                <span className="min-w-0 truncate">{organization.title}</span>
              ) : null}
              {organization.colleagues.length > 0 ? (
                <span className="inline-flex shrink-0 items-center gap-1">
                  <span className="flex -space-x-1.5">
                    {organization.colleagues.slice(0, 3).map((c) => (
                      <Avatar
                        key={c.id}
                        name={c.name}
                        src={c.src}
                        size="xs"
                        className="ring-surface ring-2"
                      />
                    ))}
                  </span>
                  <span>{pluralise(organization.colleagues.length, 'other')} you know there</span>
                </span>
              ) : null}
            </span>
          ) : null}
        </Branch>
      ),
    })
  }

  branches.push({
    key: 'meetings',
    node: (last) => (
      <Branch
        icon={CalendarClock}
        last={last}
        href={meetings.next ? `/meetings/${meetings.next.id}/brief` : null}
      >
        {meetings.next ? (
          <>
            <span className="text-ink">
              Next{' '}
              <span className="font-medium">
                {meetings.next.scheduledAt
                  ? relativeDay(meetings.next.scheduledAt, timeZone, now).toLowerCase()
                  : 'unscheduled'}
              </span>
            </span>
            <span className="text-ink-muted block truncate text-xs">
              {meetings.next.title}
              {meetings.held > 0 ? ` · ${pluralise(meetings.held, 'meeting')} before` : ''}
            </span>
          </>
        ) : meetings.held > 0 ? (
          <span className="text-ink">
            {pluralise(meetings.held, 'meeting')} together
            <span className="text-ink-muted block text-xs">Nothing scheduled</span>
          </span>
        ) : (
          <span className="text-ink-muted">No meetings yet</span>
        )}
      </Branch>
    ),
  })

  branches.push({
    key: 'conversations',
    node: (last) => (
      <Branch
        icon={MessagesSquare}
        last={last}
        href={conversations.lastId ? `/conversations/${conversations.lastId}` : null}
      >
        {conversations.lastAt ? (
          <>
            <span className="text-ink">
              Last spoke{' '}
              <span className="font-medium">
                {relativeDay(conversations.lastAt, timeZone, now).toLowerCase()}
              </span>
            </span>
            <span className="text-ink-muted block truncate text-xs">
              {conversations.count > 0
                ? `${pluralise(conversations.count, 'conversation')} kept`
                : 'No conversation kept'}
              {conversations.firstAt
                ? ` · since ${formatDate(conversations.firstAt, timeZone)}`
                : ''}
            </span>
          </>
        ) : (
          <span className="text-ink-muted">No conversation yet</span>
        )}
      </Branch>
    ),
  })

  branches.push({
    key: 'open',
    node: (last) => (
      <Branch icon={History} last={last} href={open.length > 0 ? '#loops-heading' : null}>
        {open.length > 0 ? (
          <span className="flex flex-wrap gap-1.5">
            {open.map((d) => (
              <DirectionChip key={d} direction={d} count={directions[d]} short />
            ))}
          </span>
        ) : (
          <span className="text-ink-muted">Nothing open either way</span>
        )}
      </Branch>
    ),
  })

  if (background.length > 0) {
    branches.push({
      key: 'background',
      node: (last) => (
        <Branch icon={GraduationCap} last={last}>
          <span className="text-ink-secondary text-xs">Background, from sources</span>
          <span className="mt-1 flex flex-wrap gap-1.5">
            {background.slice(0, 3).map((b) => (
              <Chip key={`${b.kind}-${b.label}`} tone="neutral">
                {b.kind === 'education' ? b.label : `Formerly ${b.label}`}
              </Chip>
            ))}
          </span>
        </Branch>
      ),
    })
  }

  return (
    <section
      aria-label={`How you are connected to ${first}`}
      className={cn(
        'border-line bg-surface min-w-0 rounded-[var(--radius-lg)] border p-4 sm:p-5',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5">
          <Avatar name={you.name} src={you.src} size="sm" />
          <span className="text-ink-secondary text-xs font-medium">You</span>
        </span>
        <span aria-hidden="true" className="bg-line-strong h-px w-6 sm:w-10" />
        <span className="flex min-w-0 items-center gap-1.5">
          <Avatar name={person.fullName} src={person.src} size="sm" />
          <span className="text-ink truncate text-xs font-medium">{first}</span>
        </span>
      </div>

      <ul className="mt-1 ml-4 grid grid-cols-[minmax(0,1fr)]">
        {branches.map((b, i) => (
          <Fragment key={b.key}>{b.node(i === branches.length - 1)}</Fragment>
        ))}
      </ul>

      {themes.length > 0 ? (
        <div className="border-line mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
          <span className="text-ink-muted mr-1 inline-flex items-center gap-1 text-xs">
            <Tags className="size-3.5" aria-hidden="true" />
            Recent themes
          </span>
          {themes.slice(0, 5).map((t) => (
            <Chip key={t} tone="neutral">
              {t}
            </Chip>
          ))}
        </div>
      ) : null}
    </section>
  )
}
