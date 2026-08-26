'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react'
import { requestPasswordReset, updatePassword, type AuthState } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { FormField, Input } from '@/components/ui/field'

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" className="mt-6 w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <span>Working…</span>
        </>
      ) : (
        label
      )}
    </Button>
  )
}

function Notice({ state }: { state: AuthState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="mt-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-critical/25 bg-critical-wash px-3 py-2.5 text-xs leading-relaxed text-critical"
      >
        <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        {state.error}
      </p>
    )
  }
  if (state.message) {
    return (
      <p
        role="status"
        className="mt-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-positive/25 bg-positive-wash px-3 py-2.5 text-xs leading-relaxed text-positive"
      >
        <CircleCheck className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        {state.message}
      </p>
    )
  }
  return null
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(requestPasswordReset, {})

  return (
    <form action={formAction} className="mt-8" noValidate>
      <FormField id="email" label="Work email" required error={state.fieldErrors?.email?.[0]}>
        {(props) => (
          <Input
            {...props}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
          />
        )}
      </FormField>
      <Notice state={state} />
      <Submit label="Send reset link" />
    </form>
  )
}

export function ResetPasswordForm({ email }: { email?: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(updatePassword, {})

  return (
    <form action={formAction} className="mt-8" noValidate>
      {/* The account this password belongs to.
          
          A password form with no username field leaves a password manager
          nothing to attach the new credential to, so it saves nothing and the
          entry it already holds goes stale. The user then finishes a successful
          reset and is locked out at the next sign-in by their own saved
          password — the failure lands well away from its cause.
          
          Not display:none, which managers skip. Present and readable to them,
          invisible and unreachable to everyone else. The server ignores it;
          updatePassword takes the user from the session. */}
      {email ? (
        <input
          type="text"
          name="username"
          value={email}
          readOnly
          autoComplete="username"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute -m-px h-px w-px overflow-hidden border-0 p-0 opacity-0"
        />
      ) : null}

      <div className="grid gap-4">
        <FormField
          id="password"
          label="New password"
          description="At least 10 characters."
          required
          error={state.fieldErrors?.password?.[0]}
        >
          {(props) => (
            <Input {...props} name="password" type="password" autoComplete="new-password" />
          )}
        </FormField>
        <FormField
          id="confirm"
          label="Confirm new password"
          required
          error={state.fieldErrors?.confirm?.[0]}
        >
          {(props) => (
            <Input {...props} name="confirm" type="password" autoComplete="new-password" />
          )}
        </FormField>
      </div>
      <Notice state={state} />
      <Submit label="Update password" />
    </form>
  )
}
