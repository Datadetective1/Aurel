import { redirect } from 'next/navigation'
import { AboutForm } from '@/components/onboarding/about-form'
import { getProfile } from '@/lib/auth'
import { isEnrichmentStep, stepPath } from '@/lib/onboarding'

export const metadata = { title: 'Welcome', robots: { index: false, follow: false } }

/**
 * The only onboarding screen a new account has to see.
 *
 * It used to be an introduction with a Start button, followed by a separate
 * "about you" form and five more steps before Today. The introduction and the
 * identity step are now one screen, and saving it opens the product.
 */
export default async function OnboardingWelcomePage() {
  const profile = await getProfile()

  if (profile?.onboarding_completed_at) redirect('/today')

  // Parked part-way through the old, longer flow: they have already said who
  // they are, so resume the optional step they were on -- which offers
  // "Finish later" -- rather than asking again.
  const stage = profile?.onboarding_stage ?? 'welcome'
  if (isEnrichmentStep(stage)) redirect(stepPath(stage))

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
        // UTC and every meeting time is read in the wrong zone. An explicit UTC
        // is still selectable from the list, and once saved it is honoured.
        timezone: profile?.timezone && profile.timezone !== 'UTC' ? profile.timezone : '',
      }}
    />
  )
}
