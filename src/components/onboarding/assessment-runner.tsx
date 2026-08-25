'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Loader2, Minus } from 'lucide-react'
import { BLOCKS, BLOCK_COUNT, type Item } from '@/lib/assessment/instrument'
import { completeAssessment, recordResponse } from '@/app/onboarding/assessment/actions'
import { ApertureMark } from '@/components/brand/aperture'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { brand } from '@/lib/brand'

/**
 * THE INTERACTION PROFILE RUNNER
 * =============================================================================
 * Forced choice: of four behaviours, mark the one MOST like you and the one
 * LEAST like you.
 *
 * COMPOSITION
 * A 2x2 card grid on desktop, a single column on mobile. Each statement is its
 * own object with its own two controls, rather than a row in a table — the
 * earlier spreadsheet layout made a considered judgement feel like data entry,
 * and 24 rounds of data entry is where people abandon an assessment.
 *
 * STATE MODEL
 *   - two independent radio groups (`most`, `least`) over the same four items
 *   - selecting an item in one group disables it in the other, so the "must
 *     differ" rule is visible in the affordance instead of being an error later
 *   - re-selecting a chosen item clears it, so a mistake is one click to fix
 *   - a round is valid only with exactly one Most and one Least
 *
 * ACCESSIBILITY
 * Real <input type="radio"> elements inside real <fieldset>/<legend> groups, so
 * arrow-key navigation, group semantics and announcements come from the
 * platform. Selection state is conveyed by icon, border, fill AND text — never
 * by colour alone.
 * =============================================================================
 */

const ADVANCE_DELAY_MS = 320

interface StoredResponse {
  round_index: number
  block_id: string
  most_item_id: string
  least_item_id: string
}

type Answer = { most: string | null; least: string | null }

