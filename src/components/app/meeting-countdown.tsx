'use client'

import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/primitives'
import { countdownLabel } from '@/lib/brief'
import { useClock } from '@/lib/use-clock'
import { cn } from '@/lib/utils'

/**
 * "IN 7 MINUTES"
 * =============================================================================
 * The countdown is the one label on Today that is wrong the instant it renders,
 * so it is the one label that ticks.
 *
 * HYDRATION. The server renders against its own `now`; the client must produce
 * the same HTML on its first pass or React throws the markup away. `useClock`
 * returns null until after hydration, so the server's `nowIso` is what both
 * renders use and the label only moves to the reader's own clock afterwards.
 * Reading `Date.now()` during render is the version of this that looks fine
 * locally and logs #418 in production.
 *
 * It ticks every 30 seconds rather than every second. A per-second countdown to
 * a meeting is a stress object, and the difference between "in 7 minutes" and
 * "in 6 minutes" does not need to be observed arriving.
 * =============================================================================
 */

/** Live relative time to a meeting start. Falls back to nothing when undated. */
export function LiveCountdown({
  startsAt,
  nowIso,
  className,
}: {
  startsAt: string
  /** Server render time, so the first client render matches the server's. */
  nowIso: string
  className?: string
}) {
  // Null until hydration has matched the server's markup, then the real clock.
  const clientNow = useClock()
  const label = countdownLabel(startsAt, clientNow ?? new Date(nowIso))
  if (!label) return null

  // Deliberately NOT a live region. It changes on a timer with no user action
  // behind it, so `aria-live` would interrupt somebody every thirty seconds to
  // tell them a number went down by one. The absolute start time sits beside
  // it, is static, and is the thing worth reading once.
  return <span className={className}>{label}</span>
}

/**
 * The pinned card at the top of Today when a meeting is close.
 *
 * It exists because the path to the one screen this product is for was four
 * taps: open, Today, find the meeting, open the brief, choose Quick Brief. The
 * button here goes straight to the shortest useful view.
 */
export function MeetingCountdownCard({
  meetingId,
  title,
  startsAt,
  nowIso,
  timeLabel,
  hasBrief,
  className,
}: {
  meetingId: string
  title: string
  startsAt: string
  nowIso: string
  /** Absolute start time, already formatted in the account holder's zone. */
  timeLabel: string
  hasBrief: boolean
  className?: string
}) {
  return (
    <section
      className={cn(
        'border-accent/25 bg-accent-wash rounded-[var(--radius-lg)] border p-5 sm:p-6',
        className,
      )}
      aria-labelledby="countdown-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-4">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <CalendarClock className="text-accent size-3.5 shrink-0" aria-hidden="true" />
            <Badge tone="accent">
              <LiveCountdown startsAt={startsAt} nowIso={nowIso} />
            </Badge>
            <span className="text-ink-muted text-xs">{timeLabel}</span>
          </p>

          <h2 id="countdown-title" className="font-display text-ink mt-2.5 text-xl sm:text-2xl">
            {title}
          </h2>
        </div>

        {/* Says what the reader gets, not what the control does. */}
        <Button asChild size="lg" className="min-h-11">
          <Link href={hasBrief ? `/meetings/${meetingId}/glance` : `/meetings/${meetingId}/brief`}>
            {hasBrief ? 'What you need' : 'Prepare'}
          </Link>
        </Button>
      </div>
    </section>
  )
}
