'use client'

import * as React from 'react'
import { DesktopNav, MobileTabBar, MobileTopBar } from './nav'
import { CommandPalette } from './command-palette'

/**
 * App chrome.
 *
 * Client component purely so the command palette's open state can be shared by
 * the desktop rail, the mobile bar and the global keyboard shortcut. All the
 * actual page content stays server-rendered underneath.
 */
export function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string; avatarUrl: string | null; plan: string }
  children: React.ReactNode
}) {
  const [searchOpen, setSearchOpen] = React.useState(false)

  return (
    <div className="flex min-h-dvh">
      <DesktopNav user={user} onOpenSearch={() => setSearchOpen(true)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar onOpenSearch={() => setSearchOpen(true)} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <MobileTabBar />
      </div>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
