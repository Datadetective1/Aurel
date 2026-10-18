'use client'

import * as React from 'react'
import { useFormStatus } from 'react-dom'
import { ArrowRight, Loader2 } from 'lucide-react'
import { finishOnboardingLater } from '@/app/onboarding/actions'
import { Button } from '@/components/ui/button'
import type { EnrichmentStep } from '@/lib/onboarding'
import { OnboardingProgress } from './progress'

/**
 * Shared chrome for every onboarding step: a heading, the fields, and a
 * consistent footer. Keeping this in one place is what stops the six steps from
 * drifting into six slightly different layouts.
 */
export function StepShell({
  title,
  description,
  children,
  skipAction,
  submitLabel = 'Continue',
  note,
  optionalStep,
}: {
  title: string
  description?: string
  children: React.ReactNode
  /** Rendered as a secondary submit that posts the form with nothing selected. */
  skipAction?: React.ReactNode
  submitLabel?: string
  note?: string
  /**
   * Marks this as one of the optional tailoring steps: shows where it sits in
   * that short sequence and offers "Finish later", which leaves the whole group
   * rather than skipping one step at a time.
   */
  optionalStep?: EnrichmentStep
}) {
  return (
    <div className="py-4">
      {optionalStep ? <OnboardingProgress step={optionalStep} /> : null}
      <h1 className="font-display text-ink text-3xl leading-tight sm:text-[2.25rem]">{title}</h1>
      {description ? (
        <p className="text-ink-secondary mt-3 max-w-xl text-sm leading-relaxed">{description}</p>
      ) : null}

      <div className="mt-9">{children}</div>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <ContinueButton label={submitLabel} />
        {skipAction}
        {optionalStep ? <FinishLaterButton /> : null}
      </div>

      {note ? <p className="text-ink-muted mt-4 text-xs leading-relaxed">{note}</p> : null}
    </div>
  )
}

export function ContinueButton({ label = 'Continue' }: { label?: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <span>Saving…</span>
        </>
      ) : (
        <>
          {label}
          <ArrowRight className="size-4" aria-hidden="true" />
        </>
      )}
    </Button>
  )
}

/**
 * Leaves the tailoring steps for Today. A submit with its own formAction, so it
 * can sit inside the step's form without saving that step's answers.
 */
export function FinishLaterButton() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      variant="quiet"
      size="lg"
      disabled={pending}
      formAction={finishOnboardingLater}
      formNoValidate
    >
      Finish later
    </Button>
  )
}

/**
 * Skip is a real submit, not a link: it posts the form with nothing selected so
 * the step still advances the stored stage. A link would leave the user's
 * progress pointing at a step they have already passed.
 */
export function SkipButton({ label = 'Skip this' }: { label?: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="quiet" size="lg" disabled={pending} name="_skip" value="1">
      {label}
    </Button>
  )
}
