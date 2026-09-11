'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import * as Dialog from '@radix-ui/react-dialog'
import {
  CalendarClock,
  FileText,
  Handshake,
  Loader2,
  MessagesSquare,
  Mic,
  Scale,
  Search,
  Sparkles,
  Building2,
  UserPlus,
  UserRound,
  StickyNote,
} from 'lucide-react'
import { searchEverything, type SearchResult } from '@/app/(app)/search-action'
import { brand } from '@/lib/brand'
import { Avatar } from '@/components/ui/avatar'

/**
 * Global command palette (Cmd/Ctrl + K).
 *
 * Two modes in one surface: quick actions when the query is empty, and live
 * search across people, meetings, interactions, commitments, notes and
 * confirmed observations once the user types. Search runs server-side through
 * an RLS-scoped RPC, so results can only ever contain the caller's own records.
 */

const ACTIONS = [
  { id: 'prepare', label: 'Prepare for a meeting', href: '/prepare', icon: Sparkles },
  { id: 'add-person', label: 'Add a person', href: '/people/new', icon: UserPlus },
  { id: 'new-meeting', label: 'Create a meeting', href: '/meetings/new', icon: CalendarClock },
  { id: 'conversation', label: 'Keep a conversation', href: '/conversations/new', icon: Mic },
  { id: 'loops', label: 'Open loops', href: '/loops', icon: Handshake },
  { id: 'coach', label: `Ask ${brand.name}`, href: '/coach', icon: MessagesSquare },
  { id: 'people', label: 'Browse people', href: '/people', icon: UserRound },
] as const

const ENTITY_META: Record<
  SearchResult['entity'],
  { icon: typeof UserRound; group: string; href: (r: SearchResult) => string }
> = {
  person: { icon: UserRound, group: 'People', href: (r) => `/people/${r.id}` },
  organization: { icon: Building2, group: 'Organisations', href: () => '/atlas' },
  meeting: { icon: CalendarClock, group: 'Meetings', href: (r) => `/meetings/${r.id}` },
  interaction: {
    icon: Mic,
    group: 'Conversations',
    href: (r) => `/conversations/${r.id}`,
  },
  commitment: {
    icon: Handshake,
    group: 'Open loops',
    href: () => '/loops',
  },
  decision: {
    icon: Scale,
    group: 'Decisions',
    href: (r) => (r.person_id ? `/people/${r.person_id}` : '/conversations'),
  },
  note: {
    icon: StickyNote,
    group: 'Notes',
    href: (r) => (r.person_id ? `/people/${r.person_id}` : '/today'),
  },
  observation: {
    icon: Sparkles,
    group: 'What you have learned',
    href: (r) => (r.person_id ? `/people/${r.person_id}` : '/people'),
  },
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [pending, startTransition] = React.useTransition()

  // Global shortcut.
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  // Debounced search. 180ms is short enough to feel live, long enough that
  // typing a name is one query rather than six.
  React.useEffect(() => {
    const trimmed = query.trim()
    // Too short to search: nothing to schedule. Stale results are hidden by
    // `visibleResults` below rather than cleared through state, which would be
    // a second render pass on every keystroke.
    if (trimmed.length < 2) return
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const found = await searchEverything(trimmed)
        setResults(found)
      })
    }, 180)
    return () => window.clearTimeout(timer)
  }, [query])

  const go = (href: string) => {
    onOpenChange(false)
    setQuery('')
    router.push(href)
  }

  // Results only apply to a query long enough to have produced them.
  const visibleResults = query.trim().length < 2 ? [] : results

  const grouped = React.useMemo(() => {
    const map = new Map<string, SearchResult[]>()
    for (const result of visibleResults) {
      const group = ENTITY_META[result.entity].group
      map.set(group, [...(map.get(group) ?? []), result])
    }
    return [...map.entries()]
  }, [visibleResults])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className="border-line bg-surface elevate fixed top-[12vh] left-1/2 z-50 w-[min(38rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-[var(--radius-lg)] border"
          aria-label="Search and commands"
        >
          <Dialog.Title className="sr-only">Search {brand.name}</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search your people, meetings, interactions and commitments, or run a quick action.
          </Dialog.Description>

          <Command shouldFilter={false} loop>
            <div className="border-line flex items-center gap-3 border-b px-4">
              {pending ? (
                <Loader2
                  className="text-ink-faint size-4 shrink-0 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Search className="text-ink-faint size-4 shrink-0" aria-hidden="true" />
              )}
              <Command.Input
                value={query}
                onValueChange={setQuery}
                autoFocus
                placeholder="Search people, meetings, commitments…"
                className="text-ink placeholder:text-ink-faint h-12 w-full bg-transparent text-sm focus:outline-none"
              />
            </div>

            <Command.List className="max-h-[min(24rem,60vh)] overflow-y-auto p-2">
              <Command.Empty className="text-ink-muted px-3 py-8 text-center text-sm">
                {query.trim().length < 2
                  ? 'Type to search, or pick an action below.'
                  : pending
                    ? 'Searching…'
                    : `Nothing matches “${query.trim()}”.`}
              </Command.Empty>

              {query.trim().length < 2 ? (
                <Command.Group
                  heading="Actions"
                  className="[&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2"
                >
                  {ACTIONS.map((action) => (
                    <Item key={action.id} onSelect={() => go(action.href)}>
                      <action.icon className="text-ink-faint size-4" aria-hidden="true" />
                      {action.label}
                    </Item>
                  ))}
                </Command.Group>
              ) : null}

              {grouped.map(([group, items]) => (
                <Command.Group
                  key={group}
                  heading={group}
                  className="[&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2"
                >
                  {items.map((result) => {
                    const meta = ENTITY_META[result.entity]
                    return (
                      <Item
                        key={`${result.entity}-${result.id}`}
                        onSelect={() => go(meta.href(result))}
                      >
                        {result.entity === 'person' ? (
                          <Avatar name={result.title} src={result.image ?? null} size="sm" />
                        ) : (
                          <meta.icon
                            className="text-ink-faint size-4 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate">{result.title}</span>
                        {result.subtitle ? (
                          <span className="text-ink-faint shrink-0 truncate text-xs">
                            {result.subtitle}
                          </span>
                        ) : null}
                      </Item>
                    )
                  })}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Item({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="text-ink-secondary data-[selected=true]:bg-bg-sunken data-[selected=true]:text-ink flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm"
    >
      {children}
    </Command.Item>
  )
}
