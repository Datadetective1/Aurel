import type { Metadata } from 'next'
import { AppShell } from '@/components/app/app-shell'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { track } from '@/lib/analytics'

/**
 * Belt and braces: the signed-in surface is never indexable.
 *
 * Anonymous requests here are redirected by middleware and robots.txt asks
 * crawlers not to try, so this directive should never be the thing that saves
 * us. It exists because the root layout declares index: true and every route
 * beneath this one inherits it — and the cost of being wrong about that, on
 * pages containing notes about named colleagues, is not recoverable.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Establishes auth AND completed onboarding for every route beneath this.
  const { user, profile } = await requireOnboardedUser()

  const supabase = await createClient()
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan')
    .eq('user_id', user.id)
    .maybeSingle()

  await recordSession(supabase, user.id, profile.last_seen_at)

  return (
    <AppShell
      user={{
        name: profile.preferred_name || profile.full_name || 'You',
        email: user.email ?? '',
        avatarUrl: profile.avatar_url,
        plan: subscription?.plan ?? 'free',
      }}
    >
      {children}
    </AppShell>
  )
}

/**
 * Session boundaries, for retention.
 *
 * Runs on the layout that wraps every signed-in route, so it sees each visit
 * once per navigation tree rather than once per page. Two thresholds keep the
 * cost down and the signal meaningful: the row is only written when the stamp
 * is older than WRITE_EVERY, and a `return_session` is only emitted when the
 * gap is longer than SESSION_GAP -- otherwise every page load would look like
 * a new visit.
 *
 * Best-effort throughout. A failure here must never stop the app rendering,
 * because nothing a user is trying to do depends on it.
 */
const WRITE_EVERY_MS = 30 * 60 * 1000
const SESSION_GAP_MS = 8 * 60 * 60 * 1000

async function recordSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  lastSeenAt: string | null,
) {
  try {
    const now = Date.now()
    const previous = lastSeenAt ? new Date(lastSeenAt).getTime() : null

    if (previous !== null && now - previous < WRITE_EVERY_MS) return

    // A first visit is a signup, not a return. Only a real gap counts.
    if (previous !== null && now - previous >= SESSION_GAP_MS) {
      await track('return_session', { hoursAway: Math.round((now - previous) / 3_600_000) })
    }

    await supabase
      .from('profiles')
      .update({ last_seen_at: new Date(now).toISOString() })
      .eq('id', userId)
  } catch {
    // Retention telemetry is never worth a blank page.
  }
}
