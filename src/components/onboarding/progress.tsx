import { cn } from '@/lib/utils'

/**
 * Onboarding progress.
 *
 * Three named phases rather than a step counter. A counter invites the user to
 * compute how much is left and bail; naming the phases tells them what each one
 * is *for*. The rule fills continuously so partial progress inside a phase is
 * still visible.
 */

const PHASES = [
  { id: 'you', label: 'About you', short: 'You', stages: ['welcome', 'about', 'intent'] },
  { id: 'context', label: 'Your context', short: 'Context', stages: ['frameworks', 'coaching', 'appearance'] },
  // "Interaction Profile" does not fit three-up on a 390px screen, so narrow
  // viewports get the short form rather than a truncated one.
  { id: 'profile', label: 'Interaction Profile', short: 'Profile', stages: ['assessment', 'reveal', 'done'] },
] as const

const ORDER = PHASES.flatMap((p) => p.stages)

export function OnboardingProgress({ stage }: { stage: string }) {
  const index = Math.max(0, ORDER.indexOf(stage as (typeof ORDER)[number]))
  const activePhase = PHASES.findIndex((p) => (p.stages as readonly string[]).includes(stage))
  const currentPhase = activePhase === -1 ? 0 : activePhase

  return (
    <nav aria-label="Onboarding progress" className="py-7">
      <ol className="flex gap-2">
        {PHASES.map((phase, i) => {
          const done = i < currentPhase
          const active = i === currentPhase
          // Fraction of this phase completed, for the active segment only.
          const startIndex = ORDER.indexOf(phase.stages[0])
          const within = Math.min(
            Math.max((index - startIndex + (done ? phase.stages.length : 0)) / phase.stages.length, 0),
            1,
          )

          return (
            <li key={phase.id} className="flex-1">
              <div
                className="h-px w-full overflow-hidden bg-line"
                role="presentation"
                aria-hidden="true"
              >
                <div
                  className={cn(
                    'h-full bg-accent-graphic transition-[width] duration-500 ease-[var(--ease-out-quint)]',
                  )}
                  style={{ width: done ? '100%' : active ? `${Math.round(within * 100)}%` : '0%' }}
                />
              </div>
              <span
                className={cn(
                  'label mt-2.5 block truncate',
                  active ? 'text-accent' : done ? 'text-ink-secondary' : 'text-ink-faint',
                )}
                aria-current={active ? 'step' : undefined}
              >
                <span className="sm:hidden">{phase.short}</span>
                <span className="hidden sm:inline">{phase.label}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
