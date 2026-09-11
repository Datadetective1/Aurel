'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft, CircleAlert, Sparkles } from 'lucide-react'
import {
  addConversationParticipant,
  createAndAttachParticipant,
  removeConversationParticipant,
} from '@/app/(app)/conversations/actions'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import { Eyebrow } from '@/components/ui/primitives'
import type { PersonMatch } from '@/lib/conversations/speakers'
import {
  AddSomeoneButton,
  ParticipantPicker,
  PersonChip,
  type PickablePerson,
} from './participant-picker'
import { cn } from '@/lib/utils'

/**
 * WHO WAS IN THE CONVERSATION
 * =============================================================================
 * The participant strip on a conversation page: faces with names, a remove on
 * each, "Add someone" that offers existing people first and a new person
 * always, and -- when the transcript names somebody who is not in the room --
 * a suggestion to add or link them.
 *
 * Removing somebody who has loops or decisions on this conversation asks
 * where those should go, because they were extracted from real words and
 * belong to whoever actually said them.
 * =============================================================================
 */

export interface SpeakerSuggestion {
  label: string
  lines: number
  match: PersonMatch
}

export function ConversationParticipants({
  interactionId,
  participants,
  people,
  suggestions,
  className,
}: {
  interactionId: string
  participants: PickablePerson[]
  /** Everyone on record, for the picker and for linking a speaker. */
  people: PickablePerson[]
  suggestions: SpeakerSuggestion[]
  className?: string
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [removing, setRemoving] = React.useState<PickablePerson | null>(null)
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => new Set())

  const participantIds = participants.map((p) => p.id)

  const run = async (key: string, work: () => Promise<{ error?: string; message?: string }>) => {
    setPending(key)
    setError(null)
    const result = await work()
    setPending(null)
    if (result.error) setError(result.error)
    else {
      setOpen(false)
      router.refresh()
    }
  }

  const attach = (person: PickablePerson) =>
    run(`attach:${person.id}`, () => addConversationParticipant(interactionId, person.id))
  const create = (name: string) =>
    run(`create:${name}`, () => createAndAttachParticipant(interactionId, name))

  const visibleSuggestions = suggestions.filter((s) => !dismissed.has(s.label))

  return (
    <div className={cn('grid gap-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {participants.map((p) => (
          <PersonChip
            key={p.id}
            person={p}
            removing={pending === `remove:${p.id}`}
            onRemove={() => setRemoving(p)}
            className="pl-1"
          />
        ))}
        {participants.length === 0 ? (
          <span className="text-ink-muted text-sm">Nobody attached yet.</span>
        ) : null}
        {!open ? <AddSomeoneButton onClick={() => setOpen(true)} /> : null}
      </div>

      {open ? (
        <ParticipantPicker
          people={people}
          excludeIds={participantIds}
          onPickExisting={attach}
          onCreate={create}
          onCancel={() => setOpen(false)}
          pending={pending !== null}
          className="max-w-md"
        />
      ) : null}

      {/* People the words name who are not in the room. Nothing is created
          until a button is pressed. */}
      {visibleSuggestions.length > 0 ? (
        <div className="border-accent/25 bg-accent-wash rounded-[var(--radius-md)] border p-4">
          <Eyebrow className="text-accent">
            <Sparkles className="mr-1.5 inline size-3" aria-hidden="true" />
            Also in this conversation
          </Eyebrow>
          <ul className="mt-3 grid gap-3">
            {visibleSuggestions.map((s) => (
              <SuggestionRow
                key={s.label}
                suggestion={s}
                people={people.filter((p) => !participantIds.includes(p.id))}
                pending={pending}
                onLink={(person) => attach(person)}
                onCreate={() => create(s.label)}
                onDismiss={() => setDismissed((prev) => new Set(prev).add(s.label))}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {removing ? (
        <RemoveDialog
          person={removing}
          others={[
            ...participants.filter((p) => p.id !== removing.id),
            ...people.filter((p) => !participantIds.includes(p.id)),
          ]}
          pending={pending === `remove:${removing.id}`}
          onCancel={() => setRemoving(null)}
          onConfirm={(moveTo, newName) => {
            const who = removing
            setRemoving(null)
            void run(`remove:${who.id}`, () =>
              removeConversationParticipant(interactionId, who.id, {
                moveToPersonId: moveTo,
                moveToNewName: newName,
              }),
            )
          }}
        />
      ) : null}

      {error ? (
        <p role="alert" className="text-critical flex items-center gap-1.5 text-xs">
          <CircleAlert className="size-3.5" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  )
}

function SuggestionRow({
  suggestion,
  people,
  pending,
  onLink,
  onCreate,
  onDismiss,
}: {
  suggestion: SpeakerSuggestion
  people: PickablePerson[]
  pending: string | null
  onLink: (person: PickablePerson) => void
  onCreate: () => void
  onDismiss: () => void
}) {
  const matched = suggestion.match
  const probable =
    matched.kind === 'none' ? null : (people.find((p) => p.id === matched.person.id) ?? null)
  const [linkTo, setLinkTo] = React.useState<string>(probable?.id ?? '')
  const busy = pending !== null

  return (
    <li className="grid gap-2">
      <p className="text-ink text-sm">
        <span className="font-medium">{suggestion.label}</span> appears in this conversation
        <span className="text-ink-muted">
          {' '}
          ({suggestion.lines} {suggestion.lines === 1 ? 'line' : 'lines'})
        </span>
        . Add or link this person?
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {probable ? (
          <Button
            type="button"
            size="sm"
            className="min-h-10"
            disabled={busy}
            onClick={() => onLink(probable)}
          >
            <ArrowRightLeft className="size-3.5" aria-hidden="true" />
            This is {probable.preferredName || probable.fullName}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={probable ? 'secondary' : 'primary'}
          className="min-h-10"
          disabled={busy}
          onClick={onCreate}
        >
          Add {suggestion.label} as a new person
        </Button>
        {people.length > 0 ? (
          <span className="text-ink-muted inline-flex items-center gap-1.5 text-xs">
            or link to
            <Select
              value={linkTo}
              onChange={(e) => setLinkTo(e.currentTarget.value)}
              aria-label={`Link ${suggestion.label} to an existing person`}
              className="h-9 w-auto text-xs"
            >
              <option value="">someone on record…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.preferredName || p.fullName}
                </option>
              ))}
            </Select>
            {linkTo && linkTo !== probable?.id ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  const person = people.find((p) => p.id === linkTo)
                  if (person) onLink(person)
                }}
              >
                Link
              </Button>
            ) : null}
          </span>
        ) : null}
        <Button type="button" size="sm" variant="quiet" disabled={busy} onClick={onDismiss}>
          Not a person
        </Button>
      </div>
      {probable && suggestion.match.kind === 'probable' ? (
        <p className="text-ink-muted text-xs">
          {suggestion.match.reason}. Only add a new person if that is somebody else.
        </p>
      ) : null}
    </li>
  )
}

function RemoveDialog({
  person,
  others,
  pending,
  onCancel,
  onConfirm,
}: {
  person: PickablePerson
  others: PickablePerson[]
  pending: boolean
  onCancel: () => void
  onConfirm: (moveToPersonId: string | null, moveToNewName: string | null) => void
}) {
  const [choice, setChoice] = React.useState<string>('unfile')
  const [newName, setNewName] = React.useState('')
  const name = person.preferredName || person.fullName

  return (
    <div className="border-line bg-bg-sunken rounded-[var(--radius-md)] border p-4">
      <p className="text-ink text-sm">
        Remove <span className="font-medium">{name}</span> from this conversation?
      </p>
      <p className="text-ink-muted mt-1 text-xs leading-relaxed">
        Anything this conversation filed under {name.split(' ')[0]} — promises, decisions, suggested
        memory — can move to the person who was actually there.
      </p>
      <div className="text-ink-secondary mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span>Move it to</span>
        <Select
          value={choice}
          onChange={(e) => setChoice(e.currentTarget.value)}
          aria-label="Move to"
          className="h-9 w-auto text-xs"
        >
          <option value="unfile">nobody for now</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.preferredName || p.fullName}
            </option>
          ))}
          <option value="new">a new person…</option>
        </Select>
        {choice === 'new' ? (
          <input
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            placeholder="Their name"
            aria-label="New person's name"
            maxLength={160}
            className="border-line-strong bg-surface text-ink h-9 rounded-[var(--radius-sm)] border px-2 text-xs"
          />
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="danger"
          disabled={pending || (choice === 'new' && newName.trim().length < 2)}
          onClick={() =>
            onConfirm(
              choice === 'unfile' || choice === 'new' ? null : choice,
              choice === 'new' ? newName.trim() : null,
            )
          }
        >
          Remove {name.split(' ')[0]}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          Keep
        </Button>
        <Link
          href={`/people/${person.id}`}
          className="text-ink-muted ml-auto text-xs underline-offset-4 hover:underline"
        >
          Open {name.split(' ')[0]}
        </Link>
      </div>
    </div>
  )
}
