'use client'

import * as React from 'react'
import { logoPath, monogram } from '@/lib/visual/logo'
import { cn } from '@/lib/utils'

/**
 * COMPANY MARK
 * =============================================================================
 * The organisation's logo where its own domain is on record, a monogram where
 * it is not, and the name always beside it as text. See `lib/visual/logo` for
 * why the image comes from the company's domain through Atturel's server and
 * never from a third-party logo service.
 *
 * The image is decorative next to the name, so it carries no alt text of its
 * own; when the name is hidden the mark takes the name as its label.
 * A logo that fails to load becomes the monogram, not a broken image.
 * =============================================================================
 */

const SIZES = {
  xs: 'size-4 rounded-[3px] text-[0.5625rem]',
  sm: 'size-5 rounded-[4px] text-[0.625rem]',
  md: 'size-7 rounded-[6px] text-xs',
  lg: 'size-10 rounded-[8px] text-sm',
} as const

export function CompanyMark({
  name,
  domain,
  size = 'sm',
  className,
  labelled = false,
}: {
  name: string
  domain?: string | null
  size?: keyof typeof SIZES
  className?: string
  /** True when no visible name accompanies the mark. */
  labelled?: boolean
}) {
  const src = logoPath(domain)
  const [failed, setFailed] = React.useState(false)
  const a11y = labelled ? { role: 'img' as const, 'aria-label': name } : { 'aria-hidden': true as const }

  if (src && !failed) {
    return (
      <span
        {...a11y}
        className={cn(
          'border-line inline-flex shrink-0 items-center justify-center overflow-hidden border bg-white',
          SIZES[size],
          className,
        )}
      >
        {/* Same-origin, tiny, and decorative: next/image would add an
            optimiser round trip for a 32px mark. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="size-full object-contain p-[12%]"
        />
      </span>
    )
  }

  return (
    <span
      {...a11y}
      className={cn(
        'border-line bg-bg-sunken text-ink-secondary inline-flex shrink-0 items-center justify-center border font-medium tracking-[0.02em] select-none',
        SIZES[size],
        className,
      )}
    >
      {monogram(name)}
    </span>
  )
}

/** Mark plus name: the form a company takes in a subtitle. */
export function CompanyLabel({
  name,
  domain,
  className,
  size = 'xs',
}: {
  name: string
  domain?: string | null
  className?: string
  size?: 'xs' | 'sm'
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <CompanyMark name={name} domain={domain} size={size} />
      <span className="truncate">{name}</span>
    </span>
  )
}
