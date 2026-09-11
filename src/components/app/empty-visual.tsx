import { Illustration, type IllustrationSubject } from '@/components/brand/illustrations'
import { cn } from '@/lib/utils'

/**
 * EMPTY STATES WITH A DRAWING
 * =============================================================================
 * The drawings live in components/brand/illustrations. This is the layout
 * that puts one beside a sentence that says what the page will hold once it
 * holds something -- so an empty account is an invitation, not a blank.
 * =============================================================================
 */

export function EmptyVisual({
  subject,
  className,
}: {
  subject: IllustrationSubject
  className?: string
}) {
  return <Illustration subject={subject} className={className} />
}

export function IllustratedEmpty({
  subject,
  title,
  description,
  action,
  className,
  /** 'card' is the default bordered treatment; 'wash' is the warm tinted one for the main surfaces. */
  tone = 'card',
}: {
  subject: IllustrationSubject
  title: string
  description: React.ReactNode
  action?: React.ReactNode
  className?: string
  tone?: 'card' | 'wash'
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-[var(--radius-lg)] px-6 py-12 text-center sm:flex-row sm:items-center sm:gap-10 sm:px-10 sm:text-left',
        tone === 'wash' ? 'bg-bg-sunken' : 'border-line border border-dashed',
        className,
      )}
    >
      <Illustration subject={subject} className="mb-6 w-52 sm:mb-0 sm:w-60" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-ink text-2xl">{title}</p>
        <p className="text-ink-muted mt-2 max-w-md text-sm leading-relaxed">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  )
}
