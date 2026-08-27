'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { CircleCheck, KeyRound } from 'lucide-react'
import {
  createInvitation,
  redeemInvitation,
  type AccessActionState,
} from '@/app/(app)/settings/access-actions'
import { Button } from '@/components/ui/button'
import { Eyebrow } from '@/components/ui/primitives'
import type { AccessTier } from '@/lib/billing/access'

/**
 * INVITATION
 * =============================================================================
 * A field for a code, and — for the owner — a way to issue one.
 *
 * Deliberately quiet. It sits at the bottom of Settings with no badge, no
 * banner and no mention on the pricing page, because a normal account has no
 * use for it and advertising it invites guessing at codes. Someone who has been
 * given one knows to come looking.
 *
 * The panel cannot grant anything. It posts a code to a server action, which
 * hashes it and calls a SECURITY DEFINER function that writes the literal
 * 'pilot'. Nothing reachable from this file can produce an owner.
 * =============================================================================
 */

export function InvitationPanel({ tier }: { tier: AccessTier }) {
  const [redeemState, redeemAction] = useActionState<AccessActionState, FormData>(
    redeemInvitation,
    {},
  )
  const [createState, createAction] = useActionState<AccessActionState, FormData>(
    createInvitation,
    {},
  )

  const hasAccess = tier === 'owner' || tier === 'pilot'

  return (
    <section className="border-line mt-12 border-t pt-8">
      <Eyebrow>Access</Eyebrow>

      {hasAccess ? (
        <p className="text-ink-secondary mt-3 flex items-center gap-2 text-sm">
          <CircleCheck className="text-positive size-4 shrink-0" aria-hidden="true" />
          {tier === 'owner'
            ? 'This account has owner access. Every capability is available and no quotas apply.'
            : 'This account has full pilot access. Every capability is available and no quotas apply.'}
        </p>
      ) : (
        <>
          <p className="text-ink-muted mt-2 max-w-lg text-xs leading-relaxed">
            Have an invitation code? Enter it to enable full access on this account.
          </p>

          <form action={redeemAction} className="mt-3 flex flex-wrap items-center gap-2">
            <label htmlFor="invitation-code" className="sr-only">
              Invitation code
            </label>
            <input
              id="invitation-code"
              name="code"
              autoComplete="off"
              spellCheck={false}
              placeholder="ATT-XXXX-XXXX-XXXX"
              className="border-line bg-surface text-ink min-h-11 min-w-0 flex-1 rounded-[var(--radius-md)] border px-3 font-mono text-sm"
            />
            <Button type="submit" variant="secondary" className="min-h-11">
              <KeyRound className="size-3.5" aria-hidden="true" />
              Redeem
            </Button>
          </form>
        </>
      )}

      {redeemState.error ? (
        <p role="alert" className="text-critical mt-2 text-xs">
          {redeemState.error}
        </p>
      ) : null}
      {redeemState.message ? (
        <p role="status" className="text-ink-secondary mt-2 text-xs">
          {redeemState.message}
        </p>
      ) : null}

      {tier === 'owner' ? (
        <div className="border-line mt-8 border-t pt-6">
          <Eyebrow>Issue an invitation</Eyebrow>
          <p className="text-ink-muted mt-2 max-w-lg text-xs leading-relaxed">
            Creates a code granting full pilot access. Only its hash is stored, so it is shown once
            and cannot be recovered — issue a new one if it is lost.
          </p>

          <form action={createAction} className="mt-3 grid max-w-lg gap-2 sm:grid-cols-[1fr_auto_auto]">
            <label htmlFor="invitation-label" className="sr-only">
              Who is this for?
            </label>
            <input
              id="invitation-label"
              name="label"
              placeholder="Who is this for?"
              className="border-line bg-surface text-ink min-h-11 min-w-0 rounded-[var(--radius-md)] border px-3 text-sm"
            />
            <label htmlFor="invitation-uses" className="sr-only">
              Number of uses
            </label>
            <input
              id="invitation-uses"
              name="maxRedemptions"
              type="number"
              min={1}
              max={50}
              defaultValue={1}
              className="border-line bg-surface text-ink min-h-11 w-20 rounded-[var(--radius-md)] border px-3 text-sm"
            />
            <Button type="submit" variant="secondary" className="min-h-11">
              Create
            </Button>
          </form>

          {createState.error ? (
            <p role="alert" className="text-critical mt-2 text-xs">
              {createState.error}
            </p>
          ) : null}

          {createState.code ? (
            <div className="border-line bg-bg-sunken mt-3 rounded-[var(--radius-md)] border px-3.5 py-3">
              <p className="text-ink font-mono text-sm break-all">{createState.code}</p>
              <p className="text-ink-muted mt-1.5 text-xs">{createState.message}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
