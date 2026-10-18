import Link from 'next/link'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { brand } from '@/lib/brand'
import { calendarOutcome } from '@/lib/calendar/return-path'
import { cn } from '@/lib/utils'

/**
 * Back from the consent screen, on Today rather than in Settings.
 *
 * Says what happened in one line and offers the next useful thing: the
 * meetings it found, or -- when there are none, or the connection did not
 * happen -- creating one by hand, which always works.
 */
export function CalendarReturnNotice({
  reason,
  upcomingCount,
  className,
}: {
  reason: string | undefined
  upcomingCount: number
  className?: string
}) {
  const outcome = calendarOutcome(reason, brand.name)
  if (!outcome) return null

  const connected = outcome.tone === 'positive'
  const body = connected
    ? upcomingCount > 0
      ? `Read-only. ${upcomingCount} ${upcomingCount === 1 ? 'meeting' : 'meetings'} in the next two weeks, below.`
      : 'Read-only. Nothing is scheduled in the next two weeks.'
    : outcome.body
  const Icon = connected ? CircleCheck : CircleAlert

  return (
    <div
      role="status"
      className={cn(
        'rounded-[var(--radius-md)] border px-4 py-3.5',
        connected ? 'border-positive/25 bg-positive-wash' : 'border-caution/25 bg-caution-wash',
        className,
      )}
    >
      <p className="text-ink flex items-center gap-2 text-sm font-medium">
        <Icon
          className={cn('size-4 shrink-0', connected ? 'text-positive' : 'text-caution')}
          aria-hidden="true"
        />
        {outcome.title}
      </p>
      <p className="text-ink-secondary mt-1 text-xs leading-relaxed">{body}</p>

      {!connected || upcomingCount === 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="secondary" className="h-11">
            <Link href="/meetings/new">Create a meeting manually</Link>
          </Button>
          {!connected ? (
            <Button asChild size="sm" variant="ghost" className="h-11">
              <Link href="/settings/capabilities">Calendar settings</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
