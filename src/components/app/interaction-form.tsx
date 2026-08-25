'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react'
import { addInteraction } from '@/app/(app)/people/actions'
import type { ActionState } from '@/app/(app)/people/actions'
import { Button } from '@/components/ui/button'
import { FormField, Input, Select, Textarea } from '@/components/ui/field'
import { useHasMounted } from '@/lib/use-has-mounted'
import { cn } from '@/lib/utils'

/**
 * LOG AN INTERACTION
 * =============================================================================
 * A conversation that already happened, recorded after the fact.
 *
 * Deliberately separate from the meeting debrief. A debrief is attached to a
 * meeting Atturel already knew about and runs the notes through extraction; this
 * is the far commoner case of a corridor conversation, a phone call, or
 * something remembered two days later. Asking someone to first invent a meeting
 * so they can log a chat is the kind of friction that stops a record being kept
 * at all.
 *
 * Nothing here is analysed. It records what happened, and the fields are the
 * three a person can actually answer from memory.
 * =============================================================================
 */

const KINDS = [
  { value: 'meeting', label: 'A meeting' },
  { value: 'call', label: 'A call' },
  { value: 'email', label: 'An email exchange' },
  { value: 'message', label: 'Messages or chat' },
  { value: 'informal', label: 'Something informal' },
  { value: 'other', label: 'Something else' },
] as const

const RATINGS = [
  { value: 1, label: 'Badly' },
  { value: 2, label: 'Not great' },
  { value: 3, label: 'Fine' },
  { value: 4, label: 'Well' },
  { value: 5, label: 'Very well' },
] as const

/** Local date in the yyyy-MM-ddThh:mm the datetime-local input requires. */
function localNow(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 16)
}

export function InteractionForm({
  personId,
  personName,
  className,
}: {
  personId: string
  personName: string
  className?: string
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(addInteraction, {})
  const [wentWell, setWentWell] = React.useState<number | null>(null)

  // The clock is read after mount, never during the server render: the default
  // belongs to the user's timezone rather than the server's, and rendering a
  // time on both sides makes the markup disagree. useSyncExternalStore rather
  // than setState-in-an-effect, which is what the rest of the app uses for
  // mount-gated values.
  const mounted = useHasMounted()
  const defaultWhen = mounted ? localNow() : ''

  const fieldError = (name: string) => state.fieldErrors?.[name]?.[0] ?? null

  return (
    <form action={formAction} className={cn('grid gap-6', className)}>
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="wentWell" value={wentWell ?? ''} />

      <FormField id="title" label="What was it?" required error={fieldError('title')}>
        {(props) => (
          <Input {...props} name="title" placeholder="Catch-up about the migration timeline" />
        )}
      </FormField>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField id="kind" label="Type">
          {(props) => (
            <Select {...props} name="kind" defaultValue="meeting">
              {KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        <FormField id="occurredAt" label="When" required error={fieldError('occurredAt')}>
          {(props) => (
            <Input {...props} type="datetime-local" name="occurredAt" defaultValue={defaultWhen} />
          )}
        </FormField>
      </div>

      <FormField
        id="summary"
        label="What happened?"
        description={`Optional. Anything worth remembering about working with ${personName}.`}
        error={fieldError('summary')}
      >
        {(props) => (
          <Textarea
            {...props}
            name="summary"
            rows={5}
            maxLength={4000}
            placeholder="What was discussed, what they pushed back on, what is still open."
          />
        )}
      </FormField>

      <fieldset className="grid gap-2.5">
        <legend className="text-sm font-medium text-ink">How did it go?</legend>
        <p className="text-xs leading-relaxed text-ink-muted">
          Optional. Your read of it, not a score of the other person.
        </p>
        <div className="flex flex-wrap gap-2">
          {RATINGS.map((rating) => (
            <Button
              key={rating.value}
              type="button"
              size="sm"
              variant={wentWell === rating.value ? 'primary' : 'secondary'}
              aria-pressed={wentWell === rating.value}
              // A second press clears it, so an optional field stays optional
              // once it has been touched.
              onClick={() => setWentWell((current) => (current === rating.value ? null : rating.value))}
            >
              {rating.label}
            </Button>
          ))}
        </div>
      </fieldset>

      {state.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius-md)] border border-caution/25 bg-caution-wash px-3.5 py-3 text-xs leading-relaxed text-ink-secondary"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0 text-caution" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}

      {state.message ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-[var(--radius-md)] border border-positive/25 bg-positive-wash px-3.5 py-3 text-xs leading-relaxed text-ink-secondary"
        >
          <CircleCheck className="mt-px size-3.5 shrink-0 text-positive" aria-hidden="true" />
          {state.message}
        </p>
      ) : null}

      <Submit />
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <div className="flex justify-start">
      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Recording…
          </>
        ) : (
          'Record it'
        )}
      </Button>
    </div>
  )
}
