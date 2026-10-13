import Link from 'next/link'
import {
  CalendarCheck,
  CalendarClock,
  CircleCheck,
  CircleHelp,
  Eye,
  Globe,
  HelpCircle,
  Lightbulb,
  MessagesSquare,
  PenLine,
  Scale,
  Handshake,
  Sparkles,
  StickyNote,
} from 'lucide-react'
import {
  TIMELINE_KIND_LABEL,
  type TimelineEntry,
  type TimelineEvidence,
  type TimelineKind,
  type TimelineSource,
} from '@/lib/visual/timeline'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * RELATIONSHIP TIMELINE
 * =============================================================================
 * One line per event: an icon, what happened, when, and a small mark for how
 * sure the record is. The underlying words -- the outcome, the excerpt, the
 * whole note -- open beneath the line on request, through a native
 * <details>, so it works with a keyboard and a screen reader with no script.
 *
 * The first few entries show; the rest wait behind "Show earlier" rather than
 * turning the person page into a scroll.
 * =============================================================================
 */

const KIND_ICON: Record<TimelineKind, typeof CalendarCheck> = {
  upcoming: CalendarClock,
  meeting: CalendarCheck,
  conversation: MessagesSquare,
  commitment: Handshake,
  commitment_completed: CircleCheck,
  decision: Scale,
  note: StickyNote,
  memory: Lightbulb,
}

const EVIDENCE_ICON: Record<TimelineEvidence, typeof CircleCheck> = {
  confirmed: CircleCheck,
  observed: Eye,
  inferred: CircleHelp,
  unknown: HelpCircle,
}

const EVIDENCE_WORD: Record<TimelineEvidence, string> = {
  confirmed: 'Confirmed',
  observed: 'Observed',
  inferred: 'Inferred',
  unknown: 'Unknown',
}

const SOURCE_ICON: Record<TimelineSource, typeof PenLine> = {
  records: PenLine,
  interactions: MessagesSquare,
  public_research: Globe,
  inference: Sparkles,
}

const SOURCE_WORD: Record<TimelineSource, string> = {
  records: 'from your records',
  interactions: 'from a conversation',
  public_research: 'from public research',
  inference: `inferred`,
}

const DETAIL_LABEL: Partial<Record<TimelineKind, string>> = {
  decision: 'Show why',
  note: 'Show the full note',
  memory: 'Show in full',
}

function EntryRow({ entry, timeZone }: { entry: TimelineEntry; timeZone: string }) {
  const Icon = KIND_ICON[entry.kind]
  const EvidenceIcon = EVIDENCE_ICON[entry.evidence]
  const evidenceText = `${EVIDENCE_WORD[entry.evidence]}, ${SOURCE_WORD[entry.source]}`
  const title = entry.href ? (
    <Link
      href={entry.href}
      className="hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
    >
      {entry.title}
    </Link>
  ) : (
    entry.title
  )

  return (
    <li className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0">
      <span
        aria-hidden="true"
        className={cn(
          'relative z-10 flex size-8 items-center justify-center rounded-full border',
          entry.kind === 'upcoming'
            ? 'border-accent/40 bg-accent-wash text-accent'
            : entry.kind === 'commitment_completed'
              ? 'border-positive/30 bg-positive-wash text-positive'
              : 'border-line bg-surface text-ink-secondary',
        )}
      >
        <Icon className="size-3.5" />
      </span>

      <div className="min-w-0 pt-1">
        <p className="text-ink text-sm leading-snug">{title}</p>
        <p className="text-ink-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span className="sr-only">{TIMELINE_KIND_LABEL[entry.kind]}, </span>
          <time dateTime={entry.at}>{formatDate(entry.at, timeZone)}</time>
          {entry.context ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{entry.context}</span>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1" title={evidenceText}>
            <EvidenceIcon className="size-3" aria-hidden="true" />
            <span className="sr-only">{evidenceText}</span>
            <span aria-hidden="true">{EVIDENCE_WORD[entry.evidence]}</span>
          </span>
        </p>

        {entry.detail ? (
          <details className="group mt-1.5">
            <summary className="text-ink-muted hover:text-ink inline-flex min-h-8 cursor-pointer list-none items-center gap-1 text-xs underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">
                {DETAIL_LABEL[entry.kind] ?? 'Show what was said'}
              </span>
              <span className="hidden group-open:inline">Hide</span>
            </summary>
            <p className="border-line text-ink-secondary mt-1 border-l-2 pl-3 text-[0.8125rem] leading-relaxed whitespace-pre-wrap">
              {entry.detail}
            </p>
            <p className="text-ink-faint mt-1.5 flex items-center gap-1 pl-3 text-xs">
              {(() => {
                const SourceIcon = SOURCE_ICON[entry.source]
                return <SourceIcon className="size-3" aria-hidden="true" />
              })()}
              {evidenceText}
            </p>
          </details>
        ) : null}
      </div>
    </li>
  )
}

export function RelationshipTimeline({
  entries,
  timeZone,
  initial = 6,
  className,
  emptyText = 'Nothing is on record between you yet.',
}: {
  entries: TimelineEntry[]
  timeZone: string
  initial?: number
  className?: string
  emptyText?: string
}) {
  if (entries.length === 0) {
    return <p className={cn('text-ink-muted text-sm', className)}>{emptyText}</p>
  }

  const shown = entries.slice(0, initial)
  const rest = entries.slice(initial)

  return (
    <div className={cn('relative', className)}>
      {/* The spine. Sits behind the icons, centred on the 2rem column. */}
      <span aria-hidden="true" className="bg-line absolute top-4 bottom-4 left-4 w-px" />
      <ol className="relative">
        {shown.map((entry) => (
          <EntryRow key={entry.id} entry={entry} timeZone={timeZone} />
        ))}
      </ol>
      {rest.length > 0 ? (
        <details className="group relative mt-5">
          <summary className="text-ink-secondary hover:text-ink border-line bg-surface relative z-10 ml-0 inline-flex min-h-10 cursor-pointer list-none items-center rounded-full border px-4 text-xs font-medium [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show {rest.length} earlier</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <ol className="relative mt-5">
            {rest.map((entry) => (
              <EntryRow key={entry.id} entry={entry} timeZone={timeZone} />
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  )
}