export function AssessmentRunner({
  assessmentId,
  initialResponses,
}: {
  assessmentId: string
  initialResponses: StoredResponse[]
}) {
  const router = useRouter()

  const [answers, setAnswers] = React.useState<Record<number, Answer>>(() => {
    const seeded: Record<number, Answer> = {}
    for (const r of initialResponses) {
      seeded[r.round_index] = { most: r.most_item_id, least: r.least_item_id }
    }
    return seeded
  })

  // Resume at the first unanswered round.
  const [round, setRound] = React.useState(() => {
    const answered = new Set(initialResponses.map((r) => r.round_index))
    for (let i = 0; i < BLOCK_COUNT; i++) if (!answered.has(i)) return i
    return BLOCK_COUNT - 1
  })

  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [durations, setDurations] = React.useState<number[]>([])

  const shownAt = React.useRef(Date.now())
  const advanceTimer = React.useRef<number | null>(null)
  const headingRef = React.useRef<HTMLHeadingElement>(null)

  const block = BLOCKS[round]!
  const answer = answers[round] ?? { most: null, least: null }
  const answeredCount = Object.values(answers).filter((a) => a.most && a.least).length
  const isComplete = Boolean(answer.most && answer.least)
  const isLast = round === BLOCK_COUNT - 1
  const allAnswered = answeredCount === BLOCK_COUNT

  React.useEffect(() => {
    shownAt.current = Date.now()
    headingRef.current?.focus()
  }, [round])

  React.useEffect(
    () => () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
    },
    [],
  )

  const persist = React.useCallback(
    async (roundIndex: number, next: Answer) => {
      if (!next.most || !next.least) return
      const result = await recordResponse({
        assessmentId,
        roundIndex,
        blockId: BLOCKS[roundIndex]!.id,
        mostItemId: next.most,
        leastItemId: next.least,
        latencyMs: Date.now() - shownAt.current,
      })
      if (!result.ok) setError('That answer did not save. Your progress is still here — try again.')
      else setError(null)
    },
    [assessmentId],
  )

  /**
   * Apply a choice.
   *
   * The next answer is computed BEFORE calling setState, and every side effect
   * (persisting, timing, scheduling the advance) happens outside the updater.
   * React double-invokes updaters in StrictMode, so effects placed inside one
   * fire twice — that produced duplicate writes, two competing advance timers,
   * and a "cannot update a component while rendering" error.
   */
  const choose = (kind: 'most' | 'least', itemId: string) => {
    const current = answers[round] ?? { most: null, least: null }

    // Re-selecting the same item clears it: one click to undo a misclick.
    const next: Answer =
      current[kind] === itemId ? { ...current, [kind]: null } : { ...current, [kind]: itemId }

    // The two choices must differ.
    if (kind === 'most' && next.least === itemId) next.least = null
    if (kind === 'least' && next.most === itemId) next.most = null

    setAnswers((prev) => ({ ...prev, [round]: next }))

    if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
    if (!next.most || !next.least) return

    void persist(round, next)
    setDurations((d) => [...d, Date.now() - shownAt.current].slice(-8))

    if (round < BLOCK_COUNT - 1) {
      advanceTimer.current = window.setTimeout(
        () => setRound((r) => Math.min(r + 1, BLOCK_COUNT - 1)),
        ADVANCE_DELAY_MS,
      )
    }
  }

  const finish = async () => {
    setSubmitting(true)
    setError(null)
    const result = await completeAssessment(assessmentId)
    if (result.ok) {
      router.push('/onboarding/reveal')
    } else {
      setSubmitting(false)
      setError('We could not finish scoring. Try again in a moment.')
    }
  }

  /**
   * Estimated time remaining, shown only once there is a real basis for it.
   * A made-up estimate is worse than none, so this stays hidden until three
   * rounds have actually been timed.
   */
  const remainingLabel = React.useMemo(() => {
    if (durations.length < 3) return null
    const sorted = [...durations].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]!
    const minutes = Math.round(((BLOCK_COUNT - answeredCount) * median) / 60_000)
    if (minutes < 1) return 'Under a minute left'
    if (minutes > 20) return null
    return `About ${minutes} min left`
  }, [durations, answeredCount])

  const progress = (answeredCount / BLOCK_COUNT) * 100

  return (
    <div className="py-4">
      {/* --- header: round counter, motif rule, progress ---------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-3xl leading-none text-ink outline-none sm:text-4xl"
        >
          <span className="tabular-nums">{String(round + 1).padStart(2, '0')}</span>
          <span className="text-ink-faint"> / {BLOCK_COUNT}</span>
        </h1>

        <div className="flex items-center gap-3 text-xs text-ink-muted">
          {remainingLabel ? <span>{remainingLabel}</span> : null}
          <span className="tabular-nums">
            {answeredCount} of {BLOCK_COUNT} answered
          </span>
        </div>
      </div>

      {/* The progress line terminates in the Atturel arch, so the motif does the
          work a percentage label would otherwise duplicate. */}
      <div className="mt-4 flex items-center gap-2">
        <div
          className="h-px flex-1 overflow-hidden bg-line"
          role="progressbar"
          aria-valuenow={answeredCount}
          aria-valuemin={0}
          aria-valuemax={BLOCK_COUNT}
          aria-label="Assessment progress"
        >
          <div
            className="h-full bg-accent-graphic transition-[width] duration-500 ease-[var(--ease-out-quint)]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <ApertureMark
          className={cn(
            'h-3 w-3 shrink-0 transition-colors duration-500',
            allAnswered ? 'text-accent' : 'text-line-strong',
          )}
          strokeWidth={1.8}
        />
      </div>

      <p className="mt-8 max-w-xl text-sm leading-relaxed text-ink-secondary">
        Mark the statement that is <strong className="font-medium text-ink">most</strong> like you at
        work, and the one that is <strong className="font-medium text-ink">least</strong> like you.
        There are no better or worse answers.
      </p>

      {/* --- the four statements --------------------------------------------- */}
      <fieldset className="mt-7 border-0 p-0">
        <legend className="sr-only">
          Round {round + 1} of {BLOCK_COUNT}. Choose one statement that is most like you and one
          that is least like you.
        </legend>

        <div className="grid gap-3 sm:grid-cols-2">
          {block.items.map((item, index) => (
            <StatementCard
              key={item.id}
              item={item}
              index={index}
              round={round}
              isMost={answer.most === item.id}
              isLeast={answer.least === item.id}
              onChoose={choose}
            />
          ))}
        </div>
      </fieldset>

      {/* Live region: announces validity without stealing focus. */}
      <p aria-live="polite" className="sr-only">
        {isComplete
          ? 'Both choices made. Moving to the next round.'
          : answer.most
            ? 'Most chosen. Now choose the statement least like you.'
            : answer.least
              ? 'Least chosen. Now choose the statement most like you.'
              : ''}
      </p>

      {error ? (
        <p role="alert" className="mt-5 text-sm text-critical">
          {error}
        </p>
      ) : null}

      {/* --- navigation ------------------------------------------------------- */}
      <div className="mt-9 flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => setRound((r) => Math.max(0, r - 1))}
          disabled={round === 0 || submitting}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Button>

        {allAnswered ? (
          <Button size="lg" onClick={finish} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Scoring your profile…
              </>
            ) : (
              <>
                See my {brand.assessmentName}
                <ArrowRight className="size-4" aria-hidden="true" />
              </>
            )}
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => setRound((r) => Math.min(BLOCK_COUNT - 1, r + 1))}
            disabled={!isComplete || submitting || isLast}
          >
            Next
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      {!isComplete ? (
        <p className="mt-3 text-xs text-ink-muted">
          {answer.most || answer.least
            ? `Choose the statement ${answer.most ? 'least' : 'most'} like you to continue.`
            : 'Choose one statement for each to continue.'}
        </p>
      ) : null}

      {/* --- round pager ------------------------------------------------------ */}
      <nav aria-label="Jump to a round" className="mt-10">
        <ol className="flex flex-wrap gap-1.5">
          {BLOCKS.map((b, i) => {
            const done = Boolean(answers[i]?.most && answers[i]?.least)
            const current = i === round
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setRound(i)}
                  aria-label={`Round ${i + 1}${done ? ', answered' : ', not answered'}`}
                  aria-current={current ? 'step' : undefined}
                  className={cn(
                    'size-2 rounded-full transition-colors duration-200',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                    current
                      ? 'bg-accent ring-2 ring-accent/30'
                      : done
                        ? 'bg-accent-graphic/55 hover:bg-accent-graphic'
                        : 'bg-line-strong hover:bg-ink-faint',
                  )}
                />
              </li>
            )
          })}
        </ol>
      </nav>
    </div>
  )
}

