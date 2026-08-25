import Link from 'next/link'
import { ApertureMark, Wordmark } from '@/components/brand/aperture'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/ui/primitives'
import { ThemeToggle } from '@/components/theme-provider'
import { brand } from '@/lib/brand'

const NAV = [
  { href: '/#how', label: 'How it works' },
  { href: '/#memory', label: 'Relationship memory' },
  { href: '/#trust', label: 'Evidence' },
  { href: '/pricing', label: 'Pricing' },
]

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 backdrop-blur-md">
        <Container size="wide">
          <div className="flex h-16 items-center justify-between gap-6">
            <Link
              href="/"
              className="rounded-sm text-ink transition-opacity hover:opacity-70"
              aria-label={`${brand.name} home`}
            >
              <Wordmark name={brand.name} className="text-lg" />
            </Link>

            <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-sm text-sm text-ink-secondary transition-colors hover:text-ink"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-2 sm:gap-3">
              <ThemeToggle className="hidden sm:inline-flex" />
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/sign-up">Start free</Link>
              </Button>
            </div>
          </div>
        </Container>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-line bg-bg-sunken">
        <Container size="wide">
          <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Wordmark name={brand.name} className="text-base text-ink" />
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-muted">
                {brand.description}
              </p>
            </div>

            <div>
              <p className="label">Product</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="text-ink-secondary hover:text-ink">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="label">Company</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <Link href="/privacy" className="text-ink-secondary hover:text-ink">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="text-ink-secondary hover:text-ink">
                    Terms
                  </Link>
                </li>
                <li>
                  <a
                    href={`mailto:${brand.email.support}`}
                    className="text-ink-secondary hover:text-ink"
                  >
                    {brand.email.support}
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-line py-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-ink-faint">
              &copy; {new Date().getFullYear()} {brand.legalEntity}. All rights reserved.
            </p>
            <p className="flex items-center gap-2 text-xs text-ink-faint">
              <ApertureMark className="size-3.5" />
              {brand.tagline}
            </p>
          </div>
        </Container>
      </footer>
    </div>
  )
}
