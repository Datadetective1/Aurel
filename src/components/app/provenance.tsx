import { BookOpen, Globe, MessagesSquare, PenLine, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { brand } from '@/lib/brand'
import type { Database } from '@/lib/supabase/types'

type SourceKind = Database['public']['Enums']['observation_source_kind']

/**
 * PROVENANCE LABEL
 * =============================================================================
 * Where a claim came from, distinct from how strongly it is believed.
 *
 * These two axes are genuinely different and the product needs both:
 *
 *   EVIDENCE LEVEL  how sure   confirmed / observed / inferred / unknown
 *   PROVENANCE      where from your records / public research / interactions
 *
 * "Observed" tells you it happened more than once. "From public research" tells
 * you it came off a web page rather than out of a meeting you were in. A user
 * weighs those differently, so collapsing them into one label loses the thing
 * that makes the record trustworthy.
 * =============================================================================
 */

export type Provenance =
  | 'records'
  | 'public_research'
  | 'interactions'
  | 'inference'
  | 'assessment'

export const PROVENANCE_META: Record<
  Provenance,
  { label: string; icon: typeof PenLine; tone: string; description: string }
> = {
  records: {
    label: 'From your records',
    icon: PenLine,
    tone: 'text-ink-muted',
    description: 'You wrote this down yourself.',
  },
  interactions: {
    label: 'From previous interactions',
    icon: MessagesSquare,
    tone: 'text-info',
    description: 'Drawn from conversations you logged.',
  },
  public_research: {
    label: 'From public research',
    icon: Globe,
    tone: 'text-accent',
    description: 'Extracted from a public source, with a link back to it.',
  },
  inference: {
    label: `${brand.name} inference`,
    icon: Sparkles,
    tone: 'text-caution',
    description: 'A reading of the evidence, not something stated anywhere.',
  },
  assessment: {
    label: `From your ${brand.assessmentName}`,
    icon: BookOpen,
    tone: 'text-ink-muted',
    description: 'Derived from your own answers.',
  },
}

/**
 * Map a stored observation onto a provenance.
 * `inferred` wins over the source, because how a claim was reached matters more
 * to the reader than where the raw material came from.
 */
export function provenanceFor(
  sourceKind: SourceKind,
  evidenceLevel: Database['public']['Enums']['evidence_level'],
): Provenance {
  if (evidenceLevel === 'inferred') return 'inference'
  switch (sourceKind) {
    case 'user':
      return 'records'
    case 'debrief':
    case 'interaction':
      return 'interactions'
    case 'import':
      return 'public_research'
    case 'ai_inference':
      return 'inference'
    default:
      return 'records'
  }
}

export function ProvenanceLabel({
  provenance,
  className,
  showLabel = true,
}: {
  provenance: Provenance
  className?: string
  showLabel?: boolean
}) {
  const meta = PROVENANCE_META[provenance]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[0.6875rem] tracking-[0.02em] text-ink-muted',
        className,
      )}
      title={meta.description}
    >
      <meta.icon className={cn('size-3 shrink-0', meta.tone)} aria-hidden="true" />
      {showLabel ? meta.label : <span className="sr-only">{meta.label}</span>}
    </span>
  )
}
