'use client'

import * as React from 'react'
import { CircleCheck, Loader2 } from 'lucide-react'
import { submitArtifactFeedback } from '@/app/(app)/feedback-action'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'
import { Eyebrow } from '@/components/ui/primitives'

/**
 * Lightweight feedback on a generation.
 *
 * Kept to three options plus optional detail. Feedback personalises THIS user's
 * experience only — nothing here trains a shared model, and the copy does not
 * imply otherwise.
 */
const OPTIONS = [
  { value: 'yes', label: 'Useful' },
  { value: 'partly', label: 'Partly' },
  { value: 'no', label: 'Not useful' },
] as const

export function ArtifactFeedback({ artifactId }: { artifactId: string }) {
  const [rating, setRating] = React.useState<string | null>(null)
  const [note, setNote] = React.useState('')
  const [saved, setSaved] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  const choose = async (value: string) => {
    setRating(value)
    setPending(true)
    const result = await submitArtifactFeedback(artifactId, value, note || undefined)
    setPending(false)
    if (result.ok && value === 'yes') setSaved(true)
  }

  const saveNote = async () => {
    if (!rating) return
    setPending(true)
    await submitArtifactFeedback(artifactId, rating, note || undefined)
    setPending(false)
    setSaved(true)
  }

  if (saved) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <CircleCheck className="size-4 text-positive" aria-hidden="true" />
        Thanks — that helps tune what you get next time.
      </p>
    )
  }

  return (
    <div>
      <Eyebrow>Was this useful?</Eyebrow>
      <div className="mt-3 flex flex-wrap gap-2">
        {OPTIONS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={rating === option.value ? 'primary' : 'secondary'}
            onClick={() => choose(option.value)}
            disabled={pending}
            aria-pressed={rating === option.value}
          >
            {pending && rating === option.value ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            {option.label}
          </Button>
        ))}
      </div>

      {rating && rating !== 'yes' ? (
        <div className="mt-4 max-w-lg">
          <label htmlFor="feedback-note" className="text-xs text-ink-muted">
            What was missing or wrong? Optional.
          </label>
          <Textarea
            id="feedback-note"
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            rows={2}
            maxLength={1000}
            className="mt-2"
          />
          <Button size="sm" onClick={saveNote} disabled={pending} className="mt-3">
            Send
          </Button>
        </div>
      ) : null}

      <p className="mt-4 text-[0.6875rem] text-ink-faint">
        Feedback tunes your own experience. It is not used to train a shared model.
      </p>
    </div>
  )
}
