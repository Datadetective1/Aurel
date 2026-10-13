'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowDown,
  CircleAlert,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Telescope,
} from 'lucide-react'
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
  timeZone,
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
  /**
   * The account holder's zone. Required, not defaulted: this renders on the
   * server and again at hydration, and a date formatted with an ambient zone
   * differs between the two.
   */
  timeZone: string
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
    <section className="border-line bg-surface rounded-[var(--radius-lg)] border p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow className="flex items-center gap-1.5">
            <Telescope className="text-accent size-3" aria-hidden="true" />
            Public footprint
          </Eyebrow>
          <p className="text-ink-secondary mt-2 max-w-lg text-sm leading-relaxed">
            {sourceCount > 0
              ? `Built from ${sourceCount} source${sourceCount === 1 ? '' : 's'}${
                  storedSourceCount && storedSourceCount > sourceCount
                    ? ` of ${storedSourceCount} reviewed`
                    : ''
                }. Every claim links back to where it came from.`
              : canDiscover || hasProfileUrl
                ? `Public professional sources about ${personName}, checked and cited.`
                : (discoveryHint ??
                  `Add a link and ${brand.name} reads it for professional context.`)}
          </p>
        </div>

        {!running && blocked ? (
          <Button asChild variant="secondary" size="sm">
            <a href="#add-context">
              <Link2 className="size-3.5" aria-hidden="true" />
              Add a source
            </a>
          </Button>
        ) : !running ? (
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
          <div className="text-ink flex items-center gap-2.5 text-sm">
            <Loader2 className="text-accent size-4 animate-spin" aria-hidden="true" />
            {STAGES[stage]}
          </div>
          <div className="bg-line mt-3 h-px w-full overflow-hidden">
            <div
              className="bg-accent-graphic h-full transition-[width] duration-700 ease-[var(--ease-out-quint)]"
              style={{ width: `${((stage + 1) / STAGES.length) * 100}%` }}
            />
          </div>
          <p className="text-ink-muted mt-3 text-xs">
            Only professional context. Nothing enters your relationship memory without your
            approval.
          </p>
        </div>
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
              {/* A destination, not just a count. The review queue is further
                  down this same page; saying how many there are without saying
                  where they are is a to-do list with no address. */}
              {result.observationsProposed ? (
                <a
                  href="#proposals"
                  className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  <Badge tone="accent">
                    {result.observationsProposed} to review
                    <ArrowDown className="ms-1 size-3" aria-hidden="true" />
                  </Badge>
                </a>
              ) : null}
            </div>
          ) : (
            <p className="border-caution/25 bg-caution-wash text-ink-secondary flex items-start gap-2 rounded-[var(--radius-md)] border px-3.5 py-3 text-xs leading-relaxed">
              <CircleAlert className="text-caution mt-px size-3.5 shrink-0" aria-hidden="true" />
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
        <p className="text-ink-faint mt-4 text-xs">
          Last researched {formatDate(lastResearchedAt, timeZone)}.
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
    return <span className="text-ink-muted text-xs">{label}</span>
  }

  return (
    <a
      href={url}
      target="_blank"
      // noreferrer as well as noopener: research sources are arbitrary third
      // parties and should not receive our URLs as referrer.
      rel="noopener noreferrer nofollow"
      className="text-accent decoration-accent/40 hover:decoration-accent inline-flex max-w-full items-center gap-1 truncate text-xs underline underline-offset-2"
    >
      <span className="truncate">{label}</span>
      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
    </a>
  )
}
