import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { publicEnv, serverEnv } from '@/lib/env'
import type { Database } from '@/lib/supabase/types'

/**
 * Request-scoped Supabase client bound to the user's session cookies.
 * Every query made through this client runs as the authenticated user and is
 * therefore subject to row level security. This is the only client that should
 * touch user data.
 */
export async function createClient() {
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
      '[aurel] SUPABASE_SERVICE_ROLE_KEY is not configured; this privileged operation is unavailable.',
    )
  }

  return createServerClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, key, {
    cookies: { getAll: () => [], setAll: () => {} },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
