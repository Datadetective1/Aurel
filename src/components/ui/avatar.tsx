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
  'bg-[color-mix(in_oklab,var(--accent-graphic)_14%,var(--bg-sunken))] text-accent',
  'bg-[color-mix(in_oklab,var(--info)_14%,var(--bg-sunken))] text-info',
  'bg-[color-mix(in_oklab,var(--positive)_14%,var(--bg-sunken))] text-positive',
  'bg-[color-mix(in_oklab,var(--caution)_14%,var(--bg-sunken))] text-caution',
  'bg-bg-sunken text-ink-secondary',
]

const SIZES = {
  xs: 'size-6 text-[0.625rem]',
  sm: 'size-8 text-[0.6875rem]',
  md: 'size-10 text-xs',
  lg: 'size-14 text-sm',
  xl: 'size-20 text-lg',
} as const

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
        className={cn(
          'shrink-0 rounded-full border border-line object-cover',
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
        'inline-flex shrink-0 items-center justify-center rounded-full border border-line font-medium tracking-[0.02em] select-none',
        SIZES[size],
        tint,
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
