import 'server-only'
import { cookies } from 'next/headers'
import type { BillingInterval } from './plans'

/**
 * CHECKOUT INTENT
 * =============================================================================
 * Somebody who picks Pro before they have an account has told us something, and
 * the signup flow used to throw it away. They arrived intending to buy, spent
 * four minutes in onboarding, and were delivered to an empty Today screen with
 * no memory of why they came.
 *
 * A cookie rather than a `next` parameter, because the journey is not one hop:
 * pricing -> signup -> (email confirmation, in another tab, on another day) ->
 * onboarding -> app. A query parameter does not survive the confirmation link,
 * whose destination Supabase composes; a cookie does.
 *
 * This is NOT a security boundary and must never become one. All it can do is
 * preselect a billing interval on a page that independently requires an
 * authenticated, onboarded user, and whose checkout action re-derives the price
 * id from server configuration. The worst a forged value achieves is showing
 * somebody the annual option when they wanted the monthly one.
 * =============================================================================
 */

const COOKIE = 'atturel_checkout_intent'

/** A week. Long enough for a confirmation email to be opened on Monday. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7

function parse(value: string | undefined): BillingInterval | null {
  return value === 'monthly' || value === 'yearly' ? value : null
}

/** Remember that this visitor came to buy, before they had an account. */
export async function rememberCheckoutIntent(interval: BillingInterval): Promise<void> {
  const store = await cookies()
  store.set(COOKIE, interval, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

/**
 * Read the intent and clear it in the same breath.
 *
 * Callable only from a server action or route handler — cookies are read-only
 * inside a Server Component, and an intent that is read without being cleared
 * would follow the user around for a week.
 */
export async function takeCheckoutIntent(): Promise<BillingInterval | null> {
  const store = await cookies()
  const intent = parse(store.get(COOKIE)?.value)
  if (intent) store.delete(COOKIE)
  return intent
}

/** Where a remembered intent should deliver someone once they are signed in. */
export function intentDestination(interval: BillingInterval): string {
  return `/settings/billing?intent=${interval}`
}

/**
 * Where a user who has just finished onboarding should land.
 *
 * `/today?welcome=1` unless they arrived from the pricing page intending to
 * buy, in which case they are delivered to the purchase they started. Consumes
 * the intent, so this is the last place it can be honoured.
 */
export async function afterOnboardingPath(fallback = '/today?welcome=1'): Promise<string> {
  const intent = await takeCheckoutIntent()
  return intent ? intentDestination(intent) : fallback
}
