'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarClock,
  Command,
  Compass,
  Handshake,
  MessagesSquare,
  Mic,
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
  // The loop the product now closes: prepare, meet, keep the conversation,
  // follow through. Conversations and Open Loops are the two new halves.
  { href: '/conversations', label: 'Conversations', icon: Mic },
  { href: '/loops', label: 'Open Loops', icon: Handshake },
  // "Atlas" alone tells a new user nothing -- the page's own empty state says
  // as much. The page is already titled "Relationship Atlas", so pairing the
  // brand word with the explanatory one here is consistent rather than
  // invented, and the rail has room for it. Atlas is desktop-only, so the
  // narrow tab bar never has to carry the longer label.
  { href: '/atlas', label: 'Relationship Atlas', icon: Compass },
  { href: '/coach', label: brand.assistantName, icon: MessagesSquare },
] as const

/**
 * The phone's five places, the same five as the native app: what is happening
 * today, the people, capturing a conversation, the map of who knows whom, and
 * asking. Capture sits in the middle because it is what you do during and
 * just after a meeting.
 *
 * Meetings, Conversations and Open Loops are one tap from Today (its shortcut
 * row and its sections). Prepare stays in the header, as a quiet icon rather
 * than a second primary button competing with the tab bar.
 */
type NavHref = (typeof NAV_ITEMS)[number]['href']
const MOBILE_SLOTS: Partial<
  Record<NavHref, { href?: string; label: string; match?: string[]; primary?: boolean }>
> = {
  '/today': { label: 'Today', match: ['/today', '/meetings', '/loops'] },
  '/people': { label: 'People', match: ['/people', '/prepare'] },
  '/conversations': {
    href: '/conversations/new',
    label: 'Capture',
    match: ['/conversations'],
    primary: true,
  },
  '/atlas': { label: 'Atlas' },
  '/coach': { label: 'Ask' },
}
// Still a filtered view of the one definition, so the two cannot drift.
const MOBILE_ITEMS = NAV_ITEMS.filter((i) => i.href in MOBILE_SLOTS).map((i) => {
  const slot = MOBILE_SLOTS[i.href]!
  return {
    icon: i.icon,
    href: slot.href ?? i.href,
    label: slot.label,
    match: slot.match ?? [i.href],
    primary: slot.primary ?? false,
  }
})

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
    <aside className="border-line bg-bg-sunken sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r lg:flex">
      <div className="px-5 py-5">
        <Link href="/today" className="text-ink rounded-sm transition-opacity hover:opacity-70">
          <Wordmark name={brand.name} className="text-base" />
        </Link>
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={onOpenSearch}
          className="border-line bg-surface text-ink-faint hover:border-line-strong hover:text-ink-muted flex w-full items-center gap-2.5 rounded-[var(--radius-md)] border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <Command className="size-3.5" aria-hidden="true" />
          <span className="flex-1">Search</span>
          <kbd className="border-line text-ink-faint rounded border px-1.5 py-0.5 font-sans text-[0.625rem]">
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

      <div className="border-line border-t p-3">
        <Link
          href="/settings"
          className="hover:bg-surface/60 flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 transition-colors"
        >
          <Avatar name={user.name} src={user.avatarUrl} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="text-ink block truncate text-sm">{user.name}</span>
            <span className="text-ink-faint block truncate text-xs capitalize">
              {user.plan} plan
            </span>
          </span>
          <Settings className="text-ink-faint size-3.5 shrink-0" aria-hidden="true" />
        </Link>
      </div>
    </aside>
  )
}

export function MobileTopBar({ onOpenSearch }: { onOpenSearch: () => void }) {
  return (
    <header className="border-line bg-bg/90 sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 backdrop-blur-md lg:hidden">
      <Link href="/today" className="text-ink rounded-sm">
        <Wordmark name={brand.name} className="text-base" />
      </Link>
      <div className="flex items-center gap-1">
        {/* Prepare, on the phone: opened in the ten minutes before a
            conversation, so it stays one tap away on every screen -- as a
            quiet icon, so it no longer competes with the tab bar. */}
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="text-accent size-11"
          aria-label="Prepare for a conversation"
        >
          <Link href="/prepare">
            <Sparkles className="size-[1.125rem]" aria-hidden="true" />
          </Link>
        </Button>
        {/* size-11, not the size-10 icon variant. Its comment claimed 44px and
            it was 40. */}
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          onClick={onOpenSearch}
          aria-label="Search"
        >
          <Command className="size-4" aria-hidden="true" />
        </Button>
        <Button asChild variant="ghost" size="icon" className="size-11" aria-label="Settings">
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
      className="border-line bg-bg/95 sticky bottom-0 z-30 border-t backdrop-blur-md lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Columns derived from the list, not hard-coded.

          This was `grid-cols-5` while MOBILE_ITEMS held four -- Atlas is
          filtered out -- so the tabs sat in the left four fifths with a dead
          column on the right, and every future change to the nav would have
          silently re-introduced the same drift. `grid-flow-col auto-cols-fr`
          gives each item an equal share of the row whatever the count. */}
      <ul className="grid auto-cols-fr grid-flow-col">
        {MOBILE_ITEMS.map((item) => {
          const active = item.match.some((m) => isActive(m))
          const primary = item.primary
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  // 56px tall: comfortably above the 44px minimum touch target.
                  'flex h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] transition-colors',
                  active ? 'text-ink' : 'text-ink-muted',
                )}
              >
                {primary ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-7 w-11 items-center justify-center rounded-full',
                      active ? 'bg-surface-inverse text-ink-inverse' : 'bg-accent-wash text-accent',
                    )}
                  >
                    <item.icon className="size-4" />
                  </span>
                ) : (
                  <item.icon
                    className={cn('size-[1.125rem]', active && 'text-accent')}
                    aria-hidden="true"
                  />
                )}
                <span className="max-w-full truncate px-1">{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
