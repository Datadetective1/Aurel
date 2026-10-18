import type { Metadata } from 'next'
import Link from 'next/link'
import { Wordmark } from '@/components/brand/aperture'
import { ThemeToggle } from '@/components/theme-provider'
import { requireUser } from '@/lib/auth'
import { brand } from '@/lib/brand'

/**
 * Belt and braces: the signed-in surface is never indexable.
 *
 * Anonymous requests here are redirected by middleware and robots.txt asks
 * crawlers not to try, so this directive should never be the thing that saves
 * us. It exists because the root layout declares index: true and every route
 * beneath this one inherits it — and the cost of being wrong about that, on
 * pages containing notes about named colleagues, is not recoverable.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

/**
 * No blanket redirect for finished accounts any more. The identity step sends
 * them to Today itself; the tailoring steps that live under this layout are
 * reached *after* onboarding, from Today and Settings, so they have to render
 * for exactly those accounts. Progress is drawn by the steps that have any.
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireUser()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-line border-b">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="text-ink rounded-sm transition-opacity hover:opacity-70">
            <Wordmark name={brand.name} className="text-base" />
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-5 pt-6 pb-20 sm:px-8">
        {children}
      </main>
    </div>
  )
}
