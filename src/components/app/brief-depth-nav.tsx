import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * BRIEF DEPTH NAVIGATION
 * =============================================================================
 * One brief, three depths: what you need, sixty seconds, everything.
 *
 * Real routes and real links rather than collapsible regions. Three reasons,
 * in order of how much they mattered:
 *
 *   1. A person in a corridor needs to arrive at a depth, not operate a widget.
 *      A link can be sent, bookmarked, opened from Today and pressed back out
 *      of; a disclosure state cannot.
 *   2. Keyboard and screen-reader behaviour is inherited. `aria-current` on a
 *      link is understood everywhere; a hand-rolled tablist over three panels
 *      is three more things to get wrong.
 *   3. The deep view is heavy. Collapsing it would still render and hydrate it
 *      behind a phone that only ever wanted six lines.
 *
 * The labels say what the reader gets, never what the control does. "Expand"
 * and "Show more" describe the mechanism; "Sixty seconds" describes the
 * promise, and it is a promise the view keeps.
 *
 * WHY THE THREE LINKS ARE WRITTEN OUT
 *
 * The first version mapped over a config array and built each href as
 * `/meetings/${id}/${depth.path}`. That reduces to `/meetings/[dynamic]/
 * [dynamic]` for tests/unit/internal-links, which cannot then tell whether any
 * of the three routes exists — and this rail introduced a brand new one. Three
 * literal hrefs cost a few lines and are the reason a missing route fails the
 * build rather than 404ing under someone's thumb.
 * =============================================================================
 */

export type BriefDepth = 'glance' | 'quick' | 'deep'

export function BriefDepthNav({
  meetingId,
  current,
  className,
}: {
  meetingId: string
  current: BriefDepth
  className?: string
}) {
  return (
    <nav aria-label="How much of the brief to read" className={cn('min-w-0', className)}>
      {/* Hidden rather than absent: the row reads as three labels, and without
          this a screen-reader user meets them with no idea they are depths of
          one document. */}
      <h2 className="sr-only">How much of the brief to read</h2>

      {/* Scrolls rather than wraps on a narrow phone, using the clipped item at
          the edge as the affordance -- the same pattern as the settings rail.
          `min-w-0` on the container is load-bearing: without it a grid item
          defaults to min-width:auto and this row widens its column instead of
          scrolling, which sends the whole page sideways. */}
      <ul className="scrollbar-none -mx-1 flex min-w-0 gap-1 overflow-x-auto px-1">
        <li className="shrink-0">
          <DepthLink
            href={`/meetings/${meetingId}/glance`}
            active={current === 'glance'}
            hint="The essentials, in ten seconds"
          >
            What you need
          </DepthLink>
        </li>
        <li className="shrink-0">
          <DepthLink
            href={`/meetings/${meetingId}/quick`}
            active={current === 'quick'}
            hint="The room, the pushback, the outcome"
          >
            Sixty seconds
          </DepthLink>
        </li>
        <li className="shrink-0">
          <DepthLink
            href={`/meetings/${meetingId}/brief`}
            active={current === 'deep'}
            hint="The full brief and its evidence"
          >
            Everything
          </DepthLink>
        </li>
      </ul>
    </nav>
  )
}

function DepthLink({
  href,
  active,
  hint,
  children,
}: {
  href: string
  active: boolean
  hint: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      title={hint}
      className={cn(
        // 44px, so this is usable with a thumb while walking.
        'flex min-h-11 items-center rounded-[var(--radius-md)] border px-3.5 text-[0.8125rem] font-medium whitespace-nowrap',
        'transition-[background-color,color,border-color] duration-200 ease-[var(--ease-out-quint)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
        active
          ? 'border-line-strong bg-surface text-ink'
          : 'border-transparent text-ink-muted hover:bg-bg-sunken hover:text-ink',
      )}
    >
      {children}
    </Link>
  )
}
