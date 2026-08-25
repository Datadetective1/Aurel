import { AppShell } from '@/components/app/app-shell'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Establishes auth AND completed onboarding for every route beneath this.
  const { user, profile } = await requireOnboardedUser()

  const supabase = await createClient()
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan')
    .eq('user_id', user.id)
    .maybeSingle()

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
