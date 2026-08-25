'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { CircleAlert, CircleCheck, Loader2, Paperclip, Upload } from 'lucide-react'
import { addDocument, type ResearchState } from '@/app/(app)/people/research-actions'
import { Button } from '@/components/ui/button'
import { MAX_DOCUMENT_BYTES } from '@/lib/sources/document.client'

/**
 * ADD A DOCUMENT
 * =============================================================================
 * Sits beside the paste box rather than replacing it, because pasting is still
 * the faster path for a paragraph. This is for the cases where the text is
 * locked inside a file — a PDF bio, a Word one-pager, an exported transcript.
 *
 * The file is validated here for size and type purely so the user finds out
 * immediately instead of after an upload. The server re-checks both; this is a
 * courtesy, not the boundary.
 * =============================================================================
 */

const ACCEPT = '.pdf,.docx,.txt,.md,.markdown,.csv,.json,.html,.htm'

const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'docx',
  'txt',
  'md',
  'markdown',
  'csv',
  'json',
  'html',
  'htm',
])

export function AddDocument({ personId }: { personId: string }) {
  const [state, formAction] = useActionState<ResearchState, FormData>(addDocument, {})
  const [fileName, setFileName] = React.useState<string | null>(null)
  const [localError, setLocalError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const formRef = React.useRef<HTMLFormElement>(null)

  // The filename deliberately stays visible after a successful read: together
  // with the confirmation it shows exactly which document was taken in. The
  // label reads "Choose a different file", so replacing it is one click, and
  // there is no state to synchronise after the fact.

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    setLocalError(null)

    if (!file) {
      setFileName(null)
      return
    }

    const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      setLocalError('PDF, Word (.docx) and plain text work. For anything else, paste the text.')
      setFileName(null)
      event.currentTarget.value = ''
      return
    }

    if (file.size > MAX_DOCUMENT_BYTES) {
      setLocalError(
        `That file is over ${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB. Paste the relevant section instead.`,
      )
      setFileName(null)
      event.currentTarget.value = ''
      return
    }

    setFileName(file.name)
  }

  const error = localError ?? state.error

  return (
    <form ref={formRef} action={formAction} className="mt-4">
      <input type="hidden" name="personId" value={personId} />

      <div className="flex flex-wrap items-center gap-2.5">
        <label className="border-line-strong bg-surface text-ink hover:bg-bg-sunken inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-1.5 text-[0.8125rem] transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)]">
          <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
          {fileName ? 'Choose a different file' : 'Attach a document'}
          <input
            ref={inputRef}
            type="file"
            name="file"
            accept={ACCEPT}
            onChange={onPick}
            className="sr-only"
          />
        </label>

        {fileName ? (
          <>
            <span className="text-ink-secondary min-w-0 truncate text-xs">{fileName}</span>
            <UploadButton />
          </>
        ) : (
          <span className="text-ink-faint text-[0.6875rem]">
            PDF, Word or plain text, up to {Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB
          </span>
        )}
      </div>

      {error ? (
        <p
          role="alert"
          className="border-caution/25 bg-caution-wash text-ink-secondary mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-xs leading-relaxed"
        >
          <CircleAlert className="text-caution mt-px size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {state.ok && state.message ? (
        <p
          role="status"
          className="border-positive/25 bg-positive-wash text-ink-secondary mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-xs leading-relaxed"
        >
          <CircleCheck className="text-positive mt-px size-3.5 shrink-0" aria-hidden="true" />
          {state.message}
        </p>
      ) : null}
    </form>
  )
}

function UploadButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Reading…
        </>
      ) : (
        <>
          <Upload className="size-3.5" aria-hidden="true" />
          Read it
        </>
      )}
    </Button>
  )
}
