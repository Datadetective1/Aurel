import Link from 'next/link'
import { ArrowRight, CircleAlert, Mic, Quote, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { VisualGlance } from '@/lib/visual/types'
import { DIRECTION_META } from '@/lib/visual/relationship-actions'
import { relativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DIRECTION_ICON } from './direction'

/**
 * THE GLANCE
 * =============================================================================
 * Five to ten seconds, on a phone, walking. Four blocks at most:
 *
 *   OBJECTIVE   what you want out of it, in display type
 *   REMEMBER    up to three lines selected from the record
 *   OPEN LOOP   the one thing open between you worth naming
 *   ACTIONS     capture, or go one depth deeper
 *
 * Each REMEMBER line keeps its basis -- "What matters to Columbus", "Last
 * time: Prototype walkthrough" -- as a quiet second line, so even the
 * shortest view says where it got what it says.
 * =============================================================================
 */

export function GlanceBrief({
  glance,
  meetingId,
  timeZone,
  now,
  className,
}: {
  glance: VisualGlance
  meetingId: string
  timeZone: string
  now: Date
  className?: string
}) {
  const loop = glance.openLoop
  const LoopIcon = loop ? DIRECTION_ICON[loop.direction] : null

  return (
    <div className={cn('grid gap-7', className)}>
      {glance.objective ? (
        <section>
          <h2 className="label flex items-center gap-1.5">
            <Target className="text-accent size-3.5" aria-hidden="true" />
            Objective
          </h2>
          <p className="font-display text-ink mt-2 text-[1.375rem] leading-snug text-balance">
            {glance.objective}
          </p>
        </section>
      ) : null}

      {glance.remember.length > 0 ? (
        <section>
          <h2 className="label">Remember</h2>
          <ul className="mt-3 grid gap-3">
            {glance.remember.map((item, i) => (
              <li key={i} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="bg-accent-graphic mt-[0.5625rem] size-1.5 shrink-0 rounded-full"
                />
                <span className="min-w-0">
                  <span className="text-ink block text-[0.9375rem] leading-snug">{item.text}</span>
                  <span className="text-ink-muted mt-0.5 block text-xs">{item.basis}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {loop && LoopIcon ? (
        <section
          className={cn(
            'rounded-[var(--radius-lg)] border px-4 py-3.5',
            loop.overdue
              ? 'border-critical/25 bg-critical-wash'
              : 'border-accent/25 bg-accent-wash',
          )}
        >
          <h2
            className={cn(
              'label flex items-center gap-1.5',
              loop.overdue ? 'text-critical' : 'text-accent',
            )}
          >
            {loop.overdue ? (
              <CircleAlert className="size-3.5" aria-hidden="true" />
            ) : (
              <LoopIcon className="size-3.5" aria-hidden="true" />
            )}
            {loop.overdue ? 'Overdue' : 'Open loop'}
          </h2>
          <p className="text-ink mt-2 text-[0.9375rem] leading-snug">{loop.description}</p>
          <p className="text-ink-muted mt-1 text-xs">
            {DIRECTION_META[loop.direction].label}
            {loop.personName && loop.direction !== 'owe' ? ` · ${loop.personName}` : ''}
            {loop.dueOn ? ` · due ${relativeDay(loop.dueOn, timeZone, now).toLowerCase()}` : ''}
          </p>
        </section>
      ) : null}

      {glance.howToOpen ? (
        <section>
          <h2 className="label flex items-center gap-1.5">
            <Quote className="text-accent size-3.5" aria-hidden="true" />
            Open with
          </h2>
          <blockquote className="border-accent-graphic text-ink-secondary mt-2 border-l-2 pl-3.5 text-sm leading-relaxed">
            {glance.howToOpen}
          </blockquote>
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5">
        <Button asChild size="lg" variant="secondary" className="w-full">
          <Link href={`/conversations/new?meeting=${meetingId}`}>
            <Mic className="size-4" aria-hidden="true" />
            Capture
          </Link>
        </Button>
        <Button asChild size="lg" className="w-full">
          <Link href={`/meetings/${meetingId}/quick`}>
            More
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  )
}
