import { monogram } from '@/lib/visual/logo'
import { cn } from '@/lib/utils'

/**
 * PRODUCT FRAME
 * =============================================================================
 * The surface every homepage composition sits on: the app's own card --
 * hairline border, surface fill, one restrained elevation -- so a visitor sees
 * the product's material, not a screenshot of it.
 *
 * The composition inside is decorative to assistive technology. It is built
 * from real interface pieces, and reading every chip and initial aloud would
 * be noise; the figure is described once, in plain words, by `description`.
 * Nothing inside is focusable: these are pictures of the product, and a
 * keyboard user should not tab through buttons that do nothing.
 * =============================================================================
 */
export function ProductFrame({
  description,
  children,
  note,
  className,
  bodyClassName,
}: {
  description: string
  children: React.ReactNode
  /** A short visible line under the frame, e.g. that the example is invented. */
  note?: string
  className?: string
  bodyClassName?: string
}) {
  return (
    <figure className={cn('min-w-0', className)}>
      <div
        aria-hidden="true"
        className={cn(
          'border-line bg-surface elevate overflow-hidden rounded-[var(--radius-xl)] border select-none',
          bodyClassName,
        )}
      >
        {children}
      </div>
      <figcaption>
        <span className="sr-only">{description}</span>
        {note ? (
          <span className="text-ink-faint mt-2 block text-right text-[0.6875rem]">{note}</span>
        ) : null}
      </figcaption>
    </figure>
  )
}

/**
 * An organisation's monogram, as the app draws it when no logo is on record.
 * The homepage's organisations are invented, so there is never a logo to
 * fetch: this renders on the server and asks nothing of the network.
 */
export function OrgMark({
  name,
  size = 'sm',
  className,
}: {
  name: string
  size?: 'xs' | 'sm' | 'md'
  className?: string
}) {
  return (
    <span
      className={cn(
        'border-line bg-bg-sunken text-ink-secondary inline-flex shrink-0 items-center justify-center border font-medium tracking-[0.02em]',
        size === 'xs' && 'size-4 rounded-[3px] text-[0.5625rem]',
        size === 'sm' && 'size-5 rounded-[4px] text-[0.625rem]',
        size === 'md' && 'size-7 rounded-[6px] text-xs',
        className,
      )}
    >
      {monogram(name)}
    </span>
  )
}
