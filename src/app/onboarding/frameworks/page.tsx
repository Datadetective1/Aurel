import { FrameworksStep } from '@/components/onboarding/choice-steps'
import { getProfile } from '@/lib/auth'

export const metadata = { title: 'Prior assessments', robots: { index: false, follow: false } }

export default async function FrameworksPage() {
  const profile = await getProfile()
  const known = (profile?.known_frameworks ?? {}) as Record<string, { result?: string }>
  return <FrameworksStep defaults={known} />
}