/**
 * One statement, presented as an object rather than a table row.
 *
 * Selected states are carried by four simultaneous signals — border, surface
 * tint, an icon, and a text label — so the distinction survives greyscale,
 * colour-blindness and a screen reader.
 */
function StatementCard({
  item,
  index,
  round,
  isMost,
  isLeast,
  onChoose,
}: {
  item: Item
  index: number
  round: number
  isMost: boolean
  isLeast: boolean
  onChoose: (kind: 'most' | 'least', itemId: string) => void
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col rounded-[var(--radius-lg)] border p-5 transition-all duration-200 ease-[var(--ease-out-quint)]',
        isMost && 'border-accent bg-accent-wash',
        isLeast && 'border-line-strong bg-bg-sunken',
        !isMost && !isLeast && 'border-line bg-surface',
      )}
    >
      {/* The motif marks the chosen statement — brand doing a functional job. */}
      {isMost ? (
        <ApertureMark
          className="absolute right-4 top-4 size-4 text-accent"
          strokeWidth={1.6}
        />
      ) : null}

      <p
        className={cn(
          'flex-1 pr-6 text-[0.9375rem] leading-relaxed',
          isLeast ? 'text-ink-secondary' : 'text-ink',
        )}
      >
        {item.text}
      </p>

      <div className="mt-5 flex gap-2">
        <ChoiceControl
          kind="most"
          round={round}
          item={item}
          index={index}
          checked={isMost}
          disabled={isLeast}
          onChoose={onChoose}
        />
        <ChoiceControl
          kind="least"
          round={round}
          item={item}
          index={index}
          checked={isLeast}
          disabled={isMost}
          onChoose={onChoose}
        />
      </div>
    </div>
  )
}

function ChoiceControl({
  kind,
  round,
  item,
  index,
  checked,
  disabled,
  onChoose,
}: {
  kind: 'most' | 'least'
  round: number
  item: Item
  index: number
  checked: boolean
  disabled: boolean
  onChoose: (kind: 'most' | 'least', itemId: string) => void
}) {
  const Icon = kind === 'most' ? Check : Minus
  const label = kind === 'most' ? 'Most like me' : 'Least like me'

  return (
    <label
      className={cn(
        // 44px minimum touch target on every viewport.
        // flex-1 splits the row evenly without depending on a grid template.
        'flex min-h-11 flex-1 cursor-pointer select-none items-center justify-center gap-1.5',
        'rounded-[var(--radius-md)] border px-3 text-[0.8125rem] font-medium',
        'transition-colors duration-150',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]',
        checked && kind === 'most' && 'border-accent bg-accent text-accent-contrast',
        checked && kind === 'least' && 'border-ink-secondary bg-ink-secondary text-bg',
        !checked && !disabled && 'border-line-strong text-ink-secondary hover:border-ink-faint hover:bg-bg-sunken',
        disabled && !checked && 'cursor-not-allowed border-line text-ink-faint opacity-60',
      )}
    >
      <input
        type="radio"
        // One radio group per kind per round, so arrow keys move between the
        // four statements the way a user expects.
        name={`round-${round}-${kind}`}
        value={item.id}
        checked={checked}
        disabled={disabled}
        // onClick, not onChange: clicking an already-checked radio fires no
        // change event, and re-clicking to clear a selection must work.
        onClick={() => !disabled && onChoose(kind, item.id)}
        onChange={() => {}}
        className="sr-only"
      />
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span aria-hidden="true">{kind === 'most' ? 'Most' : 'Least'}</span>
      <span className="sr-only">
        {label}: statement {index + 1}. {item.text}
      </span>
    </label>
  )
}
