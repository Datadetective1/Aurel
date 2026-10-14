import Link from 'next/link'
import { CalendarClock, Handshake, MessagesSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * On a phone the tab bar holds five places -- Today, People, Capture, Atlas,
 * Ask. Meetings, conversations and open loops stay one tap away from Today.
 */
const SHORTCUTS = [
  { href: '/meetings', label: 'Meetings', icon: CalendarClock },
  { href: '/conversations', label: 'Conversations', icon: MessagesSquare },
  { href: '/loops', label: 'Open loops', icon: Handshake },
]

export function TodayShortcuts({ className }: { className?: string }) {
  return (
    <nav aria-label="Shortcuts" className={cn('flex gap-2 overflow-x-auto lg:hidden', className)}>
      {SHORTCUTS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="border-line bg-surface text-ink-secondary hover:text-ink inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  )
}
