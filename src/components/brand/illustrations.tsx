import { cn } from '@/lib/utils'

/**
 * ATTUREL ILLUSTRATIONS
 * =============================================================================
 * A small family of line drawings for the moments before there is anything
 * to show, and for the quiet days. Drawn in the system's own strokes: the
 * hairline in --line-strong, one brass mark, a soft wash. They read as part
 * of the product rather than as art laid on top of it, and they follow the
 * theme because they are drawn in tokens.
 *
 * Subjects are people and the space between them -- never a mood on a face.
 * Every drawing is decorative and hidden from assistive technology; the
 * words beside it carry the meaning.
 *
 * Reusable: import `Illustration` and name the subject. Sizes are set by the
 * caller through className; the viewBox is 240 x 150 throughout.
 * =============================================================================
 */

export type IllustrationSubject =
  | 'people'
  | 'conversation'
  | 'loops'
  | 'meetings'
  | 'history'
  | 'quiet'
  | 'faces'
  | 'memory'
  | 'atlas'

const stroke = 'stroke-line-strong'
const brass = 'stroke-accent-graphic'
const wash = 'fill-accent-wash'

/** A head and shoulders, the recurring figure. */
function Figure({
  x,
  y,
  scale = 1,
  tone = stroke,
}: {
  x: number
  y: number
  scale?: number
  tone?: string
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <circle cx="0" cy="0" r="12" className={tone} strokeWidth="1.25" fill="none" />
      <path
        d="M-22 40c2-15 12-24 22-24s20 9 22 24"
        className={tone}
        strokeWidth="1.25"
        fill="none"
      />
    </g>
  )
}

export function Illustration({
  subject,
  className,
}: {
  subject: IllustrationSubject
  className?: string
}) {
  const common = {
    viewBox: '0 0 240 150',
    fill: 'none',
    'aria-hidden': true as const,
    className: cn('h-auto w-full max-w-[15rem] shrink-0', className),
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (subject) {
    case 'people':
      // Three figures, one stepping forward: a record that starts with one person.
      return (
        <svg {...common}>
          <ellipse cx="120" cy="118" rx="96" ry="16" className={wash} />
          <Figure x={64} y={62} scale={0.9} />
          <Figure x={176} y={62} scale={0.9} />
          <Figure x={120} y={54} scale={1.15} tone={brass} />
          <path d="M108 118h24" className={brass} strokeWidth="1.5" />
        </svg>
      )
    case 'conversation':
      // Two people facing, and the words between them.
      return (
        <svg {...common}>
          <ellipse cx="120" cy="120" rx="90" ry="14" className={wash} />
          <Figure x={66} y={60} />
          <Figure x={174} y={60} />
          <path d="M98 44h44" className={brass} strokeWidth="1.5" />
          <path d="M104 54h32" className={brass} strokeWidth="1.5" opacity="0.6" />
          <path d="M110 64h20" className={brass} strokeWidth="1.5" opacity="0.35" />
        </svg>
      )
    case 'loops':
      // An arc that nearly closes, and the hand that closes it.
      return (
        <svg {...common}>
          <ellipse cx="120" cy="122" rx="80" ry="12" className={wash} />
          <path d="M120 30a44 44 0 1 1-31 12.9" className={stroke} strokeWidth="1.25" />
          <path d="M78 52l10-6-1 12" className={brass} strokeWidth="1.5" />
          <circle cx="120" cy="74" r="4" className="fill-accent-graphic" />
          <Figure x={188} y={70} scale={0.8} />
        </svg>
      )
    case 'meetings':
      // A table, two on one side, one on the other, a clock above.
      return (
        <svg {...common}>
          <path d="M40 104h160" className={stroke} strokeWidth="1.25" />
          <path d="M56 104v20M184 104v20" className={stroke} strokeWidth="1.25" />
          <Figure x={84} y={66} scale={0.8} />
          <Figure x={120} y={62} scale={0.85} tone={brass} />
          <Figure x={160} y={66} scale={0.8} />
          <circle cx="200" cy="34" r="12" className={stroke} strokeWidth="1.25" />
          <path d="M200 26v8l5 3" className={brass} strokeWidth="1.5" />
        </svg>
      )
    case 'history':
      // A path of small stones leading to a figure: what compounds.
      return (
        <svg {...common}>
          <ellipse cx="120" cy="124" rx="90" ry="12" className={wash} />
          <circle cx="40" cy="110" r="3" className="fill-line-strong" />
          <circle cx="66" cy="100" r="3" className="fill-line-strong" />
          <circle cx="92" cy="92" r="3" className="fill-line-strong" />
          <circle cx="118" cy="86" r="3" className="fill-accent-graphic" />
          <path
            d="M40 110C66 100 92 92 118 86"
            className={stroke}
            strokeWidth="1"
            strokeDasharray="2 5"
          />
          <Figure x={170} y={58} scale={1.05} tone={brass} />
        </svg>
      )
    case 'quiet':
      // A window, morning light, a chair. Nothing owed.
      return (
        <svg {...common}>
          <rect
            x="70"
            y="22"
            width="100"
            height="70"
            rx="3"
            className={stroke}
            strokeWidth="1.25"
          />
          <path d="M120 22v70M70 57h100" className={stroke} strokeWidth="1" />
          <path
            d="M84 36l24 24M100 30l40 40M140 34l20 20"
            className={brass}
            strokeWidth="1"
            opacity="0.5"
          />
          <ellipse cx="120" cy="126" rx="92" ry="12" className={wash} />
          <path d="M150 124v-26h28v26M150 110h28" className={stroke} strokeWidth="1.25" />
          <path d="M60 124v-18h22v18" className={stroke} strokeWidth="1.25" />
        </svg>
      )
    case 'faces':
      // One figure, and the frame a photo would fill.
      return (
        <svg {...common}>
          <rect
            x="82"
            y="26"
            width="76"
            height="98"
            rx="38"
            className={stroke}
            strokeWidth="1.25"
            strokeDasharray="3 5"
          />
          <Figure x={120} y={70} scale={1.2} />
          <path d="M164 30l6-6M170 30l-6-6" className={brass} strokeWidth="1.25" />
        </svg>
      )
    case 'memory':
      // A shelf holding what was confirmed.
      return (
        <svg {...common}>
          <path d="M44 106V40h152v66" className={stroke} strokeWidth="1.25" />
          <path d="M44 106h152" className={brass} strokeWidth="1.5" />
          <path d="M62 60h56M62 76h40" className={stroke} strokeWidth="1.25" />
          <circle cx="170" cy="66" r="10" className={stroke} strokeWidth="1.25" />
          <path d="M165 66l3 3 6-6" className={brass} strokeWidth="1.5" />
        </svg>
      )
    case 'atlas':
      // Figures grouped in two clusters, a line between the clusters.
      return (
        <svg {...common}>
          <ellipse cx="72" cy="120" rx="52" ry="10" className={wash} />
          <ellipse cx="172" cy="120" rx="52" ry="10" className={wash} />
          <Figure x={56} y={60} scale={0.8} />
          <Figure x={88} y={66} scale={0.8} />
          <Figure x={156} y={62} scale={0.8} />
          <Figure x={190} y={66} scale={0.8} tone={brass} />
          <path
            d="M104 98c20-16 36-16 56 0"
            className={brass}
            strokeWidth="1.25"
            strokeDasharray="2 5"
          />
        </svg>
      )
  }
}
