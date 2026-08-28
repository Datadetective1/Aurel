'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, ExternalLink, Loader2, Trash2, UserX } from 'lucide-react'
import {
  confirmSourceMatch,
  deleteSource,
  rejectSourceMatch,
} from '@/app/(app)/people/research-actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/primitives'
import { formatPublishedDate } from '@/lib/format'
import { brand } from '@/lib/brand'

/**
 * SOURCE ROW
 * =============================================================================
 * A source is a claim about a real person, so the user has to be able to
 * overrule it. Three corrections:
 *
 *   "Yes, this is them"    raises identity confidence to certain.
 *   "This is someone else" keeps the page on file, flagged no_match, so
 *                          research will not attribute it to this person
 *                          again. Rejecting TEACHES.
 *   "Delete"               removes the source row entirely. Research may
 *                          rediscover the same URL later. Deleting FORGETS.
 *
 * That last distinction is the one a real user could not make, so it is stated
 * in the confirmation of each rather than left to be inferred from the schema.
 *
 * Both corrections withdraw whatever rested on that source alone — facts and
 * unconfirmed proposals alike. Observations the user personally confirmed are
 * kept, because at that point the user is the evidence, not the page.
 *
 * Both ask first. Rejection used to fire on the first click while deletion
 * asked, which made the gentler-sounding action the unguarded one.
 * =============================================================================
 */

export interface SourceRowData {
  id: string
  title: string | null
  url: string | null
  publisher: string | null
  author: string | null
  sourceType: string
  retrievedAt: string | null
  publishedAt: string | null
  accessStatus: string
  identityStatus: string | null
  /** How many current professional facts cite this source. */
  factCount: number
  /** Observations proposed or accepted from it. */
  observationCount: number
}

/**
 * What the badge says, in terms of what the reader has to do about it.
 *
 * It used to name the identity-resolution state directly: "Probable match",
 * "Uncertain match", "Conflicting", "Unreviewed". Four internal confidence
 * values, and the user has to model the resolver to know which of them is
 * their problem. "Conflicting" has no referent at all on screen — conflicting
 * with what?
 *
 * A source that is fine now says nothing. Silence is the correct signal for
 * "no action needed", and a row of green ticks is noise that trains people to
 * stop reading badges. The three states that genuinely need a human turn into
 * one badge that asks the actual question, and the resolved states report what
 * the user themselves decided.
 */
const IDENTITY_LABEL: Record<string, { label: string; tone: 'positive' | 'caution' | 'outline' } | null> =
  {
    // No badge: nothing for the reader to do.
    confirmed: null,
    probable: null,
    ambiguous: { label: 'Check this is them', tone: 'caution' },
    conflicting: { label: 'Check this is them', tone: 'caution' },
    unreviewed: { label: 'Check this is them', tone: 'caution' },
    no_match: { label: 'Marked as someone else', tone: 'outline' },
  }

