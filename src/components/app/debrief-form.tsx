'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { CircleAlert, Loader2 } from 'lucide-react'
import { debriefMeeting, type MeetingState } from '@/app/(app)/meetings/actions'
import { VoiceDebrief } from '@/components/app/voice-debrief'
import { Button } from '@/components/ui/button'
import { FormField, Textarea } from '@/components/ui/field'
import { Eyebrow } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

const RATINGS = [
  { value: 1, label: 'Badly' },
  { value: 2, label: 'Not great' },
  { value: 3, label: 'Fine' },
  { value: 4, label: 'Well' },
  { value: 5, label: 'Very well' },
]

export function DebriefForm({
  meetingId,
  participantNames,
}: {
  meetingId: string
  participantNames: string[]
}) {
  const [state, formAction] = useActionState<MeetingState, FormData>(debriefMeeting, {})
  const [rating, setRating] = React.useState<number | null>(null)
  const notesRef = React.useRef<HTMLTextAreaElement | null>(null)
  const [usedVoice, setUsedVoice] = React.useState(false)

  /**
   * Put the transcript where the user was already going to type.
   *
   * Appended, never assigned. Somebody who typed three lines and then decided
   * to speak the rest must not watch those three lines vanish, and asking
   * "replace or append?" is a dialog for a question with an obviously safe
   * answer. Nothing is submitted here -- the words land in the field and stop,
   * and the existing Save debrief button is still the only way anything
   * reaches the record.
   */
  function insertTranscript(text: string) {
    const field = notesRef.current
    if (!field) return

    setUsedVoice(true)

    const existing = field.value.trimEnd()
    field.value = existing.length > 0 ? `${existing}

${text}` : text

    // React does not know about a value set on the node directly, and the form
    // reads the DOM on submit -- but the input event keeps anything else
    // listening (autosize, validation) in step.
    field.dispatchEvent(new Event('input', { bubbles: true }))

    field.focus()
    field.setSelectionRange(field.value.length, field.value.length)
    field.scrollTop = field.scrollHeight
  }

  const placeholder =
    participantNames.length > 0
      ? `${participantNames[0]} asked for the cost impact before the recommendation. We agreed to revisit the forecast on the 14th. ${participantNames[1] ?? 'The team'} pushed back on the timeline.`
      : 'We agreed to revisit the forecast on the 14th. There was pushback on the timeline.'

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="meetingId" value={meetingId} />
      {rating ? <input type="hidden" name="wentWell" value={rating} /> : null}
      {usedVoice ? <input type="hidden" name="usedVoice" value="1" /> : null}

      <VoiceDebrief meetingId={meetingId} onTranscript={insertTranscript} />

      <FormField
        id="notes"
        label="What happened?"
        description="Rough notes are fine. Names help — they are how each observation gets attached to the right person."
        required
        error={state.fieldErrors?.notes?.[0]}
      >
        {(props) => (
          <Textarea
            {...props}
            ref={notesRef}
            name="notes"
            rows={10}
            maxLength={200_000}
            placeholder={placeholder}
            className="leading-relaxed"
          />
        )}
      </FormField>

      <div className="mt-7">
        <Eyebrow>How did it go?</Eyebrow>
        <p className="mt-1.5 text-xs text-ink-muted">Optional. Your own read, not a judgment.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {RATINGS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRating(rating === option.value ? null : option.value)}
              aria-pressed={rating === option.value}
              className={cn(
                'min-h-11 rounded-[var(--radius-md)] border px-4 text-sm transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                rating === option.value
                  ? 'border-accent bg-accent text-accent-contrast'
                  : 'border-line-strong text-ink-secondary hover:border-ink-faint hover:bg-bg-sunken',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-[var(--radius-md)] border border-critical/25 bg-critical-wash px-3 py-2.5 text-xs text-critical"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}

      {state.message ? (
        <p
          role="status"
          className="mt-5 rounded-[var(--radius-md)] border border-caution/25 bg-caution-wash px-3 py-2.5 text-xs leading-relaxed text-ink-secondary"
        >
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
    <>
      <Button type="submit" size="lg" className="mt-8" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Reading your notes…
          </>
        ) : (
          'Save debrief'
        )}
      </Button>
      {pending ? (
        <p className="mt-3 text-xs text-ink-muted">
          Pulling out decisions, commitments and what is worth remembering.
        </p>
      ) : null}
    </>
  )
}
