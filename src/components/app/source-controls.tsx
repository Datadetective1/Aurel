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
import { formatDate } from '@/lib/format'
import { brand } from '@/lib/brand'

/**
 * SOURCE ROW
 * =============================================================================
 * A source is a claim about a real person, so the user has to be able to
 * overrule it. Three corrections, each with a distinct meaning:
 *
 *   "Not them"  — the source is real but about someone else. The link is marked
 *                 no_match and anything it alone supported is withdrawn.
 *   "Confirm"   — yes, this is them. Raises identity confidence to certain.
 *   "Remove"    — delete the source entirely.
 *
 * Removing a source withdraws the facts that rested on it alone. Observations
 * the user personally confirmed are kept, because at that point the user is the
 * evidence, not the page.
 *
 * The destructive action asks first. Everything here is reversible by
 * re-researching except deletion, which is not.
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

const IDENTITY_LABEL: Record<string, { label: string; tone: 'positive' | 'caution' | 'outline' }> =
  {
    confirmed: { label: 'Confirmed match', tone: 'positive' },
    probable: { label: 'Probable match', tone: 'outline' },
    ambiguous: { label: 'Uncertain match', tone: 'caution' },
    conflicting: { label: 'Conflicting', tone: 'caution' },
    no_match: { label: 'Not this person', tone: 'caution' },
    unreviewed: { label: 'Unreviewed', tone: 'outline' },
  }

export function SourceRow({ source, personId }: { source: SourceRowData; personId: string }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<null | 'confirm' | 'reject' | 'delete'>(null)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)

  const run = async (kind: 'confirm' | 'reject' | 'delete', fn: () => Promise<unknown>) => {
    setBusy(kind)
    try {
      await fn()
      router.refresh()
    } finally {
      setBusy(null)
      setConfirmingDelete(false)
    }
  }

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
            {source.publishedAt ? <span>· published {formatDate(source.publishedAt)}</span> : null}
            {source.retrievedAt ? <span>· read {formatDate(source.retrievedAt)}</span> : null}
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

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {needsReview ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={() => run('confirm', () => confirmSourceMatch(source.id, personId))}
          >
            {busy === 'confirm' ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-3.5" aria-hidden="true" />
            )}
            This is them
          </Button>
        ) : null}

        {source.identityStatus !== 'no_match' ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={() => run('reject', () => rejectSourceMatch(source.id, personId))}
          >
            {busy === 'reject' ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <UserX className="size-3.5" aria-hidden="true" />
            )}
            Not this person
          </Button>
        ) : null}

        {confirmingDelete ? (
          <>
            <Button
              variant="danger"
              size="sm"
              disabled={busy !== null}
              onClick={() => run('delete', () => deleteSource(source.id, personId))}
            >
              {busy === 'delete' ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              Remove it
            </Button>
            <Button variant="quiet" size="sm" onClick={() => setConfirmingDelete(false)}>
              Keep
            </Button>
            <span className="text-ink-muted text-[0.6875rem]">
              {source.factCount > 0
                ? `${source.factCount} fact${source.factCount === 1 ? '' : 's'} with no other source will be withdrawn.`
                : 'This cannot be undone.'}
            </span>
          </>
        ) : (
          <Button
            variant="quiet"
            size="sm"
            disabled={busy !== null}
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Remove
          </Button>
        )}
      </div>

      {source.identityStatus === 'no_match' ? (
        <p className="text-ink-muted mt-2 text-[0.6875rem] leading-relaxed">
          Marked as someone else. {brand.name} will not use it for this person, and anything it
          alone supported has been withdrawn.
        </p>
      ) : null}
    </li>
  )
}
