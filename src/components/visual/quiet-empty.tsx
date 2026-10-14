import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * QUIET EMPTY
 * =============================================================================
 * An empty state that takes one line of the reader's attention, not five: an
 * icon, a short state, at most one sentence, at most one action. "Nothing
 * open with Jonathan" is information; a paragraph explaining what would
 * appear here is not.
 * =============================================================================
 */
export function QuietEmpty({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>
  title: string
  body?: string
  action?: {
    label: string
    href: string
    icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>
  }
  className?: string
}) {
  const ActionIcon = action?.icon
  return (
    <div
      className={cn(
        'border-line flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-lg)] border border-dashed px-4 py-3',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="bg-bg-sunken text-ink-muted flex size-8 shrink-0 items-center justify-center rounded-full"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ink text-sm font-medium">{title}</p>
        {body ? <p className="text-ink-muted text-xs leading-relaxed">{body}</p> : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className="text-ink border-line-strong bg-surface hover:bg-bg-sunken inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {ActionIcon ? <ActionIcon className="size-3.5" aria-hidden="true" /> : null}
          {action.label}
        </Link>
      ) : null}
    </div>
  )
}
