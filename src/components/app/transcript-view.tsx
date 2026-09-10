import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The words themselves, folded away. A summary is what the page is for; the
 * transcript is the evidence behind it, one click down, rendered as the
 * dialogue it is rather than as a wall.
 */
export function TranscriptView({
  text,
  label = 'Transcript',
  className,
}: {
  text: string
  label?: string
  className?: string
}) {
  const lines = text.split(/\n+/).filter((l) => l.trim().length > 0)

  return (
    <details
      className={cn('group border-line bg-surface rounded-[var(--radius-lg)] border', className)}
    >
      <summary className="text-ink-secondary hover:text-ink flex cursor-pointer items-center gap-2.5 px-5 py-4 text-sm">
        <FileText className="text-ink-faint size-4" aria-hidden="true" />
        {label}
        <span className="text-ink-faint ml-auto text-xs">
          {text.split(/\s+/).filter(Boolean).length.toLocaleString()} words
        </span>
      </summary>
      <div className="border-line max-h-[32rem] overflow-y-auto border-t px-5 py-4">
        <div className="grid gap-2.5">
          {lines.map((line, i) => {
            const match = line.match(/^([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2}):\s+(.+)$/)
            if (match?.[1] && match[2]) {
              return (
                <p key={i} className="text-ink text-sm leading-relaxed">
                  <span className="text-ink-secondary mr-2 font-medium">{match[1]}</span>
                  {match[2]}
                </p>
              )
            }
            return (
              <p key={i} className="text-ink text-sm leading-relaxed whitespace-pre-wrap">
                {line}
              </p>
            )
          })}
        </div>
      </div>
    </details>
  )
}
