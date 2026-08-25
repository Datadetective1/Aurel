import type { Metadata } from 'next'
import { ProfileSettingsForm } from '@/components/app/settings-forms'
import { SignOutButton } from '@/components/app/sign-out-button'
import { Eyebrow, Rule } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'

export const metadata: Metadata = { title: 'Profile', robots: { index: false, follow: false } }

export default async function ProfileSettingsPage() {
  const { user, profile } = await requireOnboardedUser()

  return (
    <div>
      <Eyebrow>Profile</Eyebrow>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-secondary">
        Used to make guidance specific to your role. Never shared.
      </p>

      <div className="mt-6">
        <ProfileSettingsForm
          profile={{
            fullName: profile.full_name ?? '',
            preferredName: profile.preferred_name ?? '',
            jobTitle: profile.job_title ?? '',
            company: profile.company ?? '',
            pronouns: profile.pronouns ?? '',
            timezone: profile.timezone ?? 'UTC',
          }}
          email={user.email ?? ''}
        />
      </div>

      <Rule />

      <Eyebrow>Session</Eyebrow>
      <div className="mt-4">
        <SignOutButton />
      </div>
    </div>
  )
}
