'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { CircleAlert, CircleCheck, FileText, Link2, Loader2, NotebookPen, Sparkles } from 'lucide-react'
import { addContext, type ResearchState } from '@/app/(app)/people/research-actions'
import { detectInputKind } from '@/lib/sources/url'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'
import { Eyebrow } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { brand } from '@/lib/brand'

/**
 * UNIVERSAL ADD CONTEXT
 * =============================================================================
 * One input for everything: a link, a note, a pasted transcript.
 *
 * The type is detected as the user types and shown back to them, so the
 * automatic behaviour is legible rather than magic-and-unpredictable. There is
 * no "choose your import type" menu, because choosing between six import
 * workflows is the friction this replaces.
 * =============================================================================
 */

const KIND_META = {
  url: {
    icon: Link2,
    label: 'Link',
    hint: `${brand.name} will open this page, check it is really about them, and pull out professional facts with citations.`,
  },
  transcript: {
    icon: FileText,
    label: 'Transcript',
    hint: `${brand.name} will pull out decisions, commitments and objections, then propose what is worth remembering.`,
  },
  note: {
    icon: NotebookPen,
    label: 'Note',
    hint: 'Saved as a source. Anything it establishes about working with them becomes a suggestion to review.',
  },
} as const

export function AddContext({
  personId,
  personName,
  className,
}: {
  personId: string
  personName: string
  className?: string
}) {
  const [state, formAction] = useActionState<ResearchState, FormData>(addContext, {})
  const [value, setValue] = React.useState('')
  const formRef = React.useRef<HTMLFormElement>(null)

  // Detect as they type so the behaviour is never a surprise.
  const kind = value.trim().length > 3 ? detectInputKind(value) : null
  const meta = kind ? KIND_META[kind] : null

  // Clear the box after a successful save.
  //
  // This genuinely is "synchronise the UI with the result of an external
  // system": useActionState offers no success callback, and the alternatives
  // (remount keys, uncontrolled inputs) would break the live input-type
  // detection below. The cascading render happens once per successful submit.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state.ok) setValue('')
  }, [state.ok])

  return (
    <form ref={formRef} action={formAction} className={className}>
      <input type="hidden" name="personId" value={personId} />

      <Eyebrow className="flex items-center gap-1.5">
        <Sparkles className="size-3 text-accent" aria-hidden="true" />
        Add context
      </Eyebrow>

      <label htmlFor="add-context-input" className="sr-only">
        Add a link, a note or a transcript about {personName}
      </label>

      <Textarea
        id="add-context-input"
        name="input"
        rows={3}
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        maxLength={200_000}
        className="mt-3"
        placeholder={`Paste a link, a note, or a transcript…\nhttps://acme.com/leadership/${personName.toLowerCase().replace(/\s+/g, '-')}`}
        onKeyDown={(e) => {
          // Cmd/Ctrl+Enter submits, which is what people expect in a textarea.
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            formRef.current?.requestSubmit()
          }
        }}
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="flex min-h-5 items-center gap-1.5 text-xs text-ink-muted">
          {meta ? (
            <>
              <meta.icon className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
              <span className="text-ink-secondary">Detected: {meta.label}.</span>
              <span className="hidden sm:inline">{meta.hint}</span>
            </>
          ) : (
            <span>A company bio, a talk, an article, meeting notes, or a transcript.</span>
          )}
        </p>
        <SubmitButton disabled={value.trim().length < 4} />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border border-caution/25 bg-caution-wash px-3 py-2.5 text-xs leading-relaxed text-ink-secondary"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0 text-caution" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}

      {state.ok && state.message ? (
        <p
          role="status"
          className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border border-positive/25 bg-positive-wash px-3 py-2.5 text-xs leading-relaxed text-ink-secondary"
        >
          <CircleCheck className="mt-px size-3.5 shrink-0 text-positive" aria-hidden="true" />
          {state.message}
        </p>
      ) : null}
    </form>
  )
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={disabled || pending} className={cn('shrink-0')}>
      {pending ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Reading…
        </>
      ) : (
        'Add'
      )}
    </Button>
  )
}
