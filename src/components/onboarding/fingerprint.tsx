import { DIMENSION_BY_ID } from '@/lib/assessment/instrument'
import type { DimensionScore } from '@/lib/assessment/scoring'
import { cn } from '@/lib/utils'

/**
 * COMMUNICATION FINGERPRINT
 * =============================================================================
 * Eight continua, each a hairline with a brass marker.
 *
 * Deliberately not a radar chart. A radar plots eight values as an area, which
 * implies the values combine into a shape with meaning — bigger is better,
 * spikier is more distinctive. Neither is true here: both ends of every axis are
 * equally valid, and a score near the middle is a real answer rather than a
 * deficiency.
 *
 * The shaded band marks the neutral zone, so "balanced" reads as a deliberate
 * region rather than a failure to score.
 * =============================================================================
 */

/** Matches NEUTRAL_BAND in scoring.ts: within 8 points of the midpoint. */
const NEUTRAL_BAND = 8

export function Fingerprint({
  dimensions,
  className,
  animate = true,
}: {
  dimensions: DimensionScore[]
  className?: string
  animate?: boolean
}) {
  return (
    <ul className={cn('grid gap-7', className)}>
      {dimensions.map((d, index) => {
        const dimension = DIMENSION_BY_ID[d.dimension]
        const isNeutral = d.lean === null

        return (
          <li
            key={d.dimension}
            style={
              animate
                ? {
                    animation: 'rise 0.5s var(--ease-out-quint) both',
                    animationDelay: `${0.08 * index}s`,
                  }
                : undefined
            }
          >
            <div className="flex items-baseline justify-between gap-4">
              <span className="label">{dimension.label}</span>
              <span
                className={cn(
                  'text-xs font-medium',
                  isNeutral ? 'text-ink-muted' : 'text-accent',
                )}
              >
                {isNeutral
                  ? 'Balanced'
                  : d.lean === 'high'
                    ? dimension.highPole.name
                    : dimension.lowPole.name}
              </span>
            </div>

            {/* The axis */}
            <div className="relative mt-3 h-5">
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />

              {/* Neutral band */}
              <div
                aria-hidden="true"
                className="absolute top-1/2 h-2.5 -translate-y-1/2 bg-line/50"
                style={{
                  left: `${50 - NEUTRAL_BAND}%`,
                  width: `${NEUTRAL_BAND * 2}%`,
                }}
              />

              {/* Marker */}
              <span
                className={cn(
                  'absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4',
                  isNeutral
                    ? 'bg-ink-faint ring-bg'
                    : 'bg-accent-graphic ring-bg',
                )}
                style={{ left: `${d.score}%` }}
                role="img"
                aria-label={`${dimension.label}: ${d.score} out of 100, ${
                  isNeutral
                    ? 'balanced'
                    : d.lean === 'high'
                      ? dimension.highPole.name
                      : dimension.lowPole.name
                }`}
              />
            </div>

            <div className="mt-2 flex justify-between gap-4 text-[0.6875rem] text-ink-faint">
              <span>{dimension.lowPole.name}</span>
              <span>{dimension.highPole.name}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
