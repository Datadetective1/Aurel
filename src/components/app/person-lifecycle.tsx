'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Archive, CircleAlert, Loader2, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import {
  archivePerson,
  deletePersonPermanently,
  restorePerson,
  type ActionState,
} from '@/app/(app)/people/actions'
import { deleteLoop, editLoopText } from '@/app/(app)/loops/actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'

/**
 * REMOVE, RESTORE, DELETE
 * =============================================================================
 * Removing someone archives them: out of every list and new workflow, history
 * untouched, reversible. Deleting is a second, separate step, only from the
 * archive, behind a page that says exactly what goes and what stays.
 * =============================================================================
 */

function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-critical mt-2 flex items-center gap-1.5 text-xs">
      <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </p>
  )
}

/** Two taps: the first explains, the second removes. */
export function RemovePersonButton({ personId, name }: { personId: string; name: string }) {
  const [asking, setAsking] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  if (!asking) {
    return (
      <Button type="button" variant="secondary" onClick={() => setAsking(true)}>
        <Archive className="size-4" aria-hidden="true" />
        Remove from people
      </Button>
    )
  }

  return (
    <div className="border-line bg-bg-sunken rounded-[var(--radius-md)] border p-4">
      <p className="text-ink text-sm">
        Remove {name}? They leave your people, search, new meetings, research and reminders. Their
        past conversations and meetings stay as they are, and you can restore them from Archived at
        any time.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => archivePerson(personId))}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Remove {name}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => setAsking(false)}>
          Keep
        </Button>
      </div>
    </div>
  )
}

export function RestorePersonButton({
  personId,
  size = 'md',
}: {
  personId: string
  size?: 'sm' | 'md'
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [state, setState] = React.useState<ActionState>({})

  return (
    <div>
      <Button
        type="button"
        size={size}
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await restorePerson(personId)
            setState(result)
            if (!result.error) router.refresh()
          })
        }
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <RotateCcw className="size-4" aria-hidden="true" />
        )}
        Restore
      </Button>
      {state.error ? <ErrorLine>{state.error}</ErrorLine> : null}
    </div>
  )
}

/**
 * One loop that will outlive the person. If its words name them, they can be
 * reworded or the loop deleted before the person is.
 */
export function RetainedLoop({
  loop,
}: {
  loop: { id: string; description: string; mentionsPerson: boolean }
}) {
  const router = useRouter()
  const [editing, setEditing] = React.useState(false)
  const [text, setText] = React.useState(loop.description)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const run = (work: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const result = await work()
      if (result.error) setError(result.error)
      else {
        setError(null)
        setEditing(false)
        router.refresh()
      }
    })

  return (
    <li className="border-line rounded-[var(--radius-md)] border p-3">
      {editing ? (
        <>
          <label htmlFor={`loop-${loop.id}`} className="sr-only">
            Loop text
          </label>
          <Textarea
            id={`loop-${loop.id}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={500}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => run(() => editLoopText(loop.id, text))}
            >
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setText(loop.description)
                setEditing(false)
              }}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-ink text-sm">{loop.description}</p>
            {loop.mentionsPerson ? (
              <p className="text-caution mt-1 text-xs">
                Names them, so it will still identify them.
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Edit this loop"
              disabled={pending}
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Delete this loop"
              disabled={pending}
              onClick={() => run(() => deleteLoop(loop.id))}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
      {error ? <ErrorLine>{error}</ErrorLine> : null}
    </li>
  )
}

function DeleteButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="danger" disabled={disabled || pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Trash2 className="size-4" aria-hidden="true" />
      )}
      Delete permanently
    </Button>
  )
}

export function DeletePersonForm({ personId, name }: { personId: string; name: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(deletePersonPermanently, {})
  const [understood, setUnderstood] = React.useState(false)

  return (
    <form action={formAction}>
      <input type="hidden" name="personId" value={personId} />
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="understood"
          value="yes"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
          className="mt-1 size-4"
        />
        <span>
          I understand this permanently deletes {name} and what is listed under &ldquo;Deleted
          &rdquo;. It cannot be undone.
        </span>
      </label>
      <div className="mt-3">
        <DeleteButton disabled={!understood} />
      </div>
      {state.error ? <ErrorLine>{state.error}</ErrorLine> : null}
    </form>
  )
}
