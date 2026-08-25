import type { Metadata } from 'next'
import { PreferencesSettingsForm } from '@/components/app/settings-forms'
import { Eyebrow } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Appearance and voice',
  robots: { index: false, follow: false },
}

export default async function AppearanceSettingsPage() {
  const { profile } = await requireOnboardedUser()

  return (
    <div>
      <Eyebrow>Appearance and voice</Eyebrow>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-secondary">
        How the product looks, and how directly it talks to you.
      </p>

      <div className="mt-6">
        <PreferencesSettingsForm
          preferences={{
            theme: profile.theme,
            coachingStyle: profile.coaching_style,
            emailNotifications: profile.email_notifications,
          }}
        />
      </div>
    </div>
  )
}
