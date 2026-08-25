import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/brand/aperture'
import { OnboardingProgress } from '@/components/onboarding/progress'
import { ThemeToggle } from '@/components/theme-provider'
import { requireUser, getProfile } from '@/lib/auth'
import { brand } from '@/lib/brand'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  const profile = await getProfile()

  // Already finished? There is nothing to onboard.
  if (profile?.onboarding_completed_at) redirect('/today')

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="rounded-sm text-ink transition-opacity hover:opacity-70">
            <Wordmark name={brand.name} className="text-base" />
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">
        <OnboardingProgress stage={profile?.onboarding_stage ?? 'welcome'} />
      </div>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-5 pb-20 sm:px-8">
        {children}
      </main>
    </div>
  )
}
