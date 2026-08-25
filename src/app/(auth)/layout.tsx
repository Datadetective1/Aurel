import Link from 'next/link'
import { ApertureField, Wordmark } from '@/components/brand/aperture'
import { ThemeToggle } from '@/components/theme-provider'
import { brand } from '@/lib/brand'

/**
 * Auth shell.
 *
 * Split layout: the form on the left, a quiet brand panel on the right that
 * carries the motif. Auth is the first surface a new user sees after the
 * marketing site, so it has to feel like the same product — a default provider
 * form here would undo the whole first impression.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col">
        <header className="flex items-center justify-between px-6 py-6 sm:px-10">
          <Link href="/" className="rounded-sm text-ink transition-opacity hover:opacity-70">
            <Wordmark name={brand.name} className="text-lg" />
          </Link>
          <ThemeToggle />
        </header>

        <main id="main" className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>

        <footer className="px-6 py-6 sm:px-10">
          <p className="text-xs text-ink-faint">
            By continuing you agree to the{' '}
            <Link href="/terms" className="text-ink-muted underline underline-offset-2 hover:text-ink">
              Terms
            </Link>{' '}
            and{' '}
            <Link
              href="/privacy"
              className="text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </footer>
      </div>

      {/* Brand panel. Hidden below lg — on a phone the form should own the screen. */}
      <aside className="relative hidden overflow-hidden border-l border-line bg-bg-sunken lg:block">
        <ApertureField
          className="absolute -bottom-16 left-1/2 h-[34rem] w-[38rem] -translate-x-1/2 text-ink"
          rings={6}
          accentRing={1}
          intensity={0.8}
        />
        {/* Scrim so the motif never competes with the copy sitting over it. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-bg-sunken via-bg-sunken/85 to-transparent"
        />
        <div className="relative flex h-full flex-col justify-end p-12">
          <blockquote className="max-w-md">
            <p className="font-display text-2xl leading-snug text-ink">
              Important conversations shouldn&rsquo;t start cold.
            </p>
            <p className="mt-5 text-sm leading-relaxed text-ink-secondary">
              {brand.name} keeps a record of the people you work with — what they have asked for,
              what they objected to, and what is still open between you — and turns it into
              preparation for the next conversation that matters.
            </p>
          </blockquote>
        </div>
      </aside>
    </div>
  )
}
