import type { Metadata } from 'next'
import { AvatarUpload } from '@/components/app/avatar-upload'
import { ProfileSettingsForm } from '@/components/app/settings-forms'
import { SignOutButton } from '@/components/app/sign-out-button'
import { Eyebrow, Rule } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { resolveFace } from '@/lib/conversations/avatars'
import { brand } from '@/lib/brand'

export const metadata: Metadata = { title: 'Profile', robots: { index: false, follow: false } }

export default async function ProfileSettingsPage() {
  const { user, profile } = await requireOnboardedUser()
  const face = await resolveFace(await createClient(), profile)

  return (
    <div>
      <Eyebrow>Profile</Eyebrow>
      <p className="text-ink-secondary mt-2 max-w-lg text-sm leading-relaxed">
        Used to make guidance specific to your role. Never shared.
      </p>

      <div className="border-line bg-surface mt-6 rounded-[var(--radius-lg)] border p-5">
        <AvatarUpload name={profile.preferred_name || profile.full_name || 'You'} src={face} />
        <p className="text-ink-muted mt-3 text-xs">
          Your photo is shown only to you, in {brand.name}. It is not part of any public profile.
        </p>
      </div>

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
