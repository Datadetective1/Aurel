import { cn, hashToBucket, initials } from '@/lib/utils'
import { AvatarPhoto } from './avatar-photo'

/**
 * Avatar with a generated fallback.
 *
 * No photos are required anywhere in Atturel — most people you add will never
 * have one. The fallback has to look deliberate rather than like a missing
 * image, so it uses initials on a tint deterministically derived from the name.
 * The same person always gets the same tint, which makes lists scannable.
 */

const TINTS = [
  'bg-[color-mix(in_oklab,var(--accent-graphic)_14%,var(--bg-sunken))] text-accent-strong',
  'bg-[color-mix(in_oklab,var(--info)_14%,var(--bg-sunken))] text-info-strong',
  'bg-[color-mix(in_oklab,var(--positive)_14%,var(--bg-sunken))] text-positive-strong',
  'bg-[color-mix(in_oklab,var(--caution)_14%,var(--bg-sunken))] text-caution-strong',
  'bg-bg-sunken text-ink-secondary',
]

/**
 * xs and sm are for dense rows and stacks. md upward is where a face starts
 * to carry the composition: 40 in a list, 56 on a card, 80 on a hero, 96 and
 * 128 where one person is the subject of the page. Type scales with it so
 * initials never look like a label on a plate.
 */
const SIZES = {
  xs: 'size-6 text-[0.625rem]',
  sm: 'size-8 text-[0.6875rem]',
  md: 'size-10 text-xs',
  lg: 'size-14 text-sm',
  xl: 'size-20 text-lg',
  '2xl': 'size-24 text-xl',
  '3xl': 'size-32 text-2xl',
} as const

export type AvatarSize = keyof typeof SIZES

export function Avatar({
  name,
  src,
  size = 'md',
  alt = '',
  priority = false,
  className,
}: {
  name: string
  src?: string | null
  size?: keyof typeof SIZES
  /** Only when the name is not already written beside the face. */
  alt?: string
  /** Load eagerly: for a face that is part of the first screen. */
  priority?: boolean
  className?: string
}) {
  const tint = TINTS[hashToBucket(name, TINTS.length)]!

  // The initials are always rendered. A photo is laid over them, so a slow,
  // broken or expired image falls back to them instead of to an empty circle.
  return (
    <span
      aria-hidden={src && alt ? undefined : true}
      className={cn(
        'border-line relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border font-medium tracking-[0.02em] select-none',
        SIZES[size],
        tint,
        className,
      )}
    >
      <span aria-hidden="true">{initials(name)}</span>
      {src ? <AvatarPhoto src={src} alt={alt} priority={priority} /> : null}
    </span>
  )
}
