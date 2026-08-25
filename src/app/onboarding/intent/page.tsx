import { IntentStep } from '@/components/onboarding/choice-steps'
import { getProfile } from '@/lib/auth'

export const metadata = { title: 'What brought you here', robots: { index: false, follow: false } }

export default async function IntentPage() {
  const profile = await getProfile()
  return <IntentStep defaults={profile?.intents ?? []} />
}
