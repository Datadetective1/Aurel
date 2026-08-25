'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import { generateBrief } from '@/app/(app)/meetings/actions'
import { Button } from '@/components/ui/button'
import { brand } from '@/lib/brand'

/**
 * REGENERATE A BRIEF
 * =============================================================================
 * A brief is a stored artifact, so it keeps saying what was true when it was
 * made. Research a person afterwards, confirm a memory, delete a source — the
 * brief does not notice.
 *
 * That matters most in the direction that damages trust: a brief can go on
 * citing evidence that has since been withdrawn. So when the record has moved
 * since the brief was prepared, say so plainly and offer to rebuild it. Silence
 * would leave a stale claim wearing the authority of a fresh one.
 *
 * Rebuilding is never automatic. It costs quota, and quietly replacing
 * something the user has already read is its own kind of dishonesty.
 * =============================================================================
 */
export function RegenerateBrief({
  meetingId,
  stale,
  reason,
}: {
  meetingId: string
  /** True when evidence changed after this brief was prepared. */
  stale: boolean
  /** What changed, in the user's terms. */
  reason: string | null
}) {
  const router = useRouter()
  const [running, setRunning] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      const result = await generateBrief(meetingId)
      if (result && 'error' in result && result.error) setError(result.error)
      else router.refresh()
    } catch {
      setError('The brief could not be rebuilt. Nothing was changed.')
    } finally {
      setRunning(false)
    }
  }

  if (!stale) {
    return (
      <Button variant="quiet" size="sm" onClick={run} disabled={running}>
        {running ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="size-3.5" aria-hidden="true" />
        )}
        {running ? 'Rebuilding…' : 'Rebuild'}
      </Button>
    )
  }

  return (
    <div className="border-caution/25 bg-caution-wash mt-4 flex flex-wrap items-start gap-2.5 rounded-[var(--radius-md)] border px-4 py-3">
      <TriangleAlert className="text-caution mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-ink text-sm">The record has changed since this was prepared.</p>
        <p className="text-ink-secondary mt-1 text-xs leading-relaxed">
          {reason ?? 'New evidence has been added.'} {brand.name} has not rebuilt the brief on its
          own — what you read below is what it knew at the time.
        </p>
        {error ? (
          <p role="alert" className="text-critical mt-2 text-xs">
            {error}
          </p>
        ) : null}
      </div>
      <Button variant="secondary" size="sm" onClick={run} disabled={running}>
        {running ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="size-3.5" aria-hidden="true" />
        )}
        {running ? 'Rebuilding…' : 'Rebuild it'}
      </Button>
    </div>
  )
}
