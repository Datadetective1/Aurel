'use client'

import * as React from 'react'
import { Check, ImageOff, Loader2, ScanSearch, X } from 'lucide-react'
import {
  confirmPhotoSuggestion,
  findPublicPhoto,
  rejectPhotoSuggestion,
  type PhotoActionState,
} from '@/app/(app)/people/photo-actions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * SUGGEST -> CONFIRM
 * =============================================================================
 * A candidate face is shown as a question, never as an answer: "Is this
 * Columbus?" with where it was found, and two equal choices. Nothing becomes
 * the person's photo until "Use photo" is pressed.
 *
 * The image is a signed URL from the user's own private folder -- the
 * candidate was copied there when it was found -- so looking at it tells no
 * third party anything.
 * =============================================================================
 */

export interface PhotoSuggestionView {
  id: string
  /** Signed URL of the private review copy. */
  src: string
  sourceUrl: string
  sourceLabel: string | null
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function PhotoSuggestionCard({
  personId,
  personName,
  suggestion,
  className,
}: {
  personId: string
  personName: string
  suggestion: PhotoSuggestionView
  className?: string
}) {
  const [confirmState, confirm, confirming] = React.useActionState<PhotoActionState, FormData>(
    confirmPhotoSuggestion,
    {},
  )
  const [rejectState, reject, rejecting] = React.useActionState<PhotoActionState, FormData>(
    rejectPhotoSuggestion,
    {},
  )
  const error = confirmState.error ?? rejectState.error
  const first = personName.split(' ')[0] ?? personName

  return (
    <section
      aria-labelledby={`photo-suggestion-${personId}`}
      className={cn(
        'border-accent/25 bg-accent-wash flex flex-col gap-4 rounded-[var(--radius-lg)] border p-4 sm:flex-row sm:items-center',
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={suggestion.src}
        alt={`Possible photo of ${personName}, found on ${hostOf(suggestion.sourceUrl)}`}
        className="border-line bg-bg-sunken size-20 shrink-0 rounded-full border object-cover object-[50%_35%]"
        referrerPolicy="no-referrer"
      />
      <div className="min-w-0 flex-1">
        <h2 id={`photo-suggestion-${personId}`} className="text-ink text-sm font-medium">
          Is this {first}?
        </h2>
        <p className="text-ink-secondary mt-1 text-xs leading-relaxed">
          Found on{' '}
          <a
            href={suggestion.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink underline underline-offset-2"
          >
            {suggestion.sourceLabel ?? hostOf(suggestion.sourceUrl)}
          </a>
          , a page you confirmed is about {first}. It is not used until you say so.
        </p>
        {error ? (
          <p role="alert" className="text-critical mt-2 text-xs">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-2">
        <form action={confirm}>
          <input type="hidden" name="suggestionId" value={suggestion.id} />
          <Button type="submit" size="md" disabled={confirming || rejecting} className="min-h-11">
            {confirming ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
            Use photo
          </Button>
        </form>
        <form action={reject}>
          <input type="hidden" name="suggestionId" value={suggestion.id} />
          <Button type="submit" size="md" variant="secondary" disabled={confirming || rejecting} className="min-h-11">
            {rejecting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
            Not this person
          </Button>
        </form>
      </div>
    </section>
  )
}

/** "Look for a public photo": only offered when a confirmed source exists to look in. */
export function FindPhotoButton({ personId, className }: { personId: string; className?: string }) {
  const [state, find, pending] = React.useActionState<PhotoActionState, FormData>(findPublicPhoto, {})
  return (
    <form action={find} className={cn('flex flex-wrap items-center gap-2', className)}>
      <input type="hidden" name="personId" value={personId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending} className="min-h-11">
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <ScanSearch className="size-3.5" aria-hidden="true" />
        )}
        Look for a public photo
      </Button>
      {state.message || state.error ? (
        <span role="status" className={cn('flex items-center gap-1 text-xs', state.error ? 'text-critical' : 'text-ink-muted')}>
          {state.error ? <ImageOff className="size-3.5" aria-hidden="true" /> : null}
          {state.error ?? state.message}
        </span>
      ) : null}
    </form>
  )
}
