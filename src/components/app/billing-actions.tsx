'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { CircleCheck, CreditCard, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  openBillingPortal,
  startCheckout,
  startProTrial,
  type BillingState,
} from '@/app/(app)/settings/billing/actions'

/**
 * Trial, subscribe and manage-billing controls.
 *
 * Subscribe and Manage billing are plain forms posting to server actions that
 * end in a redirect to Stripe. No Stripe.js, no publishable key in the bundle,
 * no card field in this codebase — the hosted page is both safer and better
 * maintained than anything worth rebuilding here. The trial never reaches
 * Stripe at all.
 */
export function UpgradeButton({
  interval = 'monthly',
  label = 'Upgrade to Pro',
  variant = 'primary',
}: {
  interval?: 'monthly' | 'yearly'
  label?: string
  variant?: 'primary' | 'secondary'
}) {
  const [state, formAction] = useActionState<BillingState, FormData>(startCheckout, {})

  return (
    <form action={formAction}>
      <input type="hidden" name="interval" value={interval} />
      <SubmitButton label={label} variant={variant} />
      {state.error ? (
        <p role="alert" className="text-critical mt-2 text-xs">
          {state.error}
        </p>
      ) : null}
    </form>
  )
}

/** Starts the 14-day trial: no card, no Stripe, once per account. */
export function TrialButton({ label = 'Start your 14-day Pro trial' }: { label?: string }) {
  const [state, formAction] = useActionState<BillingState, FormData>(startProTrial, {})

  return (
    <form action={formAction}>
      <SubmitButton label={label} pendingLabel="Starting your trial…" />
      {state.error ? (
        <p role="alert" className="text-critical mt-2 text-xs">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="text-positive mt-2 flex items-center gap-1.5 text-xs">
          <CircleCheck className="size-3.5 shrink-0" aria-hidden="true" />
          {state.message}
        </p>
      ) : null}
    </form>
  )
}

export function ManageBillingButton() {
  const [state, formAction] = useActionState<BillingState, FormData>(
    async () => openBillingPortal(),
    {},
  )

  return (
    <form action={formAction}>
      <SubmitButton label="Manage billing" variant="secondary" icon />
      {state.error ? (
        <p role="alert" className="text-critical mt-2 text-xs">
          {state.error}
        </p>
      ) : null}
    </form>
  )
}

function SubmitButton({
  label,
  variant = 'primary',
  icon = false,
  pendingLabel = 'Opening Stripe…',
}: {
  label: string
  variant?: 'primary' | 'secondary'
  icon?: boolean
  pendingLabel?: string
}) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : icon ? (
        <CreditCard className="size-3.5" aria-hidden="true" />
      ) : null}
      {pending ? pendingLabel : label}
    </Button>
  )
}
