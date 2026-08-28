'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CircleAlert, Loader2 } from 'lucide-react'
import {
  answerScenario,
  scoreScenarioAssessment,
} from '@/app/onboarding/assessment/scenario-actions'
import { Button } from '@/components/ui/button'
import { Eyebrow } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import type { Scenario } from '@/lib/assessment/scenarios'
import { brand } from '@/lib/brand'

/**
 * SCENARIO RUNNER
 * =============================================================================
 * One situation, three answers, no ranking.
 *
 * The instrument it replaced asked people to order four unrelated statements
 * MOST and LEAST like them, which is two judgements about four things at once.
 * This asks one question with one answer, which is what the user thought they
 * were being asked in the first place.
 *
 * "It depends" sits beside the other two rather than below them, because it is
 * a real answer and styling it as an escape hatch tells people it is a lesser
 * one. It records that the question was seen and moves no score.
 * =============================================================================
 */

export interface ScenarioAnswer {
  scenarioId: string
  optionId: string
}

export function ScenarioRunner({
  assessmentId,
  scenarios,
  initialAnswers,
  finishHref,
  finishLabel,
  headingLevel = 'h1',
}: {
  assessmentId: string
  scenarios: readonly Scenario[]
  initialAnswers: ScenarioAnswer[]
  finishHref: string
  finishLabel: string
  headingLevel?: 'h1' | 'h2'
}) {
  const router = useRouter()
  const Heading = headingLevel

  const [answers, setAnswers] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(initialAnswers.map((a) => [a.scenarioId, a.optionId])),
  )
  const [index, setIndex] = React.useState(() => {
    const answered = new Set(initialAnswers.map((a) => a.scenarioId))
    const first = scenarios.findIndex((s) => !answered.has(s.id))
    return first === -1 ? scenarios.length - 1 : first
  })
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const headingRef = React.useRef<HTMLHeadingElement>(null)
  const scenario = scenarios[index]!
  const chosen = answers[scenario.id] ?? null
  const answeredCount = scenarios.filter((s) => answers[s.id]).length
  const allAnswered = answeredCount === scenarios.length
  const isLast = index === scenarios.length - 1
  // The opening sitting is the short one. Refinement opens the whole bank, and
  // showing "6 quick questions" over eighteen would be a lie.
  const isOpeningSitting = scenarios.length <= 6

  React.useEffect(() => {
    headingRef.current?.focus()
  }, [index])

  async function choose(optionId: string) {
    setAnswers((prev) => ({ ...prev, [scenario.id]: optionId }))
    setError(null)

    const result = await answerScenario({ assessmentId, scenarioId: scenario.id, optionId })
    if (!result.ok) {
      setError('That answer did not save. Try again.')
      return
    }

    // Advance on its own so the flow keeps moving, but not so fast that the
    // choice cannot be seen registering.
    if (!isLast) window.setTimeout(() => setIndex((i) => Math.min(i + 1, scenarios.length - 1)), 260)
  }

  async function finish() {
    setSaving(true)
    setError(null)
    const result = await scoreScenarioAssessment(assessmentId)
    if (result.ok) router.push(finishHref)
    else {
      setSaving(false)
      setError('We could not finish scoring. Try again in a moment.')
    }
  }

  return (
    <div className="py-4">
      {isOpeningSitting ? (
        <div className="border-line bg-bg-sunken mb-6 rounded-[var(--radius-md)] border px-4 py-3">
          <p className="text-ink text-sm font-medium">
            {scenarios.length} quick questions · about a minute
          </p>
          <p className="text-ink-secondary mt-1 text-xs leading-relaxed">
            {brand.name} uses these to personalize its first suggestions, and refines them as you
            use it. There is nothing to finish later unless you want to.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <Heading
          ref={headingRef}
          tabIndex={-1}
          className="text-ink font-display text-3xl leading-none outline-none sm:text-4xl"
        >
          <span className="tabular-nums">{String(index + 1).padStart(2, '0')}</span>
          <span className="text-ink-faint"> / {scenarios.length}</span>
        </Heading>
        <span className="text-ink-muted text-xs tabular-nums">
          {answeredCount} of {scenarios.length} answered
        </span>
      </div>

      <div className="bg-line mt-4 h-px w-full overflow-hidden" role="presentation">
        <div
          className="bg-accent-graphic h-full transition-[width] duration-500 ease-[var(--ease-out-quint)]"
          style={{ width: `${(answeredCount / scenarios.length) * 100}%` }}
        />
      </div>

      <fieldset className="mt-9">
        <legend className="text-ink font-display max-w-xl text-xl leading-snug sm:text-2xl">
          {scenario.prompt}
        </legend>

        <p className="text-ink-muted mt-3 text-xs">
          There is no right answer here — both are things good people do.
        </p>

        <div className="mt-6 grid gap-2.5">
          {scenario.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => choose(option.id)}
              aria-pressed={chosen === option.id}
              className={cn(
                'min-h-11 w-full rounded-[var(--radius-md)] border px-4 py-3 text-left text-sm transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                chosen === option.id
                  ? 'border-accent bg-accent text-accent-contrast'
                  : 'border-line-strong text-ink-secondary hover:border-ink-faint hover:bg-bg-sunken',
                // "It depends" is a peer, not a lesser option. Same weight,
                // same size, one step of separation.
                option.direction === 0 && chosen !== option.id ? 'text-ink-muted' : '',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="quiet"
          size="sm"
          className="min-h-11"
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          disabled={index === 0}
        >
          Back
        </Button>

        {!isLast ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11"
            onClick={() => setIndex((i) => Math.min(i + 1, scenarios.length - 1))}
          >
            Skip
          </Button>
        ) : null}

        {allAnswered || isLast ? (
          <Button size="lg" onClick={finish} disabled={saving || answeredCount === 0}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Scoring…
              </>
            ) : (
              finishLabel
            )}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-critical mt-4 flex items-start gap-2 text-xs">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <p className="text-ink-faint mt-10 text-xs leading-relaxed">
        <Eyebrow className="mb-1 block">About these questions</Eyebrow>
        {/* These are genuinely different and the copy used to say they were the
            same, which made the honest answer feel like a wasted one. */}
        &ldquo;It depends&rdquo; is a real answer — {brand.name} records that your approach there
        varies with the situation, and says so rather than guessing a side. Skipping leaves the
        question unanswered, and nothing is inferred from it either way.
      </p>
    </div>
  )
}
