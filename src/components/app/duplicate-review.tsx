'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Merge, X } from 'lucide-react'
import { mergePeople, type DuplicatePair } from '@/app/(app)/people/actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/primitives'

/**
 * DUPLICATE REVIEW
 * =============================================================================
 * Two records for the same professional split their history in half, and the
 * split is invisible: each page looks complete on its own, and briefs quietly
 * draw on whichever half the meeting happens to point at.
 *
 * Detection is conservative — identical name, shared email, or shared profile
 * link. Nothing merges without the user choosing it, and the merged record is
 * archived rather than deleted, so a wrong call stays recoverable.
 * =============================================================================
 */
export function DuplicateReview({ pairs }: { pairs: DuplicatePair[] }) {
  const router = useRouter()
  const [dismissed, setDismissed] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const visible = pairs.filter((p) => !dismissed.includes(`${p.keep.id}:${p.merge.id}`))
  if (visible.length === 0) return null

  const merge = async (pair: DuplicatePair) => {
    const key = `${pair.keep.id}:${pair.merge.id}`
    setBusy(key)
    setError(null)
    const result = await mergePeople(pair.merge.id, pair.keep.id)
    setBusy(null)
    if (result?.error) setError(result.error)
    else router.refresh()
  }

  return (
    <section className="border-caution/25 bg-caution-wash mb-8 rounded-[var(--radius-lg)] border p-5">
      <p className="label">Possible duplicates</p>
      <p className="text-ink-secondary mt-2 max-w-lg text-sm leading-relaxed">
        These look like the same person recorded twice. Merging keeps every observation, interaction
        and source — the other record is archived, not deleted.
      </p>

      {error ? (
        <p role="alert" className="text-critical mt-3 text-xs">
          {error}
        </p>
      ) : null}

      <ul className="mt-4 grid gap-2">
        {visible.map((pair) => {
          const key = `${pair.keep.id}:${pair.merge.id}`
          return (
            <li
              key={key}
              className="border-line bg-surface flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-ink text-sm">
                  {pair.keep.name} <span className="text-ink-muted">and</span> {pair.merge.name}
                </p>
                <p className="text-ink-muted mt-0.5 text-[0.6875rem]">
                  {pair.reason} · keeping the record with{' '}
                  {pair.keep.interactionCount === 1
                    ? '1 interaction'
                    : `${pair.keep.interactionCount} interactions`}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge tone="outline">{pair.reason}</Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => merge(pair)}
                >
                  {busy === key ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Merge className="size-3.5" aria-hidden="true" />
                  )}
                  Merge
                </Button>
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => setDismissed((d) => [...d, key])}
                  aria-label="These are different people"
                >
                  <X className="size-3.5" aria-hidden="true" />
                  Different people
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
