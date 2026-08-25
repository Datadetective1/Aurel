'use client'

import * as React from 'react'
import { ArrowRight, CircleCheck, CircleHelp, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/primitives'

/**
 * HERO DEMONSTRATION
 * =============================================================================
 * A staged reconstruction of the real product: a meeting, the room, the recorded
 * evidence, and the guidance Aurel composes from it.
 *
 * Deliberately NOT a video, a looping gradient or fake analytics. Every element
 * on screen is a shape the product actually renders, using the same evidence
 * vocabulary (confirmed / observed / inferred) the app uses, so the hero makes a
 * promise the product keeps.
 *
 * Motion is a single forward pass on mount. It never loops — an interface that
 * animates forever reads as a toy. Under prefers-reduced-motion every stage is
 * simply visible from the start.
 * =============================================================================
 */

interface Participant {
  name: string
  role: string
  chip: string
  evidence: 'confirmed' | 'observed' | 'inferred'
  signal: string
}

const PARTICIPANTS: Participant[] = [
  {
    name: 'Maya Chen',
    role: 'Decision maker',
    chip: 'VP Engineering',
    evidence: 'observed',
    signal: 'Asked for utilisation evidence before the forecast in the last two reviews.',
  },
  {
    name: 'Daniel Brooks',
    role: 'Influencer',
    chip: 'Finance Director',
    evidence: 'confirmed',
    signal: 'Told you he wants the cost impact stated before the recommendation.',
  },
  {
    name: 'Priya Shah',
    role: 'Contributor',
    chip: 'Program Manager',
    evidence: 'inferred',
    signal: 'May be carrying the timeline risk — worth checking rather than assuming.',
  },
]

const EVIDENCE_META = {
  confirmed: { label: 'Confirmed', tone: 'positive' as const, Icon: CircleCheck },
  observed: { label: 'Observed', tone: 'info' as const, Icon: Eye },
  inferred: { label: 'Inferred', tone: 'caution' as const, Icon: CircleHelp },
}

export function HeroDemo({ className }: { className?: string }) {
  // Gate the animation on mount so server-rendered HTML is the finished state.
  // If JS never runs, the user still sees the complete, correct composition.
  const [playing, setPlaying] = React.useState(false)
  React.useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduce) setPlaying(true)
  }, [])

  const stage = (index: number) =>
    playing
      ? {
          animation: `settle 0.7s var(--ease-out-quint) both`,
          animationDelay: `${0.15 + index * 0.14}s`,
        }
      : undefined

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface',
        className,
      )}
    >
      {/* Meeting header */}
      <div className="border-b border-line px-5 py-4 sm:px-7" style={stage(0)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="label">Tomorrow · 09:30</span>
            <p className="mt-1.5 font-display text-lg text-ink sm:text-xl">Q3 capacity review</p>
          </div>
          <Badge tone="accent">Importance 5 / 5</Badge>
        </div>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-secondary">
          <span className="text-ink-muted">Your objective — </span>
          Get approval to move two engineers onto the migration before the quarter closes.
        </p>
      </div>

      {/* The room */}
      <div className="border-b border-line px-5 py-4 sm:px-7">
        <span className="label">In the room</span>
        <ul className="mt-3 space-y-3">
          {PARTICIPANTS.map((p, i) => {
            const meta = EVIDENCE_META[p.evidence]
            return (
              <li key={p.name} className="flex gap-3" style={stage(1 + i)}>
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-bg-sunken text-[0.6875rem] font-medium text-ink-secondary"
                >
                  {p.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-ink">{p.name}</span>
                    <span className="text-xs text-ink-muted">{p.chip}</span>
                    <Badge tone="outline">{p.role}</Badge>
                  </div>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-secondary">
                    {p.signal}
                  </p>
                  <span className="mt-1.5 inline-flex items-center gap-1.5 text-[0.6875rem] tracking-[0.06em] text-ink-muted uppercase">
                    <meta.Icon
                      className={cn(
                        'size-3',
                        p.evidence === 'confirmed' && 'text-positive',
                        p.evidence === 'observed' && 'text-info',
                        p.evidence === 'inferred' && 'text-caution',
                      )}
                      aria-hidden="true"
                    />
                    {meta.label}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      {/* What Aurel produces */}
      <div className="bg-bg-sunken px-5 py-5 sm:px-7" style={stage(4)}>
        <span className="label">Aurel&rsquo;s brief</span>

        <p className="mt-3 text-sm leading-relaxed text-ink">
          Open with the decision, not the method. Daniel wants the cost impact first; Maya will ask
          what the utilisation data shows before she commits.
        </p>

        <ol className="mt-4 space-y-2">
          {[
            'State the ask in one sentence.',
            'Give Daniel the cost impact before the reasoning.',
            'Show Maya the utilisation evidence, then return to the decision.',
            'Leave with an owner and a date.',
          ].map((step, i) => (
            <li key={step} className="flex gap-2.5 text-[0.8125rem] leading-relaxed text-ink-secondary">
              <span className="mt-px font-display text-accent tabular-nums">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>

        <div className="mt-5 flex items-start gap-2.5 rounded-[var(--radius-md)] border border-caution/25 bg-caution-wash px-3.5 py-3">
          <CircleHelp className="mt-0.5 size-3.5 shrink-0 text-caution" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-ink-secondary">
            <span className="font-medium text-ink">What Aurel doesn&rsquo;t know — </span>
            you have no recorded history with Priya. Nothing above is a read on her.
          </p>
        </div>
      </div>

      {/* Footer strip */}
      <div
        className="flex items-center gap-2 border-t border-line px-5 py-3 text-xs text-ink-muted sm:px-7"
        style={stage(5)}
      >
        <ArrowRight className="size-3.5 text-accent" aria-hidden="true" />
        Every line above traces back to something you recorded.
      </div>
    </div>
  )
}
