import Link from 'next/link'
import { ApertureMark, Wordmark } from '@/components/brand/aperture'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/ui/primitives'
import { ThemeToggle } from '@/components/theme-provider'
import { CompactHeader } from '@/components/marketing/compact-header'
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
      {/* Sticky from lg. Below it the header scrolls away with the page and
          CompactHeader takes over, so a phone does not give 64px of every
          screen to navigation. */}
      <header className="border-line/70 bg-bg/85 z-40 border-b backdrop-blur-md lg:sticky lg:top-0">
        <Container size="wide">
          <div className="flex h-16 items-center justify-between gap-6">
            <Link
              href="/"
              className="text-ink inline-flex min-h-11 items-center rounded-sm transition-opacity hover:opacity-70"
              aria-label={`${brand.name} home`}
            >
              <Wordmark name={brand.name} className="text-lg" />
            </Link>

            {/* lg, not md.

                At exactly 768px the five section links appeared alongside the
                theme toggle and both auth actions, and the row overflowed by
                36px -- the whole page scrolled sideways. This predates the
                sign-in change; production shows the same 804px scrollWidth.
                Holding the links back until 1024px is the honest fix: the row
                simply does not fit before then. */}
            <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-ink-secondary hover:text-ink inline-flex min-h-11 items-center rounded-sm text-sm transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Sign in is visible at every width.

                It used to be `hidden sm:inline-flex`, which meant that below
                640px the only control on the page was "Start free" -- and the
                section links were already gone at 768px with no menu behind
                them. A returning user who opened the site on their phone had
                no way back into their own account except typing the URL. They
                would not report that; they would just not come back.

                A menu was the other option and is the wrong one here: it would
                hide the single most important returning-user action behind a
                tap to solve a problem that fits on the row. The marketing
                anchors stay desktop-only because someone signing in does not
                need them. */}
            <div className="flex items-center gap-1 sm:gap-3">
              {/* 44px targets: the toggle's own buttons are sized for dense
                  app chrome, so the marketing header enlarges them here. */}
              <ThemeToggle className="hidden sm:inline-flex [&_button]:size-11" />
              <Button asChild variant="ghost" size="sm" className="h-11 px-3">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="h-11 px-4">
                <Link href="/sign-up">Start free</Link>
              </Button>
            </div>
          </div>
        </Container>
      </header>

      <CompactHeader />

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-line bg-bg-sunken border-t">
        <Container size="wide">
          {/* Below sm the footer is one wrapped row of links, not three
              stacked columns: it is the end of the page, not another section. */}
          <div className="py-6 sm:hidden">
            <Wordmark name={brand.name} className="text-ink text-base" />
            <ul className="mt-2 flex flex-wrap gap-x-5 text-sm">
              {[
                ...NAV,
                { href: '/privacy', label: 'Privacy' },
                { href: '/terms', label: 'Terms' },
              ].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-ink-secondary hover:text-ink inline-flex min-h-11 min-w-11 items-center"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href={`mailto:${brand.email.support}`}
                  className="text-ink-secondary hover:text-ink inline-flex min-h-11 min-w-11 items-center"
                >
                  {brand.email.support}
                </a>
              </li>
            </ul>
          </div>

          <div className="hidden gap-10 py-14 sm:grid sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Wordmark name={brand.name} className="text-ink text-base" />
              <p className="text-ink-muted mt-3 max-w-xs text-sm leading-relaxed">
                {brand.description}
              </p>
            </div>

            <div>
              <p className="label">Product</p>
              <ul className="mt-3 text-sm">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-ink-secondary hover:text-ink inline-flex min-h-11 min-w-11 items-center"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="label">Company</p>
              <ul className="mt-3 text-sm">
                <li>
                  <Link
                    href="/privacy"
                    className="text-ink-secondary hover:text-ink inline-flex min-h-11 min-w-11 items-center"
                  >
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms"
                    className="text-ink-secondary hover:text-ink inline-flex min-h-11 min-w-11 items-center"
                  >
                    Terms
                  </Link>
                </li>
                <li>
                  <a
                    href={`mailto:${brand.email.support}`}
                    className="text-ink-secondary hover:text-ink inline-flex min-h-11 min-w-11 items-center"
                  >
                    {brand.email.support}
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-line flex flex-col gap-2 border-t py-4 sm:flex-row sm:items-center sm:justify-between sm:py-6">
            <p className="text-ink-faint text-xs">&copy; 2026 {brand.name}. All rights reserved.</p>
            <p className="text-ink-faint hidden items-center gap-2 text-xs sm:flex">
              <ApertureMark className="size-3.5" />
              {brand.tagline}
            </p>
          </div>
        </Container>
      </footer>
    </div>
  )
}
