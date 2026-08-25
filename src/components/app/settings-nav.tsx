'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CreditCard, Database, Palette, Sparkles, Telescope, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { brand } from '@/lib/brand'

/**
 * Settings navigation.
 *
 * A sidebar on desktop, a horizontally scrolling row on mobile. Data controls
 * sit last and are visually separated, because that section contains the only
 * irreversible action in the product.
 */
interface Section {
  href: string
  label: string
  icon: typeof UserRound
  /** Matches only the exact path, so the index route is not always active. */
  exact?: boolean
  /** Visually separated: this section holds the only irreversible action. */
  separated?: boolean
}

const SECTIONS: Section[] = [
  { href: '/settings', label: 'Profile', icon: UserRound, exact: true },
  { href: '/settings/appearance', label: 'Appearance & voice', icon: Palette },
  { href: '/settings/profile', label: brand.assessmentName, icon: Sparkles },
  { href: '/settings/capabilities', label: 'Capabilities', icon: Telescope },
  { href: '/settings/billing', label: 'Plan', icon: CreditCard },
  { href: '/settings/data', label: 'Privacy & data', icon: Database, separated: true },
]

export function SettingsNav() {
  const pathname = usePathname()

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

  return (
    // min-w-0 is load-bearing. A grid item defaults to min-width:auto, so the
    // scrolling row below would size to its full content width, widen the
    // column, and scroll the whole page sideways instead of scrolling itself.
    <nav
      aria-label="Settings sections"
      className="min-w-0 lg:sticky lg:top-8 lg:self-start"
    >
      <ul
        className={cn(
          // Mobile: a scrollable row. Desktop: a stacked rail.
          '-mx-1 flex gap-1 overflow-x-auto px-1 pb-1',
          'scrollbar-none [scroll-padding-inline:0.25rem]',
          'lg:mx-0 lg:grid lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0',
        )}
      >
        {SECTIONS.map((section) => (
          <li key={section.href} className={cn(section.separated && 'lg:mt-4 lg:border-t lg:border-line lg:pt-4')}>
            <Link
              href={section.href}
              aria-current={isActive(section.href, section.exact) ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm whitespace-nowrap transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                isActive(section.href, section.exact)
                  ? 'bg-surface text-ink'
                  : 'text-ink-secondary hover:bg-surface/60 hover:text-ink',
              )}
            >
              <section.icon
                className={cn(
                  'size-4 shrink-0',
                  isActive(section.href, section.exact) ? 'text-accent' : 'text-ink-faint',
                )}
                aria-hidden="true"
              />
              {section.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
