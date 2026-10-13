import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * CHIP
 * =============================================================================
 * The smallest unit of the visual brief: an icon and two or three words, in
 * place of a sentence. "Brief ready", "1 open", "Last spoke Tuesday".
 *
 * Status is always carried by the icon and the words as well as the tint, so
 * nothing here depends on telling brass from green. 12px, not 11: these are
 * read in a corridor, and the eyebrow `label` style stays the only thing that
 * small.
 * =============================================================================
 */

const TONES = {
  neutral: 'border-line bg-bg-sunken text-ink-secondary',
  quiet: 'border-transparent bg-transparent text-ink-muted px-0',
  accent: 'border-accent/30 bg-accent-wash text-accent-strong',
  positive: 'border-positive/25 bg-positive-wash text-positive-strong',
  caution: 'border-caution/25 bg-caution-wash text-caution-strong',
  critical: 'border-critical/25 bg-critical-wash text-critical-strong',
  info: 'border-info/25 bg-info-wash text-info-strong',
} as const

export type ChipTone = keyof typeof TONES

export function Chip({
  icon: Icon,
  children,
  tone = 'neutral',
  className,
  title,
}: {
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>
  children: React.ReactNode
  tone?: ChipTone
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs leading-tight font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
      {children}
    </span>
  )
}

/** A row of chips that wraps, never scrolls: a chip row is a summary, not a rail. */
export function ChipRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-1.5', className)}>{children}</div>
}
