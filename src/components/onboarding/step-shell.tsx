'use client'

import * as React from 'react'
import { useFormStatus } from 'react-dom'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
}: {
  title: string
  description?: string
  children: React.ReactNode
  /** Rendered as a secondary submit that posts the form with nothing selected. */
  skipAction?: React.ReactNode
  submitLabel?: string
  note?: string
}) {
  return (
    <div className="py-4">
      <h1 className="font-display text-3xl leading-tight text-ink sm:text-[2.25rem]">{title}</h1>
      {description ? (
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-secondary">{description}</p>
      ) : null}

      <div className="mt-9">{children}</div>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <ContinueButton label={submitLabel} />
        {skipAction}
      </div>

      {note ? <p className="mt-4 text-xs leading-relaxed text-ink-muted">{note}</p> : null}
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
