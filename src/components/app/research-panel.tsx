'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
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
import {
  refineIdentityAndResearch,
  researchPerson,
  type IdentityDetail,
  type ResearchState,
} from '@/app/(app)/people/research-actions'
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
  autoStart = false,
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
  /**
   * Run once on arrival. Set when the person was just added with a profile
   * URL: the user has already pointed at the page to read, so making them find
   * and press a second button to read it was a second workflow for one intent.
   */
  autoStart?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
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

  const settle = (outcome: ResearchState) => {
    setRunning(false)
    setResult(outcome)
    if (outcome.ok) router.refresh()
  }

  const run = React.useCallback(async () => {
    setRunning(true)
    setStage(0)
    setResult(null)
    try {
      settle(await researchPerson(personId))
    } catch {
      settle({ error: 'Research did not complete. Nothing was saved — try again.' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId])

  const retryWith = async (details: {
    organizationName?: string
    jobTitle?: string
    profileUrl?: string
  }) => {
    setRunning(true)
    setStage(0)
    try {
      settle(await refineIdentityAndResearch({ personId, ...details }))
    } catch {
      settle({ error: 'Research did not complete. Nothing was saved — try again.' })
    }
  }

  // Once per mount; the flag is stripped first so a refresh does not run a
  // second, metered research job.
  const started = React.useRef(false)
  React.useEffect(() => {
    if (!autoStart || started.current) return
    started.current = true
    router.replace(pathname, { scroll: false })
    void run()
  }, [autoStart, pathname, router, run])

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
          ) : result.identity ? (
            <IdentityRecovery
              message={result.error ?? `I couldn't confidently identify ${personName}.`}
              missing={result.identity.missing}
              onRetry={retryWith}
            />
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

const DETAIL_FIELDS: Record<
  IdentityDetail,
  {
    name: 'organizationName' | 'jobTitle' | 'profileUrl'
    label: string
    placeholder: string
    type?: string
  }
> = {
  organization: {
    name: 'organizationName',
    label: 'Employer or company',
    placeholder: 'e.g. Ansys',
  },
  jobTitle: { name: 'jobTitle', label: 'Role or title', placeholder: 'e.g. VP Engineering' },
  profileUrl: {
    name: 'profileUrl',
    label: 'Professional or company profile URL',
    placeholder: 'https://',
    type: 'url',
  },
}

/**
 * "I couldn't confidently identify this person" -- with a way forward.
 *
 * The refusal was right: the sources it saw could have been somebody else, and
 * nothing uncertain is ever turned into a fact. What was missing was recovery.
 * This asks for the details not yet on record -- any one is enough -- and runs
 * research again with them. The rejected sources stay recorded as rejected.
 */
function IdentityRecovery({
  message,
  missing,
  onRetry,
}: {
  message: string
  missing: IdentityDetail[]
  onRetry: (details: { organizationName?: string; jobTitle?: string; profileUrl?: string }) => void
}) {
  // When every detail is already on record, a page the user vouches for is the
  // only thing left that can settle it.
  const asked: IdentityDetail[] = missing.length > 0 ? missing : ['profileUrl']

  return (
    <form
      className="border-caution/25 bg-caution-wash rounded-[var(--radius-md)] border px-4 py-3.5"
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const value = (key: string) => data.get(key)?.toString().trim() || undefined
        onRetry({
          organizationName: value('organizationName'),
          jobTitle: value('jobTitle'),
          profileUrl: value('profileUrl'),
        })
      }}
    >
      <p className="text-ink flex items-start gap-2 text-sm font-medium">
        <CircleAlert className="text-caution mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {message}
      </p>
      <p className="text-ink-secondary mt-1.5 text-xs leading-relaxed">
        {asked.length > 1 ? 'Add one of these and try again:' : 'Add this and try again:'}
      </p>

      <div className="mt-3 grid gap-3">
        {asked.map((detail) => {
          const field = DETAIL_FIELDS[detail]
          return (
            <label key={detail} className="grid gap-1.5">
              <span className="text-ink-secondary text-[0.8125rem] font-medium">{field.label}</span>
              <input
                name={field.name}
                type={field.type ?? 'text'}
                inputMode={field.type === 'url' ? 'url' : undefined}
                placeholder={field.placeholder}
                className="border-line-strong bg-surface text-ink min-h-11 w-full rounded-[var(--radius-md)] border px-3 text-sm"
              />
            </label>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" className="h-11">
          <Search className="size-3.5" aria-hidden="true" />
          Save and research again
        </Button>
        <span className="text-ink-muted text-xs">
          Or paste a link, a bio or your own notes below.
        </span>
      </div>
    </form>
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
