'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarClock,
  Command,
  Compass,
  MessagesSquare,
  Settings,
  Sparkles,
  Sun,
  Users,
} from 'lucide-react'
import { Wordmark } from '@/components/brand/aperture'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { brand } from '@/lib/brand'

/**
 * Application navigation.
 *
 * Desktop: a slim left rail. Mobile: a bottom tab bar with the five things a
 * professional actually opens on a phone — the mobile experience is designed,
 * not a shrunken desktop sidebar.
 */

export const NAV_ITEMS = [
  { href: '/today', label: 'Today', icon: Sun },
  { href: '/people', label: 'People', icon: Users },
  { href: '/meetings', label: 'Meetings', icon: CalendarClock },
  { href: '/atlas', label: 'Atlas', icon: Compass },
  { href: '/coach', label: brand.assistantName, icon: MessagesSquare },
] as const

/** Items that earn a slot in the mobile tab bar. Atlas is desktop-first. */
const MOBILE_ITEMS = NAV_ITEMS.filter((i) => i.href !== '/atlas')

function useIsActive() {
  const pathname = usePathname()
  return React.useCallback(
    (href: string) => pathname === href || pathname.startsWith(`${href}/`),
    [pathname],
  )
}

export function DesktopNav({
  user,
  onOpenSearch,
}: {
  user: { name: string; email: string; avatarUrl: string | null; plan: string }
  onOpenSearch: () => void
}) {
  const isActive = useIsActive()

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-bg-sunken lg:flex">
      <div className="px-5 py-5">
        <Link href="/today" className="rounded-sm text-ink transition-opacity hover:opacity-70">
          <Wordmark name={brand.name} className="text-base" />
        </Link>
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-left text-sm text-ink-faint transition-colors hover:border-line-strong hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <Command className="size-3.5" aria-hidden="true" />
          <span className="flex-1">Search</span>
          <kbd className="rounded border border-line px-1.5 py-0.5 font-sans text-[0.625rem] text-ink-faint">
            {'⌘'}K
          </kbd>
        </button>
      </div>

      <nav aria-label="Main" className="mt-5 flex-1 px-3">
        <ul className="grid gap-0.5">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors',
                  isActive(item.href)
                    ? 'bg-surface text-ink'
                    : 'text-ink-secondary hover:bg-surface/60 hover:text-ink',
                )}
              >
                <item.icon
                  className={cn('size-4', isActive(item.href) ? 'text-accent' : 'text-ink-faint')}
                  aria-hidden="true"
                />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-6 px-3">
          <Button asChild size="sm" className="w-full">
            <Link href="/prepare">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Prepare
            </Link>
          </Button>
        </div>
      </nav>

      <div className="border-t border-line p-3">
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 transition-colors hover:bg-surface/60"
        >
          <Avatar name={user.name} src={user.avatarUrl} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-ink">{user.name}</span>
            <span className="block truncate text-xs text-ink-faint capitalize">
              {user.plan} plan
            </span>
          </span>
          <Settings className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
        </Link>
      </div>
    </aside>
  )
}

export function MobileTopBar({ onOpenSearch }: { onOpenSearch: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur-md lg:hidden">
      <Link href="/today" className="rounded-sm text-ink">
        <Wordmark name={brand.name} className="text-base" />
      </Link>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onOpenSearch} aria-label="Search">
          <Command className="size-4" aria-hidden="true" />
        </Button>
        <Button asChild variant="ghost" size="icon" aria-label="Settings">
          <Link href="/settings">
            <Settings className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </header>
  )
}

export function MobileTabBar() {
  const isActive = useIsActive()

  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-5">
        {MOBILE_ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn(
                // 56px tall: comfortably above the 44px minimum touch target.
                'flex h-14 flex-col items-center justify-center gap-1 text-[0.625rem] transition-colors',
                isActive(item.href) ? 'text-ink' : 'text-ink-faint',
              )}
            >
              <item.icon
                className={cn('size-[1.125rem]', isActive(item.href) && 'text-accent')}
                aria-hidden="true"
              />
              <span className="max-w-full truncate px-1">
                {item.label === brand.assistantName ? 'Ask' : item.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
