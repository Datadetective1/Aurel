import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { ONBOARDING_STEPS, stepPath, type OnboardingStep } from '@/lib/onboarding'

export const metadata = { robots: { index: false, follow: false } }

/**
 * Retired step.
 *
 * Appearance was asked during onboarding, before the user had seen a single
 * screen to have an opinion about. Theme and coaching style both default in the
 * database and both are editable at Settings → Appearance & voice, so the
 * question is now asked where there is something to answer it about.
 *
 * The route stays and redirects rather than 404s: an account parked on this
 * stage, or a bookmark from the old flow, should land wherever the user
 * actually is instead of on a dead end.
 */
export default async function RetiredAppearanceStep() {
  const profile = await getProfile()
  // Read as a plain string: the stored stage may be 'appearance', which is no
  // longer part of OnboardingStep, and stepPath would send them back here.
  // Anyone who reached this step has finished the optional questions, so the
  // assessment is the honest place to resume.
  const stage = profile?.onboarding_stage ?? 'welcome'
  const resume = ONBOARDING_STEPS.includes(stage as OnboardingStep)
    ? (stage as OnboardingStep)
    : 'assessment'

  redirect(stepPath(resume))
}
