'use client'

import * as React from 'react'
import { Check, Loader2, Pencil, X } from 'lucide-react'
import {
  confirmObservation,
  dismissObservation,
} from '@/app/(app)/people/actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'
import { EvidenceBadge } from './evidence'
import { Eyebrow } from '@/components/ui/primitives'
import type { Database } from '@/lib/supabase/types'

type EvidenceLevel = Database['public']['Enums']['evidence_level']

export interface Proposal {
  id: string
  content: string
  evidenceLevel: EvidenceLevel
  category: string
  /** Where it came from, shown so the user can judge it. */
  basis: string | null
  excerpt: string | null
}

/**
 * THE VERIFIED MEMORY LOOP
 * =============================================================================
 * AI-proposed observations are inert until a human accepts them. This component
 * is that gate: Save, Edit, or Dismiss.
 *
 * Each proposal shows its supporting excerpt, because "is this worth
 * remembering?" is unanswerable without seeing what it was based on. Accepting
 * promotes the observation to CONFIRMED — the user is vouching for it, which is
 * a stronger claim than the model's original reading.
 * =============================================================================
 */
export function MemoryReview({
  proposals,
  personName,
}: {
  proposals: Proposal[]
  personName: string
}) {
  const [items, setItems] = React.useState(proposals)

  // Keep in sync when the server revalidates after an ingest.
  React.useEffect(() => setItems(proposals), [proposals])

  if (items.length === 0) return null

  const remove = (id: string) => setItems((prev) => prev.filter((p) => p.id !== id))

  return (
    <section className="rounded-[var(--radius-lg)] border border-accent/25 bg-accent-wash p-5 sm:p-6">
      <Eyebrow className="text-accent">Worth remembering?</Eyebrow>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        {items.length === 1
          ? 'One suggestion about'
          : `${items.length} suggestions about`}{' '}
        working with {personName}. Nothing here is part of your relationship record until you save
        it.
      </p>

      <ul className="mt-5 grid gap-3">
        {items.map((proposal) => (
          <ProposalCard key={proposal.id} proposal={proposal} onResolved={() => remove(proposal.id)} />
        ))}
      </ul>
    </section>
  )
}

function ProposalCard({
  proposal,
  onResolved,
}: {
  proposal: Proposal
  onResolved: () => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(proposal.content)
  const [pending, setPending] = React.useState<'save' | 'dismiss' | null>(null)

  const save = async () => {
    setPending('save')
    const result = await confirmObservation(proposal.id, editing ? draft : undefined)
    if (result.ok) onResolved()
    else setPending(null)
  }

  const dismiss = async () => {
    setPending('dismiss')
    const result = await dismissObservation(proposal.id)
    if (result.ok) onResolved()
    else setPending(null)
  }

  return (
    <li className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
      {editing ? (
        <>
          <label htmlFor={`edit-${proposal.id}`} className="sr-only">
            Edit this observation
          </label>
          <Textarea
            id={`edit-${proposal.id}`}
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            rows={3}
            maxLength={1000}
            autoFocus
          />
        </>
      ) : (
        <p className="text-sm leading-relaxed text-ink">{proposal.content}</p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <EvidenceBadge level={proposal.evidenceLevel} />
        {proposal.basis ? (
          <span className="text-[0.6875rem] text-ink-faint">{proposal.basis}</span>
        ) : null}
      </div>

      {proposal.excerpt && !editing ? (
        <blockquote className="mt-3 border-l-2 border-line-strong pl-3 text-xs leading-relaxed text-ink-muted">
          {proposal.excerpt.length > 240
            ? `${proposal.excerpt.slice(0, 240)}…`
            : proposal.excerpt}
        </blockquote>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={save} disabled={pending !== null}>
          {pending === 'save' ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="size-3.5" aria-hidden="true" />
          )}
          {editing ? 'Save edit' : 'Save'}
        </Button>

        {!editing ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setEditing(true)}
            disabled={pending !== null}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Edit
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false)
              setDraft(proposal.content)
            }}
            disabled={pending !== null}
          >
            Cancel
          </Button>
        )}

        <Button size="sm" variant="quiet" onClick={dismiss} disabled={pending !== null}>
          {pending === 'dismiss' ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <X className="size-3.5" aria-hidden="true" />
          )}
          Dismiss
        </Button>
      </div>
    </li>
  )
}
