import 'server-only'
import { cookies, headers } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { publicEnv, serverEnv } from '@/lib/env'
import type { Database } from '@/lib/supabase/types'
import { BEARER_FLAG, bearerFlagValue } from '@/lib/bearer-routes'

/**
 * Request-scoped Supabase client bound to the user's session cookies.
 * Every query made through this client runs as the authenticated user and is
 * therefore subject to row level security. This is the only client that should
 * touch user data.
 */
export async function createClient() {
  const token = await bearerToken()
  if (token) {
    // The native app: the user's own access token, so every query still runs
    // as that user under row level security. Nothing is stored server-side.
    return createServerClient<Database>(
      publicEnv.NEXT_PUBLIC_SUPABASE_URL,
      publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: { getAll: () => [], setAll: () => {} },
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      },
    )
  }

  const cookieStore = await cookies()

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Session refresh is handled by middleware, so this is safe to ignore.
          }
        },
      },
    },
  )
}

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

/**
 * The Supabase access token the native app sent, or null.
 *
 * Honoured only on routes the middleware flagged as bearer routes (the
 * /api/mobile handlers and the transcription route), and only when it has the
 * shape of a JWT. Everywhere else -- every page and every server action --
 * authentication stays cookie-only, exactly as before. The token is verified
 * by `auth.getUser(token)` in lib/auth; this function only finds it.
 */
export async function bearerToken(): Promise<string | null> {
  const h = await headers()
  const mark = h.get(BEARER_FLAG)
  if (!mark || mark !== (await bearerFlagValue())) return null
  const token = h
    .get('authorization')
    ?.match(/^Bearer\s+(.+)$/i)?.[1]
    ?.trim()
  return token && JWT_SHAPE.test(token) ? token : null
}

/**
 * Service-role client. Bypasses RLS entirely — use only where there is no user
 * session to act on behalf of (Stripe webhooks, hard account deletion) and always
 * scope queries by user id explicitly.
 *
 * Throws rather than silently falling back, so a missing key can never cause a
 * privileged path to run with user-level permissions and half-succeed.
 */
export function createServiceRoleClient() {
  const key = serverEnv.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error(
      '[atturel] SUPABASE_SERVICE_ROLE_KEY is not configured; this privileged operation is unavailable.',
    )
  }

  return createServerClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, key, {
    cookies: { getAll: () => [], setAll: () => {} },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
