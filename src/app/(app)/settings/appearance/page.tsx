import type { Metadata } from 'next'
import { PreferencesSettingsForm } from '@/components/app/settings-forms'
import { Eyebrow } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { features } from '@/lib/env'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = {
  title: 'Appearance and voice',
  robots: { index: false, follow: false },
}

export default async function AppearanceSettingsPage() {
  const { user, profile } = await requireOnboardedUser()
  const supabase = await createClient()

  // The last time the daily email actually went out, so the switch can say
  // what it has been doing rather than only what it will do.
  const { data: lastDelivery } = await supabase
    .from('follow_through_deliveries')
    .select('sent_at, loop_count')
    .eq('user_id', user.id)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <div>
      <Eyebrow>Appearance and voice</Eyebrow>
      <p className="text-ink-secondary mt-2 max-w-lg text-sm leading-relaxed">
        How the product looks, and how directly it talks to you.
      </p>

      <div className="mt-6">
        <PreferencesSettingsForm
          preferences={{
            theme: profile.theme,
            coachingStyle: profile.coaching_style,
            emailNotifications: profile.email_notifications,
            followThroughEmail: profile.follow_through_email,
            followThroughHour: profile.follow_through_hour,
          }}
          followThrough={{
            deliveryConfigured: features.emailDelivery,
            scheduled: features.scheduledJobs,
            lastSentLabel: lastDelivery?.sent_at
              ? `${formatDate(lastDelivery.sent_at, profile.timezone ?? 'UTC')}, ${lastDelivery.loop_count} ${lastDelivery.loop_count === 1 ? 'loop' : 'loops'}`
              : null,
          }}
        />
      </div>
    </div>
  )
}
