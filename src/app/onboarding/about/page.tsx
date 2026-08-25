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
        timezone: profile?.timezone ?? '',
      }}
    />
  )
}
