'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CircleAlert, Loader2 } from 'lucide-react'
import { signIn, signUp, type AuthState } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { FormField, Input } from '@/components/ui/field'

/**
 * Email + password auth form.
 *
 * One component for both modes so the two screens can never drift apart in
 * spacing, validation display or error semantics.
 */
export function AuthForm({ mode, className }: { mode: 'sign-in' | 'sign-up'; className?: string }) {
  const isSignUp = mode === 'sign-up'
  const action = isSignUp ? signUp : signIn
  const [state, formAction] = useActionState<AuthState, FormData>(action, {})
  const searchParams = useSearchParams()
  const next = searchParams.get('next')

  return (
    <form action={formAction} className={className} noValidate>
      {/* Preserve the intended destination through the round trip. */}
      {!isSignUp && next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="grid gap-4">
        {isSignUp ? (
          <FormField
            id="fullName"
            label="Your name"
            required
            error={state.fieldErrors?.fullName?.[0]}
          >
            {(props) => (
              <Input
                {...props}
                name="fullName"
                autoComplete="name"
                placeholder="Alex Rivera"
                maxLength={120}
              />
            )}
          </FormField>
        ) : null}

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

        <FormField
          id="password"
          label="Password"
          required
          description={isSignUp ? 'At least 10 characters.' : undefined}
          error={state.fieldErrors?.password?.[0]}
        >
          {(props) => (
            <Input
              {...props}
              name="password"
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              placeholder="••••••••••"
            />
          )}
        </FormField>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-critical/25 bg-critical-wash px-3 py-2.5 text-xs leading-relaxed text-critical"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}

      <SubmitButton label={isSignUp ? 'Create account' : 'Sign in'} />

      {!isSignUp ? (
        <p className="mt-4 text-center text-xs">
          <Link href="/forgot-password" className="text-ink-muted hover:text-ink">
            Forgot your password?
          </Link>
        </p>
      ) : null}
    </form>
  )
}

function SubmitButton({ label }: { label: string }) {
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
