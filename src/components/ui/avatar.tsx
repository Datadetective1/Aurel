import { cn, hashToBucket, initials } from '@/lib/utils'

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
  className,
}: {
  name: string
  src?: string | null
  size?: keyof typeof SIZES
  className?: string
}) {
  const tint = TINTS[hashToBucket(name, TINTS.length)]!

  if (src) {
    return (
      /* Avatars are arbitrary remote or data URLs supplied per user, so
         next/image would need a per-user remote allowlist to be configured.
         eslint-disable-next-line @next/next/no-img-element */
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        referrerPolicy="no-referrer"
        className={cn(
          // object-position slightly above centre: faces sit in the upper
          // half of most portraits, and a centred crop cuts foreheads.
          'border-line bg-bg-sunken shrink-0 rounded-full border object-cover object-[50%_35%]',
          SIZES[size],
          className,
        )}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'border-line inline-flex shrink-0 items-center justify-center rounded-full border font-medium tracking-[0.02em] select-none',
        SIZES[size],
        tint,
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
