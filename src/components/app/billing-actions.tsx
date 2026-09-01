'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { CreditCard, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  openBillingPortal,
  startCheckout,
  type BillingState,
} from '@/app/(app)/settings/billing/actions'

/**
 * Upgrade and manage-billing controls.
 *
 * Both are plain forms posting to server actions that end in a redirect to
 * Stripe. No Stripe.js, no publishable key in the bundle, no card field in this
 * codebase — the hosted page is both safer and better maintained than anything
 * worth rebuilding here.
 */
export function UpgradeButton({
  interval = 'monthly',
  label = 'Upgrade to Pro',
  variant = 'primary',
}: {
  interval?: 'monthly' | 'yearly'
  label?: string
  /** Secondary for the interval that is not being led with. */
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
}: {
  label: string
  variant?: 'primary' | 'secondary'
  icon?: boolean
}) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : icon ? (
        <CreditCard className="size-3.5" aria-hidden="true" />
      ) : null}
      {pending ? 'Opening Stripe…' : label}
    </Button>
  )
}
