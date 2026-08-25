'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { ArrowRight, Loader2 } from 'lucide-react'
import { calibrateAssessment } from '@/app/onboarding/assessment/actions'
import { Button } from '@/components/ui/button'
import { OptionCard, Textarea } from '@/components/ui/field'
import { cn } from '@/lib/utils'

const RATINGS = [
  { value: 'very_accurate', label: 'Very accurate', hint: 'That is me.' },
  { value: 'mostly_accurate', label: 'Mostly accurate', hint: 'Right, with some edges off.' },
  { value: 'partly_accurate', label: 'Partly accurate', hint: 'Some of it lands, some does not.' },
  { value: 'not_accurate', label: 'Not accurate', hint: 'This does not describe me.' },
] as const

type State = { error?: string } | undefined

export function CalibrationForm({
  assessmentId,
  defaultRating,
  className,
}: {
  assessmentId: string
  defaultRating?: string
  className?: string
}) {
  const [state, formAction] = useActionState<State, FormData>(calibrateAssessment, undefined)
  const [rating, setRating] = React.useState<string | undefined>(defaultRating)

  // Only ask for detail when there is something to correct — a "what was off"
  // box under "Very accurate" is just friction.
  const wantsDetail = rating === 'partly_accurate' || rating === 'not_accurate'

  return (
    <form action={formAction} className={className}>
      <input type="hidden" name="assessmentId" value={assessmentId} />

      <div className="grid gap-2.5 sm:grid-cols-2">
        {RATINGS.map((option) => (
          <OptionCard
            key={option.value}
            type="radio"
            name="rating"
            value={option.value}
            checked={rating === option.value}
            onChange={() => setRating(option.value)}
            title={option.label}
            description={option.hint}
          />
        ))}
      </div>

      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-[var(--ease-out-quint)]',
          wantsDetail ? 'mt-4 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <label htmlFor="calibration-note" className="text-[0.8125rem] font-medium text-ink-secondary">
            What did it get wrong?
          </label>
          <p className="mt-1 text-xs text-ink-muted">
            Optional, but this is the correction Aurel will weight above the score.
          </p>
          <Textarea
            id="calibration-note"
            name="note"
            rows={3}
            maxLength={1000}
            className="mt-2"
            placeholder="I am far more direct than this suggests, especially with people I know well."
          />
        </div>
      </div>

      {state?.error ? (
        <p role="alert" className="mt-4 text-xs text-critical">
          {state.error}
        </p>
      ) : null}

      <Submit disabled={!rating} />
    </form>
  )
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <div className="mt-7">
      <Button type="submit" size="lg" disabled={disabled || pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Saving…
          </>
        ) : (
          <>
            Enter Aurel
            <ArrowRight className="size-4" aria-hidden="true" />
          </>
        )}
      </Button>
      {disabled ? (
        <p className="mt-2 text-xs text-ink-muted">Choose an answer to continue.</p>
      ) : null}
    </div>
  )
}
