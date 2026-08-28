import { AboutForm } from '@/components/onboarding/about-form'
import { getProfile } from '@/lib/auth'

export const metadata = { title: 'About you', robots: { index: false, follow: false } }

export default async function AboutPage() {
  const profile = await getProfile()

  return (
    <AboutForm
      defaults={{
        fullName: profile?.full_name ?? '',
        preferredName: profile?.preferred_name ?? '',
        jobTitle: profile?.job_title ?? '',
        company: profile?.company ?? '',
        jobFunction: profile?.job_function ?? '',
        seniority: profile?.seniority ?? '',
        pronouns: profile?.pronouns ?? '',
        // The column defaults to 'UTC', which is indistinguishable from having
        // chosen it. During onboarding nobody has chosen anything yet, so a
        // bare default is treated as unset and the field falls back to the zone
        // detected from the device -- otherwise every new account is created in
        // UTC and told the wrong day every evening. An explicit UTC is still
        // selectable from the list, and once saved it is honoured everywhere.
        timezone: profile?.timezone && profile.timezone !== 'UTC' ? profile.timezone : '',
      }}
    />
  )
}
