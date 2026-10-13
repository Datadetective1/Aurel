import Link from 'next/link'
import { ArrowRight, CircleCheck, CircleDashed, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FaceStack } from '@/components/app/face-stack'
import { formatNames } from '@/components/app/face-stack'
import { PREP_META, type PrepState } from '@/lib/visual/glance'
import { formatTime, relativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Chip, ChipRow } from './chip'
import { CompanyMark } from './company-mark'
import { DIRECTION_ICON } from './direction'

/**
 * AN UPCOMING MEETING, AS A CARD
 * =============================================================================
 * Faces first, then the time and title, then the two facts that decide what
 * to do: whether it is prepared, and what is open with these people. One
 * action. The objective is one line at most -- the brief is a tap away.
 * =============================================================================
 */

export interface MeetingCardPerson {
  id: string
  name: string
  fullName: string
  src: string | null
  company: string | null
  companyDomain: string | null
}

const PREP_ICON: Record<PrepState, typeof CircleCheck> = {
  ready: CircleCheck,
  needs_people: UserPlus,
  not_prepared: CircleDashed,
}

export function MeetingCard({
  id,
  title,
  scheduledAt,
  objective,
  people,
  prep,
  openLoops,
  owe,
  important = false,
  timeZone,
  now,
  className,
}: {
  id: string
  title: string
  scheduledAt: string | null
  objective: string | null
  people: MeetingCardPerson[]
  prep: PrepState
  openLoops: number
  owe: number
  important?: boolean
  timeZone: string
  now: Date
  className?: string
}) {
  const company = people.find((p) => p.company)
  const meta = PREP_META[prep]

  return (
    <article
      className={cn('flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5', className)}
    >
      <div className="flex min-w-0 flex-1 items-start gap-4">
        {people.length > 0 ? (
          <FaceStack
            people={people.map((p) => ({ id: p.id, name: p.fullName, src: p.src }))}
            size="lg"
            max={3}
            className="shrink-0"
          />
        ) : (
          <span
            aria-hidden="true"
            className="border-line text-ink-muted flex size-14 shrink-0 items-center justify-center rounded-full border border-dashed"
          >
            <UserPlus className="size-5" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-ink-muted flex flex-wrap items-center gap-x-2 text-xs">
            <span className="text-ink-secondary font-medium">
              {scheduledAt
                ? `${relativeDay(scheduledAt, timeZone, now)} · ${formatTime(scheduledAt, timeZone)}`
                : 'Unscheduled'}
            </span>
            {company?.company ? (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span aria-hidden="true">·</span>
                <CompanyMark name={company.company} domain={company.companyDomain} size="xs" />
                <span className="truncate">{company.company}</span>
              </span>
            ) : null}
          </p>
          <h3 className="mt-1">
            <Link
              href={`/meetings/${id}`}
              className="font-display text-ink hover:text-accent text-lg leading-snug focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              {title}
            </Link>
          </h3>
          {people.length > 0 ? (
            <p className="text-ink-secondary mt-0.5 truncate text-sm">
              {formatNames(people.map((p) => p.name))}
            </p>
          ) : null}
          {objective ? (
            <p className="text-ink-muted mt-1 line-clamp-1 text-xs">{objective}</p>
          ) : null}

          <ChipRow className="mt-2.5">
            <Chip icon={PREP_ICON[prep]} tone={meta.tone}>
              {meta.label}
            </Chip>
            {owe > 0 ? (
              <Chip icon={DIRECTION_ICON.owe} tone="accent">
                You owe {owe}
              </Chip>
            ) : null}
            {openLoops > owe ? <Chip tone="neutral">{openLoops - owe} open</Chip> : null}
            {important ? <Chip tone="quiet">Matters most</Chip> : null}
          </ChipRow>
        </div>
      </div>

      <Button
        asChild
        variant={prep === 'ready' ? 'secondary' : 'primary'}
        size="md"
        className="min-h-11 w-full shrink-0 sm:w-auto"
      >
        <Link href={prep === 'ready' ? `/meetings/${id}/glance` : `/meetings/${id}/brief`}>
          {prep === 'ready' ? 'Open brief' : 'Prepare'}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </Button>
    </article>
  )
}
