import { CircleCheck, CircleHelp, Eye, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/supabase/types'

type EvidenceLevel = Database['public']['Enums']['evidence_level']

/**
 * EVIDENCE BADGE
 * =============================================================================
 * The most important small component in the product. Every claim Atturel makes
 * about a person carries one of these, so a user can always tell the difference
 * between something that was said, something that was seen, and something the
 * system guessed.
 *
 * Each level has its own icon AND its own words, never colour alone.
 * =============================================================================
 */

export const EVIDENCE_META: Record<
  EvidenceLevel,
  { label: string; icon: typeof CircleCheck; tone: string; description: string }
> = {
  confirmed: {
    label: 'Confirmed',
    icon: CircleCheck,
    tone: 'text-positive',
    description: 'They said it, or you confirmed it.',
  },
  observed: {
    label: 'Observed',
    icon: Eye,
    tone: 'text-info',
    description: 'Supported by interactions or sources on record.',
  },
  inferred: {
    label: 'Inferred',
    icon: CircleHelp,
    tone: 'text-caution',
    description: 'A reading of limited evidence. Worth checking.',
  },
  unknown: {
    label: 'Unknown',
    icon: HelpCircle,
    tone: 'text-ink-muted',
    description: 'Not enough information to say.',
  },
}

export function EvidenceBadge({
  level,
  className,
  showLabel = true,
}: {
  level: EvidenceLevel
  className?: string
  showLabel?: boolean
}) {
  const meta = EVIDENCE_META[level]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[0.6875rem] font-medium tracking-[0.06em] uppercase',
        'text-ink-muted',
        className,
      )}
      title={meta.description}
    >
      <meta.icon className={cn('size-3 shrink-0', meta.tone)} aria-hidden="true" />
      {showLabel ? meta.label : <span className="sr-only">{meta.label}</span>}
    </span>
  )
}

/**
 * A claim with its evidence level, and optionally how many sources back it.
 * Used for observations and professional facts alike.
 */
export function EvidenceLine({
  content,
  level,
  sourceCount,
  reinforcementCount,
  action,
  className,
}: {
  content: string
  level: EvidenceLevel
  sourceCount?: number
  reinforcementCount?: number
  action?: React.ReactNode
  className?: string
}) {
  const support: string[] = []
  if (sourceCount && sourceCount > 0) {
    support.push(`${sourceCount} source${sourceCount === 1 ? '' : 's'}`)
  }
  if (reinforcementCount && reinforcementCount > 1) {
    support.push(`seen ${reinforcementCount} times`)
  }

  return (
    <li className={cn('group flex gap-3', className)}>
      <span aria-hidden="true" className="mt-2.5 h-px w-3 shrink-0 bg-line-strong" />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed text-ink">{content}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <EvidenceBadge level={level} />
          {support.length > 0 ? (
            <span className="text-[0.6875rem] text-ink-faint">{support.join(' · ')}</span>
          ) : null}
        </div>
      </div>
      {action ? (
        <div className="shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {action}
        </div>
      ) : null}
    </li>
  )
}
