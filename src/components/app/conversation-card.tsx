import Link from 'next/link'
import { AlertCircle, FileText, Handshake, Loader2, Mic, Scale, Upload } from 'lucide-react'
import { FaceStack, formatNames } from './face-stack'
import { Badge } from '@/components/ui/primitives'
import type { ConversationSummary } from '@/lib/conversations/queries'
import { formatDate, relativeDay, truncate } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * CONVERSATION CARD
 * =============================================================================
 * One conversation as an object: who, when, what it was about, what it left
 * behind. The faces lead. A card with three people's faces on it says "that
 * Thursday call with Ravi and Jason" before the title is read.
 * =============================================================================
 */

const SOURCE_ICON: Record<ConversationSummary['sourceKind'], typeof Mic> = {
  typed_notes: FileText,
  voice_note: Mic,
  uploaded_audio: Mic,
  meeting_recording: Mic,
  pasted_transcript: FileText,
  uploaded_transcript: Upload,
  imported: Upload,
}

export const SOURCE_LABEL: Record<ConversationSummary['sourceKind'], string> = {
  typed_notes: 'Notes',
  voice_note: 'Voice note',
  uploaded_audio: 'Recording',
  meeting_recording: 'Meeting recording',
  pasted_transcript: 'Transcript',
  uploaded_transcript: 'Transcript file',
  imported: 'Imported',
}

export function ConversationCard({
  conversation,
  timeZone,
  now,
  className,
  compact = false,
}: {
  conversation: ConversationSummary
  timeZone: string
  now: Date
  className?: string
  /** Fewer details: for a person page or Today. */
  compact?: boolean
}) {
  const c = conversation
  const Icon = SOURCE_ICON[c.sourceKind]
  const needsReview = c.processingStatus === 'ready' && c.pendingReview > 0 && !c.reviewedAt

  return (
    <li className={cn('list-none', className)}>
      <Link
        href={`/conversations/${c.id}`}
        className={cn(
          'group bg-surface hover:border-line-strong block rounded-[var(--radius-lg)] border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
          needsReview ? 'border-accent/30' : 'border-line',
          compact ? 'p-4' : 'p-5',
        )}
      >
        <div className="flex items-start gap-4">
          {c.participants.length > 0 ? (
            <FaceStack
              people={c.participants}
              size={compact ? 'sm' : 'md'}
              max={3}
              ringClassName="ring-surface"
              className="mt-0.5 shrink-0"
            />
          ) : (
            <span
              aria-hidden="true"
              className={cn(
                'border-line-strong text-ink-faint mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full border border-dashed',
                compact ? 'size-8' : 'size-10',
              )}
            >
              <Icon className="size-4" />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-ink-muted text-xs">
                {relativeDay(c.occurredAt, timeZone, now)}
                {!compact ? ` · ${formatDate(c.occurredAt, timeZone)}` : ''}
              </span>
              {c.processingStatus === 'processing' || c.processingStatus === 'pending' ? (
                <Badge tone="info">
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  Reading
                </Badge>
              ) : c.processingStatus === 'failed' ? (
                <Badge tone="caution">
                  <AlertCircle className="size-3" aria-hidden="true" />
                  Not read
                </Badge>
              ) : needsReview ? (
                <Badge tone="accent">{c.pendingReview} to review</Badge>
              ) : null}
            </div>

            <p
              className={cn(
                'font-display text-ink group-hover:text-accent mt-1',
                compact ? 'text-base' : 'text-lg',
              )}
            >
              {c.title}
            </p>

            {c.participants.length > 0 ? (
              <p className="text-ink-muted mt-0.5 text-xs">
                With{' '}
                {formatNames(
                  c.participants.map((p) => p.name),
                  3,
                )}
              </p>
            ) : null}

            {c.summary && !compact ? (
              <p className="text-ink-secondary mt-2 line-clamp-2 text-sm leading-relaxed">
                {truncate(c.summary, 220)}
              </p>
            ) : null}

            <div className="text-ink-muted mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <Icon className="text-ink-faint size-3.5" aria-hidden="true" />
                {SOURCE_LABEL[c.sourceKind]}
              </span>
              {c.openLoops > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Handshake className="text-caution size-3.5" aria-hidden="true" />
                  {c.openLoops} open
                </span>
              ) : null}
              {c.decisions > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Scale className="text-positive size-3.5" aria-hidden="true" />
                  {c.decisions} decided
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </Link>
    </li>
  )
}
