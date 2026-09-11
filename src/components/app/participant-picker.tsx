'use client'

import * as React from 'react'
import { Check, Loader2, Plus, UserPlus, X } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { rankPeople, type KnownPerson } from '@/lib/conversations/speakers'
import { cn } from '@/lib/utils'

/**
 * PARTICIPANT PICKER
 * =============================================================================
 * Type a name. Existing people who match are offered first -- an exact or
 * probable match at the top, so the same person is not created twice -- and
 * beneath them, always, "+ Add <name> as a new person". The name is all a new
 * person needs; everything else can be filled in later on their page.
 *
 * The picker decides nothing itself. It hands the caller either an existing
 * person or a new name, and the caller attaches or creates.
 * =============================================================================
 */

export interface PickablePerson extends KnownPerson {
  src?: string | null
  subtitle?: string | null
}

export function ParticipantPicker({
  people,
  excludeIds = [],
  initialQuery = '',
  onPickExisting,
  onCreate,
  onCancel,
  pending = false,
  autoFocus = true,
  className,
  placeholder = 'Who was there?',
}: {
  people: PickablePerson[]
  excludeIds?: string[]
  initialQuery?: string
  onPickExisting: (person: PickablePerson) => void
  onCreate: (name: string) => void
  onCancel?: () => void
  pending?: boolean
  autoFocus?: boolean
  className?: string
  placeholder?: string
}) {
  const [query, setQuery] = React.useState(initialQuery)
  const trimmed = query.trim()
  const excluded = new Set(excludeIds)
  const candidates = people.filter((p) => !excluded.has(p.id))
  const ranked = rankPeople(trimmed, candidates)
  const exact = ranked.find((r) => r.match === 'exact')
  const canCreate = trimmed.length >= 2 && !exact

  const listId = React.useId()

  return (
    <div className={cn('border-line bg-surface rounded-[var(--radius-md)] border p-3', className)}>
      <div className="flex items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={placeholder}
          aria-label="Person's name"
          aria-controls={listId}
          autoFocus={autoFocus}
          maxLength={160}
          className="h-9 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (exact) onPickExisting(exact.person)
              else if (canCreate) onCreate(trimmed)
            }
            if (e.key === 'Escape') onCancel?.()
          }}
        />
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-9"
            aria-label="Cancel"
            onClick={onCancel}
          >
            <X className="size-3.5" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <ul id={listId} className="mt-2 grid gap-1" aria-label="People">
        {ranked.map(({ person, match }) => (
          <li key={person.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => onPickExisting(person)}
              className="text-ink hover:bg-bg-sunken flex min-h-10 w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <Avatar name={person.fullName} src={person.src} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{person.preferredName || person.fullName}</span>
                {person.subtitle ? (
                  <span className="text-ink-muted block truncate text-[0.6875rem]">
                    {person.subtitle}
                  </span>
                ) : null}
              </span>
              {match === 'exact' || match === 'probable' ? (
                <span className="text-accent text-[0.6875rem]">
                  {match === 'exact' ? 'Same name' : 'Probably them'}
                </span>
              ) : null}
            </button>
          </li>
        ))}

        {canCreate ? (
          <li>
            <button
              type="button"
              disabled={pending}
              onClick={() => onCreate(trimmed)}
              className="border-line-strong text-ink hover:bg-accent-wash flex min-h-10 w-full items-center gap-2.5 rounded-[var(--radius-sm)] border border-dashed px-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <span className="bg-accent-wash text-accent inline-flex size-6 shrink-0 items-center justify-center rounded-full">
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Plus className="size-3.5" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                Add <span className="font-medium">{trimmed}</span> as a new person
                {ranked.some((r) => r.match === 'probable') ? (
                  <span className="text-ink-muted block text-[0.6875rem]">
                    Only if the person above is somebody else.
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ) : null}

        {ranked.length === 0 && !canCreate ? (
          <li className="text-ink-muted px-2 py-2 text-xs">
            {candidates.length === 0 ? 'Type a name to add someone.' : 'Type a name.'}
          </li>
        ) : null}
      </ul>
    </div>
  )
}

/** A face with a name and an optional remove. Used wherever people are listed as chips. */
export function PersonChip({
  person,
  onRemove,
  removing = false,
  pressed,
  onClick,
  className,
}: {
  person: PickablePerson
  onRemove?: () => void
  removing?: boolean
  /** When the chip is a toggle. */
  pressed?: boolean
  onClick?: () => void
  className?: string
}) {
  const name = person.preferredName || person.fullName
  const inner = (
    <>
      <Avatar name={person.fullName} src={person.src} size="sm" />
      <span className="min-w-0">
        <span className="block leading-tight">{name}</span>
        {person.subtitle ? (
          <span className="text-ink-muted block truncate text-[0.6875rem] leading-tight">
            {person.subtitle}
          </span>
        ) : null}
      </span>
    </>
  )
  return (
    <span
      className={cn(
        'inline-flex min-h-11 items-center gap-2.5 rounded-full border py-1 pr-2 pl-1 text-sm',
        pressed === undefined
          ? 'border-line bg-surface text-ink'
          : pressed
            ? 'border-accent bg-accent-wash text-ink'
            : 'border-line bg-surface text-ink-secondary',
        className,
      )}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={pressed}
          className="flex items-center gap-2.5 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {inner}
        </button>
      ) : (
        <span className="flex items-center gap-2.5 pr-1">{inner}</span>
      )}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          aria-label={`Remove ${name}`}
          className="text-ink-faint hover:bg-bg-sunken hover:text-ink ml-1 inline-flex size-7 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {removing ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <X className="size-3.5" aria-hidden="true" />
          )}
        </button>
      ) : null}
    </span>
  )
}

/** "+ Add someone" trigger that opens the picker. */
export function AddSomeoneButton({
  onClick,
  label = 'Add someone',
  className,
}: {
  onClick: () => void
  label?: string
  className?: string
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('min-h-10', className)}
      onClick={onClick}
    >
      <UserPlus className="size-3.5" aria-hidden="true" />
      {label}
    </Button>
  )
}

/** Small confirmation used after an add. */
export function AddedNote({ text }: { text: string }) {
  return (
    <span role="status" className="text-positive inline-flex items-center gap-1.5 text-xs">
      <Check className="size-3.5" aria-hidden="true" />
      {text}
    </span>
  )
}
