'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Check,
  CircleAlert,
  CircleHelp,
  Clock,
  Handshake,
  Loader2,
  RotateCcw,
  X,
} from 'lucide-react'
import { setLoopStatus } from '@/app/(app)/loops/actions'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/primitives'
import { displayStatus, type LoopAction } from '@/lib/conversations/loops'
import type { LoopRecord } from '@/lib/conversations/queries'
import { relativeDay } from '@/lib/format'
import { isOverdueIn } from '@/lib/tz'
import { cn } from '@/lib/utils'

/**
 * LOOP ROW
 * =============================================================================
 * One open loop: the face of whoever it concerns, what is owed, when, where it
 * came from, and three one-tap actions. Done, Later, Cancel. Nothing opens a
 * dialog. Nothing asks why.
 *
 * The row hides itself the moment an action succeeds, so a list of twelve
 * loops on a phone can be cleared without the page reloading under a thumb.
 * =============================================================================
 */

export function LoopRow({
  loop,
  timeZone,
  now,
  showPerson = true,
  showSource = true,
  highlighted = false,
  className,
}: {
  loop: LoopRecord
  timeZone: string
  now: Date
  showPerson?: boolean
  showSource?: boolean
  /** Arrived here from an email link: draw the eye to this row once. */
  highlighted?: boolean
  className?: string
}) {
  const [pending, setPending] = React.useState<LoopAction | null>(null)
  const [gone, setGone] = React.useState<LoopAction | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const overdue = loop.status === 'open' && isOverdueIn(loop.dueOn, timeZone, now)
  const status = displayStatus(loop.status)
  const closed = status === 'done' || status === 'cancelled'

  const act = async (action: LoopAction) => {
    setPending(action)
    setError(null)
    const result = await setLoopStatus(loop.id, action)
    if (result.ok) setGone(action)
    else setError(result.error ?? 'That could not be saved.')
    setPending(null)
  }

  if (gone) {
    return (
      <li
        id={`loop-${loop.id}`}
        className={cn(
          'border-line text-ink-muted flex items-center gap-3 rounded-[var(--radius-md)] border border-dashed px-4 py-2.5 text-xs',
          className,
        )}
        role="status"
      >
        <Check className="text-positive size-3.5" aria-hidden="true" />
        {gone === 'done'
          ? 'Done.'
          : gone === 'later'
            ? 'Set aside for a week.'
            : gone === 'cancel'
              ? 'Cancelled.'
              : 'Reopened.'}
        <button
          type="button"
          onClick={() => act(gone === 'reopen' ? 'done' : 'reopen')}
          className="text-ink-secondary ml-auto underline-offset-4 hover:underline"
        >
          Undo
        </button>
      </li>
    )
  }

  const kindIcon =
    loop.kind === 'question' ? (
      <CircleHelp className="text-info size-4 shrink-0" aria-hidden="true" />
    ) : overdue ? (
      <CircleAlert className="text-critical size-4 shrink-0" aria-hidden="true" />
    ) : (
      <Handshake className="text-ink-faint size-4 shrink-0" aria-hidden="true" />
    )

  const ownerLabel =
    loop.kind === 'question'
      ? 'Unanswered'
      : loop.owner === 'user'
        ? 'You promised'
        : loop.owner === 'person'
          ? `Waiting on ${loop.person?.name.split(' ')[0] ?? 'them'}`
          : 'Between you'

  return (
    <li
      id={`loop-${loop.id}`}
      className={cn(
        'bg-surface min-w-0 scroll-mt-24 rounded-[var(--radius-md)] border px-4 py-3',
        overdue ? 'border-critical/25' : 'border-line',
        closed && 'opacity-70',
        highlighted && 'ring-accent-graphic ring-offset-bg ring-2 ring-offset-2',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {showPerson && loop.person ? (
          <Link
            href={`/people/${loop.person.id}`}
            className="mt-0.5 shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            aria-label={loop.person.name}
          >
            <Avatar name={loop.person.name} src={loop.person.src} size="sm" />
          </Link>
        ) : (
          <span className="mt-1.5">{kindIcon}</span>
        )}

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-ink text-sm leading-relaxed',
              status === 'done' && 'text-ink-muted line-through',
              status === 'cancelled' && 'text-ink-muted',
            )}
          >
            {loop.description}
          </p>

          <div className="text-ink-muted mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1">
              {showPerson && loop.person ? kindIcon : null}
              {ownerLabel}
            </span>
            {loop.dueOn ? (
              <Badge tone={overdue ? 'critical' : 'neutral'}>
                <Clock className="size-3" aria-hidden="true" />
                {overdue
                  ? `Was due ${relativeDay(loop.dueOn, timeZone, now).toLowerCase()}`
                  : relativeDay(loop.dueOn, timeZone, now)}
              </Badge>
            ) : null}
            {status === 'later' && loop.deferredUntil ? (
              <Badge tone="outline">
                Back {relativeDay(loop.deferredUntil, timeZone, now).toLowerCase()}
              </Badge>
            ) : null}
            {showSource && loop.interactionId ? (
              <Link
                href={`/conversations/${loop.interactionId}`}
                className="hover:text-ink truncate underline-offset-4 hover:underline"
              >
                {loop.interactionTitle ?? 'Source conversation'}
              </Link>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="text-critical mt-2 text-xs">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {closed ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-10"
              onClick={() => act('reopen')}
              disabled={pending !== null}
              aria-label="Reopen"
            >
              {pending === 'reopen' ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="size-3.5" aria-hidden="true" />
              )}
              Reopen
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="min-h-10"
                onClick={() => act('done')}
                disabled={pending !== null}
              >
                {pending === 'done' ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="size-3.5" aria-hidden="true" />
                )}
                Done
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-10"
                onClick={() => act('later')}
                disabled={pending !== null}
                aria-label="Later"
              >
                {pending === 'later' ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Clock className="size-3.5" aria-hidden="true" />
                )}
                <span className="hidden sm:inline">Later</span>
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="quiet"
                className="size-10"
                onClick={() => act('cancel')}
                disabled={pending !== null}
                aria-label="Cancel this loop"
              >
                {pending === 'cancel' ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <X className="size-3.5" aria-hidden="true" />
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </li>
  )
}
