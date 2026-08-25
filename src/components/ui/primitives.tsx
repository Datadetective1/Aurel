import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Core surface and text primitives.
 *
 * This system leans on hairlines and generous space rather than shadows and
 * rounded cards. Where most dashboards would reach for a Card, prefer a Section
 * with a rule: it reads as editorial rather than as a template.
 */

/** A bordered surface. Use sparingly — not everything needs a box. */
export function Panel({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-[var(--radius-lg)] border border-line bg-surface', className)}
      {...props}
    >
      {children}
    </div>
  )
}

/** Section eyebrow: small-caps label above a block of content. */
export function Eyebrow({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('label', className)} {...props}>
      {children}
    </span>
  )
}

/** Editorial section heading with an optional trailing action. */
export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  className,
  as: Heading = 'h2',
}: {
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
  as?: 'h1' | 'h2' | 'h3'
}) {
  return (
    <div className={cn('flex items-end justify-between gap-6', className)}>
      <div className="min-w-0">
        {eyebrow ? <Eyebrow className="mb-2.5 block">{eyebrow}</Eyebrow> : null}
        <Heading
          className={cn(
            'font-display text-ink',
            Heading === 'h1' ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl',
          )}
        >
          {title}
        </Heading>
        {description ? (
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-secondary">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-medium tracking-[0.02em] whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-line bg-bg-sunken text-ink-secondary',
        accent: 'border-accent/30 bg-accent-wash text-accent',
        positive: 'border-positive/25 bg-positive-wash text-positive',
        caution: 'border-caution/25 bg-caution-wash text-caution',
        critical: 'border-critical/25 bg-critical-wash text-critical',
        info: 'border-info/25 bg-info-wash text-info',
        outline: 'border-line-strong bg-transparent text-ink-muted',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

/** Hairline separator. The default divider in this system. */
export function Rule({ className }: { className?: string }) {
  return <hr className={cn('rule my-8 border-0', className)} />
}

/**
 * Empty state. Every one of these must teach the user what to do next — a blank
 * relationship product is unavoidable on day one, so the empty states are part
 * of onboarding, not an afterthought.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-line px-6 py-14 text-center',
        className,
      )}
    >
      {icon ? <div className="mb-4 text-ink-faint">{icon}</div> : null}
      <p className="font-display text-lg text-ink">{title}</p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}

/** Definition row used across person profiles and briefs. */
export function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4', className)}>
      <dt className="label pt-0.5">{label}</dt>
      <dd className="text-sm leading-relaxed text-ink">{children}</dd>
    </div>
  )
}

/** Skeleton block for loading states. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-[var(--radius-sm)] bg-line/60', className)}
      aria-hidden="true"
    />
  )
}

/** Page container with the app's standard editorial measure. */
export function Container({
  className,
  children,
  size = 'default',
}: {
  className?: string
  children: React.ReactNode
  size?: 'default' | 'narrow' | 'wide'
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-5 sm:px-8',
        size === 'narrow' && 'max-w-3xl',
        size === 'default' && 'max-w-5xl',
        size === 'wide' && 'max-w-7xl',
        className,
      )}
    >
      {children}
    </div>
  )
}
