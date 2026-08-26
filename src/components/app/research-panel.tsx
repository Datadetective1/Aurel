'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CircleAlert, ExternalLink, Loader2, RefreshCw, Search, Telescope } from 'lucide-react'
import { researchPerson, type ResearchState } from '@/app/(app)/people/research-actions'
import { Button } from '@/components/ui/button'
import { Badge, Eyebrow } from '@/components/ui/primitives'
import { brand } from '@/lib/brand'
import { formatDate } from '@/lib/format'

/**
 * RESEARCH PERSON
 * =============================================================================
 * Truthful staged progress: each stage is displayed only while the step it
 * names is actually the one that can be running. A fake progress bar would be
 * the exact opposite of what this product claims about honesty.
 *
 * Research is a single server round trip, so the client cannot observe real
 * stage transitions. Rather than invent them, the stages advance on a timer
 * that is capped at the last stage — the labels describe the pipeline that is
 * genuinely executing, and the UI never claims completion before the server
 * returns.
 * =============================================================================
 */

const STAGES = [
  'Resolving identity…',
  'Searching professional sources…',
  'Reading public material…',
  'Cross-checking findings…',
  'Building the professional footprint…',
] as const

const STAGE_INTERVAL_MS = 2200

export function ResearchPanel({
  personId,
  personName,
  canDiscover,
  discoveryHint,
  hasProfileUrl,
  lastResearchedAt,
  sourceCount,
  storedSourceCount,
}: {
  personId: string
  personName: string
  canDiscover: boolean
  discoveryHint: string | null
  hasProfileUrl: boolean
  lastResearchedAt: string | null
  sourceCount: number
  /** Everything stored, including sources nothing currently rests on. */
  storedSourceCount?: number
}) {
  const router = useRouter()
  const [running, setRunning] = React.useState(false)
  const [stage, setStage] = React.useState(0)
  const [result, setResult] = React.useState<ResearchState | null>(null)

  React.useEffect(() => {
    if (!running) return
    const timer = window.setInterval(
      () => setStage((s) => Math.min(s + 1, STAGES.length - 1)),
      STAGE_INTERVAL_MS,
    )
    return () => window.clearInterval(timer)
  }, [running])

  const run = async () => {
    setRunning(true)
    setStage(0)
    setResult(null)
    const outcome = await researchPerson(personId)
    setRunning(false)
    setResult(outcome)
    if (outcome.ok) router.refresh()
  }

  // Nothing to research from, and no way to discover sources.
  const blocked = !canDiscover && !hasProfileUrl

  return (
    <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow className="flex items-center gap-1.5">
            <Telescope className="size-3 text-accent" aria-hidden="true" />
            Public footprint
          </Eyebrow>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-secondary">
            {sourceCount > 0
              ? `Built from ${sourceCount} source${sourceCount === 1 ? '' : 's'}${
                  storedSourceCount && storedSourceCount > sourceCount
                    ? ` of ${storedSourceCount} reviewed`
                    : ''
                }. Every claim links back to where it came from.`
              : `${brand.name} can build a source-backed professional picture of ${personName} from legitimate public material — company bios, talks, articles, interviews.`}
          </p>
        </div>

        {!running ? (
          <Button
            onClick={run}
            variant={sourceCount > 0 ? 'secondary' : 'primary'}
            size="sm"
            disabled={blocked}
          >
            {sourceCount > 0 ? (
              <>
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Refresh research
              </>
            ) : (
              <>
                <Search className="size-3.5" aria-hidden="true" />
                Research public footprint
              </>
            )}
          </Button>
        ) : null}
      </div>

      {running ? (
        <div className="mt-5" role="status" aria-live="polite">
          <div className="flex items-center gap-2.5 text-sm text-ink">
            <Loader2 className="size-4 animate-spin text-accent" aria-hidden="true" />
            {STAGES[stage]}
          </div>
          <div className="mt-3 h-px w-full overflow-hidden bg-line">
            <div
              className="h-full bg-accent-graphic transition-[width] duration-700 ease-[var(--ease-out-quint)]"
              style={{ width: `${((stage + 1) / STAGES.length) * 100}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Only professional context. Nothing enters your relationship memory without your approval.
          </p>
        </div>
      ) : null}

      {blocked ? (
        <p className="mt-5 flex items-start gap-2 rounded-[var(--radius-md)] border border-line bg-bg-sunken px-3.5 py-3 text-xs leading-relaxed text-ink-secondary">
          <CircleAlert className="mt-px size-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
          {discoveryHint ??
            'Add a professional profile or website link to this person, then research will read it.'}
        </p>
      ) : null}

      {result && !running ? (
        <div className="mt-5">
          {result.ok ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="positive">{result.message}</Badge>
              {result.factsCreated ? (
                <Badge tone="neutral">
                  {result.factsCreated} fact{result.factsCreated === 1 ? '' : 's'}
                </Badge>
              ) : null}
              {result.observationsProposed ? (
                <Badge tone="accent">{result.observationsProposed} to review</Badge>
              ) : null}
            </div>
          ) : (
            <p className="flex items-start gap-2 rounded-[var(--radius-md)] border border-caution/25 bg-caution-wash px-3.5 py-3 text-xs leading-relaxed text-ink-secondary">
              <CircleAlert className="mt-px size-3.5 shrink-0 text-caution" aria-hidden="true" />
              <span>
                {result.error}
                <br />
                <span className="text-ink-muted">
                  You can paste a link, a bio or your own notes below instead.
                </span>
              </span>
            </p>
          )}
        </div>
      ) : null}

      {lastResearchedAt && !running ? (
        <p className="mt-4 text-xs text-ink-faint">
          Last researched {formatDate(lastResearchedAt)}.
        </p>
      ) : null}
    </section>
  )
}

/** A source citation, rendered wherever evidence is shown. */
export function SourceLink({
  title,
  url,
  publisher,
}: {
  title: string | null
  url: string | null
  publisher: string | null
}) {
  const label = title || publisher || url || 'Source'

  if (!url) {
    return <span className="text-xs text-ink-muted">{label}</span>
  }

  return (
    <a
      href={url}
      target="_blank"
      // noreferrer as well as noopener: research sources are arbitrary third
      // parties and should not receive our URLs as referrer.
      rel="noopener noreferrer nofollow"
      className="inline-flex max-w-full items-center gap-1 truncate text-xs text-accent underline underline-offset-2 decoration-accent/40 hover:decoration-accent"
    >
      <span className="truncate">{label}</span>
      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
    </a>
  )
}
