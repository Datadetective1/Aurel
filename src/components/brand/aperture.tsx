import { cn } from '@/lib/utils'

/**
 * THE AUREL APERTURE
 * =============================================================================
 * Aurel's visual motif is a *threshold*: nested arches receding toward a single
 * vanishing line. It encodes the product promise — walking into a room prepared —
 * without resorting to brains, networks or sparkles.
 *
 * Three components share the geometry so the mark, the field and the divider all
 * read as one system:
 *   <ApertureMark />   logomark, legible down to 16px
 *   <ApertureField />  large ambient field for heroes, reveals and email headers
 *   <ApertureRule />   a hairline divider that carries the arch silhouette
 * =============================================================================
 */

/** Arch path on a 0 0 24 24 grid, parameterised by half-width. */
function arch(halfWidth: number, baseline = 21, springLine = 12): string {
  const left = 12 - halfWidth
  const right = 12 + halfWidth
  return `M${left} ${baseline} V${springLine} a${halfWidth} ${halfWidth} 0 0 1 ${halfWidth * 2} 0 V${baseline}`
}

export function ApertureMark({
  className,
  strokeWidth = 1.5,
  title,
}: {
  className?: string
  strokeWidth?: number
  title?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      className={cn('h-6 w-6', className)}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <path d={arch(9)} />
      <path d={arch(4.5)} opacity={0.62} />
      {/* The vanishing line: the point the arches converge on. */}
      <path d="M12 21 V13.5" opacity={0.38} />
    </svg>
  )
}

/**
 * Ambient field. Renders `rings` nested arches with a linear opacity falloff so
 * the geometry recedes. Purely decorative — always hidden from assistive tech.
 */
export function ApertureField({
  className,
  rings = 9,
  strokeWidth = 0.35,
  accentRing = 2,
  chords = false,
  intensity = 1,
}: {
  className?: string
  /** Number of nested arches drawn from the outside in. */
  rings?: number
  strokeWidth?: number
  /** Which ring (from the outside, 0-indexed) is drawn in brass. */
  accentRing?: number
  /** Horizontal planes the arches pass through. Off by default: they read as
   *  rules and collide with real content when the field sits behind a layout. */
  chords?: boolean
  /** Global opacity multiplier. Keep low — this is atmosphere, not decoration. */
  intensity?: number
}) {
  const arches = Array.from({ length: rings }, (_, i) => {
    const t = i / rings
    return {
      d: arch(11.4 * (1 - t)),
      opacity: (0.17 - t * 0.13) * intensity,
      accent: i === accentRing,
    }
  })

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      preserveAspectRatio="xMidYMax meet"
      className={cn('pointer-events-none select-none', className)}
      aria-hidden="true"
      focusable="false"
    >
      {arches.map((a, i) => (
        <path
          key={i}
          d={a.d}
          stroke={a.accent ? 'var(--accent-graphic)' : 'currentColor'}
          strokeWidth={a.accent ? strokeWidth * 1.6 : strokeWidth}
          strokeLinecap="round"
          opacity={a.accent ? Math.min(a.opacity + 0.2 * intensity, 0.5) : a.opacity}
        />
      ))}
      {/* Chords: the planes the arches pass through. Opt-in — behind a real
          layout they read as stray rules cutting across content. */}
      {chords
        ? [15, 17.5, 20].map((y, i) => (
            <path
              key={`chord-${y}`}
              d={`M1.2 ${y} H22.8`}
              stroke="currentColor"
              strokeWidth={strokeWidth * 0.7}
              opacity={(0.09 - i * 0.025) * intensity}
            />
          ))
        : null}
    </svg>
  )
}

/**
 * Section divider carrying the motif — a hairline that swells into a small arch
 * at its midpoint. Used between marketing sections and above email footers.
 */
export function ApertureRule({ className }: { className?: string }) {
  return (
    <div className={cn('relative flex items-center', className)} aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      <svg viewBox="0 0 24 12" fill="none" className="mx-3 h-3 w-6 text-accent-graphic">
        <path
          d="M3 12 V7.5 a9 9 0 0 1 18 0 V12"
          stroke="currentColor"
          strokeWidth={1}
          strokeLinecap="round"
          opacity={0.75}
        />
      </svg>
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

/** Wordmark lockup: mark + name, set in the editorial display face. */
export function Wordmark({
  className,
  markClassName,
  showName = true,
  name,
}: {
  className?: string
  markClassName?: string
  showName?: boolean
  name: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <ApertureMark className={cn('h-[1.15em] w-[1.15em] text-accent', markClassName)} />
      {showName ? (
        <span className="font-display text-[1.15em] leading-none tracking-[-0.01em]">{name}</span>
      ) : null}
    </span>
  )
}
