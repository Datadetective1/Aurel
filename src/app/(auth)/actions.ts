'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { safeRedirectPath } from '@/lib/auth'
import { absoluteUrl } from '@/lib/brand'
import { logger } from '@/lib/logger'
import { sendEmail } from '@/lib/email/send'
import { passwordChangedEmail, welcomeEmail } from '@/lib/email/templates'
import { intentDestination, takeCheckoutIntent } from '@/lib/billing/checkout-intent'

/**
 * Auth server actions.
 *
 * Error handling policy: never reveal whether an email address is registered.
 * Sign-in failures always return the same generic message, and sign-up with an
 * existing address behaves identically to a fresh sign-up. Supabase itself
 * returns distinguishable errors, so that normalisation happens here.
 */

export interface AuthState {
  error?: string
  message?: string
  fieldErrors?: Record<string, string[]>
}

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.')

const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200, 'That password is too long.')

const signUpSchema = z.object({
  fullName: z.string().trim().min(1, 'Tell us what to call you.').max(120),
  email: emailSchema,
  password: passwordSchema,
})

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
})

const GENERIC_SIGN_IN_ERROR = 'That email and password combination did not work.'

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: absoluteUrl('/auth/callback?next=/onboarding'),
    },
  })

  if (error) {
    logger.warn('auth.sign_up_failed', { code: error.code, status: error.status })
    // Rate limits are worth surfacing accurately; everything else stays generic
    // so this endpoint cannot be used to enumerate registered addresses.
    if (error.status === 429) {
      return { error: 'Too many attempts. Wait a minute and try again.' }
    }
    return { error: 'We could not create that account. Try a different email address.' }
  }

  // Welcome mail is best-effort and deliberately not awaited for its result
  // beyond delivery: sendEmail never throws, and a mail outage must not fail a
  // signup that already succeeded. Without a provider configured this writes a
  // log line instead, which is the supported unconfigured state.
  const welcome = welcomeEmail({ firstName: firstNameOf(parsed.data.fullName) })
  await sendEmail({
    to: parsed.data.email,
    subject: welcome.subject,
    html: welcome.html,
    kind: 'welcome',
  })

  // No session means Supabase is holding the account for email confirmation.
  // The destination is not carried in that link -- Supabase composes it -- so
  // a checkout intent survives this hop in its cookie instead.
  if (!data.session) {
    redirect(`/check-email?email=${encodeURIComponent(parsed.data.email)}`)
  }

  revalidatePath('/', 'layout')
  // Onboarding first, always: a brand new account has nothing to be Pro about
  // yet. Where they go afterwards is decided by afterOnboardingPath(), which
  // is where a remembered purchase is honoured.
  redirect('/onboarding')
}

/** First name for a greeting. Falls back to the whole string. */
function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    logger.warn('auth.sign_in_failed', { code: error.code, status: error.status })
    if (error.status === 429) {
      return { error: 'Too many attempts. Wait a minute and try again.' }
    }
    if (error.code === 'email_not_confirmed') {
      return {
        error: 'Confirm your email address first — check your inbox for the link we sent.',
      }
    }
    return { error: GENERIC_SIGN_IN_ERROR }
  }

  // An explicit destination wins. Failing that, somebody who picked a plan
  // before signing in is returned to that purchase rather than to Today.
  const requested = formData.get('next')?.toString()
  const intent = requested ? null : await takeCheckoutIntent()
  const next = safeRedirectPath(intent ? intentDestination(intent) : requested)

  revalidatePath('/', 'layout')
  redirect(next)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = emailSchema.safeParse(formData.get('email'))
  if (!parsed.success) {
    return { fieldErrors: { email: ['Enter a valid email address.'] } }
  }

  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: absoluteUrl('/auth/callback?next=/reset-password'),
  })

  // Always the same response, whether or not the address exists.
  return {
    message: 'If that address has an account, a reset link is on its way.',
  }
}

const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Those passwords do not match.',
    path: ['confirm'],
  })

export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  })

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  const supabase = await createClient()

  // The recovery link must have established a session before this point.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'That reset link has expired. Request a new one.' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    logger.warn('auth.password_update_failed', { code: error.code })
    return { error: 'We could not update your password. Request a fresh reset link.' }
  }

  // Record the event without any identifying detail beyond the user id.
  const forwarded = (await headers()).get('x-forwarded-for')
  await supabase.from('security_events').insert({
    user_id: user.id,
    kind: 'password_changed',
    ip_hash: forwarded ? await hashValue(forwarded) : null,
  })

  // Tell them their password changed. This is the one email with no
  // unsubscribe: a security notice a user can switch off is not a security
  // notice, and an unexpected one here is how someone learns their account was
  // taken over.
  if (user.email) {
    const notice = passwordChangedEmail({
      firstName: firstNameOf((user.user_metadata?.full_name as string | undefined) ?? ''),
    })
    await sendEmail({
      to: user.email,
      subject: notice.subject,
      html: notice.html,
      kind: 'password_changed',
    })
  }

  revalidatePath('/', 'layout')
  redirect('/today')
}

/** SHA-256 of a value, so an audit row can correlate without storing the source. */
async function hashValue(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}
