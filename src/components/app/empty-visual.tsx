import { cn } from '@/lib/utils'

/**
 * EMPTY-STATE VISUALS
 * =============================================================================
 * Small line drawings for the moments before there is anything to show. Drawn
 * in the system's own strokes -- hairlines in --line-strong, a single brass
 * mark -- so they read as part of the product rather than as clip art laid on
 * top of it. Each is decorative and hidden from assistive technology; the
 * words next to it carry the meaning.
 *
 * Three subjects, matching the three things the product is now about: a
 * conversation between two people, a loop waiting to close, and a face with
 * no photo yet.
 * =============================================================================
 */

type Subject = 'conversation' | 'loops' | 'faces' | 'memory'

export function EmptyVisual({ subject, className }: { subject: Subject; className?: string }) {
  const common = {
    viewBox: '0 0 160 100',
    fill: 'none',
    'aria-hidden': true as const,
    className: cn('h-24 w-40 shrink-0', className),
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (subject) {
    case 'conversation':
      return (
        <svg {...common}>
          {/* two people, facing */}
          <circle cx="44" cy="40" r="11" className="stroke-line-strong" strokeWidth="1.25" />
          <path
            d="M22 78c2-14 11-22 22-22s20 8 22 22"
            className="stroke-line-strong"
            strokeWidth="1.25"
          />
          <circle cx="116" cy="40" r="11" className="stroke-line-strong" strokeWidth="1.25" />
          <path
            d="M94 78c2-14 11-22 22-22s20 8 22 22"
            className="stroke-line-strong"
            strokeWidth="1.25"
          />
          {/* the words between them */}
          <path d="M66 30h28" className="stroke-accent-graphic" strokeWidth="1.5" />
          <path d="M70 38h20" className="stroke-accent-graphic" strokeWidth="1.5" opacity="0.6" />
          <path d="M74 46h12" className="stroke-accent-graphic" strokeWidth="1.5" opacity="0.35" />
        </svg>
      )
    case 'loops':
      return (
        <svg {...common}>
          {/* an arc that nearly closes */}
          <path d="M80 22a28 28 0 1 1-19.8 8.2" className="stroke-line-strong" strokeWidth="1.25" />
          <path d="M52 34l8-4-1 9" className="stroke-accent-graphic" strokeWidth="1.5" />
          <circle cx="80" cy="50" r="3" className="fill-accent-graphic" />
          <path d="M120 40h20M120 50h14M120 60h18" className="stroke-line" strokeWidth="1.25" />
        </svg>
      )
    case 'faces':
      return (
        <svg {...common}>
          <circle cx="80" cy="42" r="18" className="stroke-line-strong" strokeWidth="1.25" />
          <path
            d="M46 90c4-20 17-30 34-30s30 10 34 30"
            className="stroke-line-strong"
            strokeWidth="1.25"
          />
          <path d="M72 42h16" className="stroke-accent-graphic" strokeWidth="1.5" />
          <path d="M116 26l6-6M122 26l-6-6" className="stroke-line" strokeWidth="1.25" />
          <circle cx="40" cy="30" r="2" className="fill-line-strong" />
        </svg>
      )
    case 'memory':
      return (
        <svg {...common}>
          <path d="M30 70V30h100v40" className="stroke-line-strong" strokeWidth="1.25" />
          <path d="M30 70h100" className="stroke-accent-graphic" strokeWidth="1.5" />
          <path d="M44 44h40M44 54h28" className="stroke-line" strokeWidth="1.25" />
          <circle cx="112" cy="48" r="7" className="stroke-line-strong" strokeWidth="1.25" />
          <path d="M109 48l2 2 4-4" className="stroke-accent-graphic" strokeWidth="1.5" />
        </svg>
      )
  }
}

/**
 * An empty state with a drawing. The same contract as the plain EmptyState
 * primitive, with a picture where the icon was, and room for a sentence that
 * says what the page will hold once it holds something.
 */
export function IllustratedEmpty({
  subject,
  title,
  description,
  action,
  className,
}: {
  subject: Subject
  title: string
  description: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'border-line flex flex-col items-center rounded-[var(--radius-lg)] border border-dashed px-6 py-12 text-center sm:flex-row sm:items-center sm:gap-8 sm:px-10 sm:text-left',
        className,
      )}
    >
      <EmptyVisual subject={subject} className="mb-5 sm:mb-0" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-ink text-xl">{title}</p>
        <p className="text-ink-muted mt-2 max-w-md text-sm leading-relaxed">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  )
}
