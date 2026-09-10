'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { CircleAlert, Loader2, Pencil, RefreshCw, Trash2, UserPlus } from 'lucide-react'
import {
  addConversationParticipant,
  deleteConversation,
  reprocessConversation,
  retitleConversation,
  type ConversationState,
} from '@/app/(app)/conversations/actions'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'
import { cn } from '@/lib/utils'

/**
 * The small controls on a conversation page: read it again, rename it,
 * delete it, add somebody who was there. Each is its own little island so a
 * failure in one leaves the others working.
 */

export function ReprocessButton({
  interactionId,
  label = 'Read it again',
}: {
  interactionId: string
  label?: string
}) {
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const run = async () => {
    setPending(true)
    setError(null)
    const result = await reprocessConversation(interactionId)
    setPending(false)
    if (result.error) setError(result.error)
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="min-h-10"
        onClick={run}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="size-3.5" aria-hidden="true" />
        )}
        {pending ? 'Reading…' : label}
      </Button>
      {error ? (
        <span role="alert" className="text-critical text-xs">
          {error}
        </span>
      ) : null}
    </span>
  )
}

/**
 * Delete needs a second press, not a dialog. The first press turns the
 * button into the question; the second answers it. Walking away answers no.
 */
export function DeleteConversationButton({ interactionId }: { interactionId: string }) {
  const [armed, setArmed] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const run = async () => {
    setPending(true)
    const result = await deleteConversation(interactionId)
    // A successful delete redirects; only a failure returns.
    setPending(false)
    if (result?.error) setError(result.error)
  }

  if (!armed) {
    return (
      <Button
        type="button"
        variant="quiet"
        size="sm"
        className="min-h-10"
        onClick={() => setArmed(true)}
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
        Delete
      </Button>
    )
  }

  return (
    <span className="border-critical/25 bg-critical-wash text-ink-secondary inline-flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-xs">
      <span>Delete this conversation and everything it proposed?</span>
      <Button type="button" variant="danger" size="sm" onClick={run} disabled={pending}>
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
        Delete
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setArmed(false)}
        disabled={pending}
      >
        Keep it
      </Button>
      {error ? (
        <span role="alert" className="text-critical flex items-center gap-1">
          <CircleAlert className="size-3.5" aria-hidden="true" />
          {error}
        </span>
      ) : null}
    </span>
  )
}

export function RetitleForm({
  interactionId,
  title,
  className,
}: {
  interactionId: string
  title: string
  className?: string
}) {
  const [editing, setEditing] = React.useState(false)
  const [state, formAction] = useActionState<ConversationState, FormData>(retitleConversation, {})

  // Leave editing once a save lands. Derived from the action state during
  // render, once per state object, rather than in an effect.
  const [savedFor, setSavedFor] = React.useState<ConversationState | null>(null)
  if (state.message && state !== savedFor) {
    setSavedFor(state)
    setEditing(false)
  }

  if (!editing) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn('size-10', className)}
        aria-label="Rename"
        onClick={() => setEditing(true)}
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </Button>
    )
  }

  return (
    <form action={formAction} className={cn('flex flex-wrap items-center gap-2', className)}>
      <input type="hidden" name="interactionId" value={interactionId} />
      <label htmlFor="retitle" className="sr-only">
        Title
      </label>
      <Input
        id="retitle"
        name="title"
        defaultValue={title}
        maxLength={200}
        autoFocus
        className="h-9 w-72 max-w-full"
      />
      <RetitleSubmit />
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
        Cancel
      </Button>
      {state.error ? (
        <span role="alert" className="text-critical text-xs">
          {state.error}
        </span>
      ) : null}
    </form>
  )
}

function RetitleSubmit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
      Save
    </Button>
  )
}

export function AddParticipant({
  interactionId,
  people,
  className,
}: {
  interactionId: string
  people: { id: string; name: string; src: string | null }[]
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [personId, setPersonId] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (people.length === 0) return null

  const add = async () => {
    if (!personId) return
    setPending(true)
    setError(null)
    const result = await addConversationParticipant(interactionId, personId)
    setPending(false)
    if (result.error) setError(result.error)
    else {
      setOpen(false)
      setPersonId('')
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn('min-h-10', className)}
        onClick={() => setOpen(true)}
      >
        <UserPlus className="size-3.5" aria-hidden="true" />
        Add someone
      </Button>
    )
  }

  const chosen = people.find((p) => p.id === personId)

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-2', className)}>
      {chosen ? <Avatar name={chosen.name} src={chosen.src} size="xs" /> : null}
      <Select
        value={personId}
        onChange={(e) => setPersonId(e.currentTarget.value)}
        aria-label="Who"
        className="h-9 w-auto text-xs"
      >
        <option value="">Who was there?</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <Button type="button" size="sm" onClick={add} disabled={!personId || pending}>
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
        Add
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {error ? (
        <span role="alert" className="text-critical text-xs">
          {error}
        </span>
      ) : null}
    </span>
  )
}
