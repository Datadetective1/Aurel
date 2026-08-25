import { CoachingStep } from '@/components/onboarding/choice-steps'
import { getProfile } from '@/lib/auth'

export const metadata = { title: 'Coaching context', robots: { index: false, follow: false } }

export default async function CoachingPage() {
  const profile = await getProfile()
  return <CoachingStep defaults={profile?.coaching_context ?? []} />
}
