import { AppearanceStep } from '@/components/onboarding/choice-steps'
import { getProfile } from '@/lib/auth'

export const metadata = { title: 'Appearance', robots: { index: false, follow: false } }

export default async function AppearancePage() {
  const profile = await getProfile()
  return (
    <AppearanceStep
      defaultTheme={profile?.theme ?? 'system'}
      defaultStyle={profile?.coaching_style ?? 'balanced'}
    />
  )
}
