'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { CircleAlert, Loader2, Plus } from 'lucide-react'
import { addLoop, type LoopState } from '@/app/(app)/loops/actions'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'
import { cn } from '@/lib/utils'

/**
 * Add a loop by hand. One line, who owes it, an optional date. Folded behind
 * a button because most loops arrive from conversations; this is for the one
 * remembered in the corridor.
 */
export function AddLoop({
  people,
  defaultPersonId = '',
  interactionId,
  className,
}: {
  people: { id: string; name: string }[]
  defaultPersonId?: string
  interactionId?: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [state, formAction] = useActionState<LoopState, FormData>(addLoop, {})
  const [owner, setOwner] = React.useState<'user' | 'person' | 'shared'>('user')

  // Close on success and let the server render the new row. Derived during
  // render from the action state rather than in an effect: each successful
  // submit is a new state object, and closing once per object is exactly the
  // "previous render" pattern, with no cascading render.
  const [closedFor, setClosedFor] = React.useState<LoopState | null>(null)
  if (state.ok && state !== closedFor) {
    setClosedFor(state)
    setOpen(false)
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
        <Plus className="size-3.5" aria-hidden="true" />
        Add one by hand
      </Button>
    )
  }

  return (
    <form
      action={formAction}
      className={cn('border-line bg-bg-sunken rounded-[var(--radius-md)] border p-4', className)}
    >
      {interactionId ? <input type="hidden" name="interactionId" value={interactionId} /> : null}
      <label htmlFor="new-loop" className="sr-only">
        What is open?
      </label>
      <Input
        id="new-loop"
        name="description"
        placeholder="Send Ravi the revised forecast"
        maxLength={500}
        autoFocus
        aria-invalid={state.fieldErrors?.description ? true : undefined}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select
          name="owner"
          value={owner}
          onChange={(e) => setOwner(e.currentTarget.value as typeof owner)}
          aria-label="Who owes it"
          className="h-9 w-auto text-xs"
        >
          <option value="user">I promised</option>
          <option value="person">They promised</option>
          <option value="shared">Between us</option>
        </Select>
        <Select
          name="kind"
          defaultValue="commitment"
          aria-label="What kind"
          className="h-9 w-auto text-xs"
        >
          <option value="commitment">A commitment</option>
          <option value="follow_up">A follow-up</option>
          <option value="question">A question</option>
        </Select>
        {people.length > 0 ? (
          <Select
            name="personId"
            defaultValue={defaultPersonId}
            aria-label="Who it concerns"
            className="h-9 w-auto text-xs"
          >
            <option value="">{owner === 'person' ? 'Who?' : 'Nobody in particular'}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        ) : null}
        <Input type="date" name="dueOn" aria-label="Due" className="h-9 w-auto text-xs" />
      </div>
      {state.fieldErrors?.description?.[0] || state.error ? (
        <p role="alert" className="text-critical mt-2 flex items-center gap-1.5 text-xs">
          <CircleAlert className="size-3.5" aria-hidden="true" />
          {state.fieldErrors?.description?.[0] ?? state.error}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Submit />
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
      Add
    </Button>
  )
}
