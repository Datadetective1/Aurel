import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

/**
 * FACE STACK
 * =============================================================================
 * The people in a conversation, as faces, overlapping the way a group photo
 * does. Where there is no photo the initials tint does the work, and the
 * stack still reads as "these people" rather than as a row of chips.
 *
 * Names are always available to assistive technology through the wrapper's
 * label, so the stack is never a purely visual claim.
 * =============================================================================
 */

export interface FaceStackPerson {
  id: string
  name: string
  src?: string | null
}

const SIZES = {
  xs: { avatar: 'xs' as const, overlap: '-ml-1.5', ring: 'ring-2' },
  sm: { avatar: 'sm' as const, overlap: '-ml-2', ring: 'ring-2' },
  md: { avatar: 'md' as const, overlap: '-ml-2.5', ring: 'ring-[3px]' },
  lg: { avatar: 'lg' as const, overlap: '-ml-3', ring: 'ring-4' },
}

export function FaceStack({
  people,
  size = 'sm',
  max = 4,
  className,
  showNames = false,
  ringClassName = 'ring-bg',
}: {
  people: FaceStackPerson[]
  size?: keyof typeof SIZES
  max?: number
  className?: string
  /** Render the names beside the faces. */
  showNames?: boolean
  /** The ring colour, matching whatever surface the stack sits on. */
  ringClassName?: string
}) {
  if (people.length === 0) return null
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  const s = SIZES[size]
  const label = people.map((p) => p.name).join(', ')

  return (
    <span className={cn('inline-flex items-center', className)} aria-label={label} role="img">
      <span className="flex items-center">
        {shown.map((p, i) => (
          <Avatar
            key={p.id}
            name={p.name}
            src={p.src}
            size={s.avatar}
            className={cn(s.ring, ringClassName, i > 0 && s.overlap)}
          />
        ))}
        {rest > 0 ? (
          <span
            aria-hidden="true"
            className={cn(
              'border-line bg-bg-sunken text-ink-muted inline-flex items-center justify-center rounded-full border font-medium',
              s.overlap,
              s.ring,
              ringClassName,
              size === 'xs' && 'size-6 text-[0.5625rem]',
              size === 'sm' && 'size-8 text-[0.625rem]',
              size === 'md' && 'size-10 text-[0.6875rem]',
              size === 'lg' && 'size-14 text-xs',
            )}
          >
            +{rest}
          </span>
        ) : null}
      </span>
      {showNames ? (
        <span aria-hidden="true" className="text-ink-muted ml-2.5 truncate text-xs">
          {formatNames(people.map((p) => p.name))}
        </span>
      ) : null}
    </span>
  )
}

/** "Ravi", "Ravi and Jason", "Ravi, Jason and 2 others". */
export function formatNames(names: string[], max = 2): string {
  const first = names.slice(0, max).map((n) => n.split(' ')[0] ?? n)
  const rest = names.length - first.length
  if (rest <= 0) {
    if (first.length <= 1) return first[0] ?? ''
    return `${first.slice(0, -1).join(', ')} and ${first[first.length - 1]}`
  }
  return `${first.join(', ')} and ${rest} ${rest === 1 ? 'other' : 'others'}`
}