export function SourceRow({
  source,
  personId,
  personName,
}: {
  source: SourceRowData
  personId: string
  /** Named in the question and the consequences, so "them" is never ambiguous. */
  personName: string
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<null | 'confirm' | 'reject' | 'delete'>(null)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const [confirmingReject, setConfirmingReject] = React.useState(false)

  const run = async (kind: 'confirm' | 'reject' | 'delete', fn: () => Promise<unknown>) => {
    setBusy(kind)
    try {
      await fn()
      router.refresh()
    } finally {
      setBusy(null)
      setConfirmingDelete(false)
      setConfirmingReject(false)
    }
  }

  /**
   * What the user actually loses, counted rather than described.
   *
   * Both actions withdraw whatever rested on this source alone. The old copy
   * mentioned facts and never mentioned proposals, which was accurate for
   * deletion and silent about rejection -- and rejection did not withdraw
   * proposals at all until this change.
   */
  const withdrawn = [
    source.factCount > 0 ? `${source.factCount} fact${source.factCount === 1 ? '' : 's'}` : null,
    source.observationCount > 0
      ? `${source.observationCount} proposal${source.observationCount === 1 ? '' : 's'}`
      : null,
  ]
    .filter(Boolean)
    .join(' and ')

  const identity = IDENTITY_LABEL[source.identityStatus ?? 'unreviewed']
  const needsReview =
    source.identityStatus === 'ambiguous' ||
    source.identityStatus === 'unreviewed' ||
    source.identityStatus === 'conflicting'

  return (
    // min-w-0 on the li itself, which is the grid item. Without it a grid
    // item defaults to min-width:auto and refuses to shrink below the
    // min-content width of a long source title, holding the whole page wider
    // than the viewport. The same default that broke the Settings nav on
    // mobile -- and adding min-w-0 to the flex children inside was the wrong
    // level to fix it, because they were never the ones being held open.
    <li className="border-line bg-surface min-w-0 rounded-[var(--radius-md)] border px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-ink hover:text-accent inline-flex max-w-full items-center gap-1 text-sm"
            >
              <span className="min-w-0 truncate">{source.title ?? source.url}</span>
              <ExternalLink className="size-3 shrink-0 opacity-60" aria-hidden="true" />
            </a>
          ) : (
            <p className="text-ink truncate text-sm">{source.title ?? 'Untitled source'}</p>
          )}

          <p className="text-ink-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem]">
            {source.publisher ? <span>{source.publisher}</span> : null}
            {source.author ? <span>· {source.author}</span> : null}
            {source.publishedAt ? <span>· published {formatPublishedDate(source.publishedAt)}</span> : null}
            {source.retrievedAt ? <span>· read {formatPublishedDate(source.retrievedAt)}</span> : null}
          </p>

          <p className="text-ink-faint mt-1 text-[0.6875rem]">
            {source.factCount > 0
              ? `${source.factCount} ${source.factCount === 1 ? 'fact rests' : 'facts rest'} on this`
              : 'No facts rest on this'}
            {source.observationCount > 0
              ? ` · ${source.observationCount} observation${source.observationCount === 1 ? '' : 's'}`
              : ''}
          </p>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge tone="outline">{source.sourceType.replace(/_/g, ' ')}</Badge>
          {identity ? <Badge tone={identity.tone}>{identity.label}</Badge> : null}
        </div>
      </div>

      {/* Asks the question before offering the answers. Somebody scanning a
          list of sources should not have to infer from two button labels that
          a decision is wanted. */}
      {needsReview ? (
        <p className="text-ink-secondary mt-3 text-xs leading-relaxed">
          Is this about {personName}?
        </p>
      ) : null}

      {/* 44px controls. These are irreversible decisions about whose record a
          claim belongs to, and they were 32px -- the small variant -- on a
          phone. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {needsReview ? (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11"
            disabled={busy !== null}
            onClick={() => run('confirm', () => confirmSourceMatch(source.id, personId))}
          >
            {busy === 'confirm' ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-3.5" aria-hidden="true" />
            )}
            Yes, this is them
          </Button>
        ) : null}

        {/* Rejection now confirms, like deletion already did.
            It used to fire on the first click while the more alarming-sounding
            "Remove" asked first -- so the gentler-sounding action was the
            unguarded one, which is backwards from what the words imply. Both
            withdraw evidence; both should ask. */}
        {source.identityStatus !== 'no_match' ? (
          confirmingReject ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                className="min-h-11"
                disabled={busy !== null}
                onClick={() => run('reject', () => rejectSourceMatch(source.id, personId))}
              >
                {busy === 'reject' ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <UserX className="size-3.5" aria-hidden="true" />
                )}
                Yes, someone else
              </Button>
              <Button
                variant="quiet"
                size="sm"
                className="min-h-11"
                onClick={() => setConfirmingReject(false)}
              >
                Cancel
              </Button>
              <span className="text-ink-muted basis-full text-[0.6875rem] leading-relaxed">
                {brand.name} keeps the page on file so it will not use it for {personName} again.
                {withdrawn ? ` ${withdrawn} will be withdrawn.` : ''}
              </span>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11"
              disabled={busy !== null}
              onClick={() => {
                setConfirmingReject(true)
                setConfirmingDelete(false)
              }}
            >
              <UserX className="size-3.5" aria-hidden="true" />
              This is someone else
            </Button>
          )
        ) : null}

        {confirmingDelete ? (
          <>
            <Button
              variant="danger"
              size="sm"
              className="min-h-11"
              disabled={busy !== null}
              onClick={() => run('delete', () => deleteSource(source.id, personId))}
            >
              {busy === 'delete' ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              Yes, delete it
            </Button>
            <Button
              variant="quiet"
              size="sm"
              className="min-h-11"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </Button>
            {/* The distinction that matters, stated where the choice is made:
                rejecting teaches, deleting forgets. */}
            <span className="text-ink-muted basis-full text-[0.6875rem] leading-relaxed">
              Deleted for good, so research may find it again later.
              {withdrawn ? ` ${withdrawn} will be withdrawn.` : ''}
            </span>
          </>
        ) : (
          <Button
            variant="quiet"
            size="sm"
            className="min-h-11"
            disabled={busy !== null}
            onClick={() => {
              setConfirmingDelete(true)
              setConfirmingReject(false)
            }}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete
          </Button>
        )}
      </div>

      {source.identityStatus === 'no_match' ? (
        <p className="text-ink-muted mt-2 text-[0.6875rem] leading-relaxed">
          You marked this as someone else. {brand.name} keeps it on file so it will not use it for{' '}
          {personName} again, and anything it alone supported has been withdrawn.
        </p>
      ) : null}
    </li>
  )
}
