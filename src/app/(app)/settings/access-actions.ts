'use server'

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'
import { getEntitlements } from '@/lib/billing/entitlements'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'

/**
 * PILOT ACCESS
 * =============================================================================
 * Redeeming an invitation, and — for the owner only — issuing them.
 *
 * The code never reaches the database. It is hashed here and the hash is what
 * travels, so a leaked backup hands nobody a working invitation and a query log
 * never contains one either.
 *
 * Neither of these actions can grant a tier by itself. Both tables refuse
 * writes from a user-scoped connection, and the only path through is
 * redeem_pilot_invitation(), which is SECURITY DEFINER and writes the literal
 * 'pilot'. There is no argument it takes that yields 'owner'. That is
 * deliberate: a compromised server action still cannot make anybody an owner.
 * =============================================================================
 */

export interface AccessActionState {
  ok?: boolean
  message?: string
  error?: string
  /** Shown once, on creation. Never retrievable afterwards. */
  code?: string
}

function hashCode(code: string): string {
  // Normalised so a pasted code with stray case or spacing still matches the
  // one that was issued.
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex')
}

/**
 * Human-typeable: no vowels, so no accidental words; no 0/O or 1/I, which are
 * the pairs people mistype when reading a code aloud over a call.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateCode(): string {
  const bytes = randomBytes(16)
  const body = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
  return `ATT-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`
}

export async function redeemInvitation(
  _prev: AccessActionState,
  formData: FormData,
): Promise<AccessActionState> {
  const raw = formData.get('code')?.toString().trim() ?? ''
  if (raw.length === 0) return { error: 'Enter an invitation code.' }
  if (raw.length > 64) return { error: 'That does not look like an invitation code.' }

  await requireUser()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('redeem_pilot_invitation', {
    code_hash_input: hashCode(raw),
  })

  if (error) {
    logger.warn('access.redeem_failed', { code: error.code })
    return { error: 'We could not check that code. Try again.' }
  }

  // Every outcome the function can return, in the user's words. Deliberately
  // distinct: "expired" and "already used" send someone to different next
  // steps, and collapsing them into "invalid" wastes their time.
  const outcomes: Record<string, AccessActionState> = {
    ok: { ok: true, message: 'Invitation accepted. Full access is enabled on this account.' },
    already_granted: { ok: true, message: 'This account already has full access.' },
    invalid: { error: 'That code was not recognized.' },
    expired: { error: 'That invitation has expired.' },
    revoked: { error: 'That invitation is no longer valid.' },
    exhausted: { error: 'That invitation has already been used.' },
    unauthenticated: { error: 'Sign in first.' },
  }

  const outcome = outcomes[String(data)] ?? { error: 'That code could not be redeemed.' }

  await track(outcome.ok ? 'pilot_invitation_redeemed' : 'pilot_invitation_rejected', {
    // The outcome, never the code.
    result: String(data),
  })

  if (outcome.ok) {
    revalidatePath('/settings/billing')
    revalidatePath('/today')
  }

  return outcome
}

/**
 * Issue an invitation. Owner only.
 *
 * The check is on the resolved tier from the database, not on an email list in
 * the source. Returns the code once; only its hash is stored, so it cannot be
 * shown again and a lost code is reissued rather than recovered.
 */
export async function createInvitation(
  _prev: AccessActionState,
  formData: FormData,
): Promise<AccessActionState> {
  const user = await requireUser()
  const entitlements = await getEntitlements()

  if (entitlements.tier !== 'owner') {
    // Same wording a stranger would get. Confirming that this action exists to
    // someone who may not use it is itself information.
    return { error: 'That action is not available on this account.' }
  }

  const label = formData.get('label')?.toString().trim().slice(0, 80) || null
  const maxRedemptions = Math.min(
    Math.max(Number(formData.get('maxRedemptions') ?? 1) || 1, 1),
    50,
  )
  const days = Number(formData.get('expiresInDays') ?? 30) || 30
  const expiresAt = new Date(Date.now() + Math.min(Math.max(days, 1), 365) * 86_400_000)

  const code = generateCode()
  const supabase = await createClient()

  // Service-role write, because the table refuses the caller by design. The
  // owner check above is the gate; RLS is the backstop that means a missing
  // check cannot be exploited from a browser.
  const { error } = await supabase.rpc('create_pilot_invitation', {
    code_hash_input: hashCode(code),
    label_input: label,
    max_redemptions_input: maxRedemptions,
    expires_at_input: expiresAt.toISOString(),
    created_by_input: user.id,
  })

  if (error) {
    logger.warn('access.invitation_create_failed', { code: error.code })
    return { error: 'We could not create that invitation.' }
  }

  await track('pilot_invitation_created', { maxRedemptions, expiresInDays: days })
  revalidatePath('/settings/billing')

  return {
    ok: true,
    code,
    message: 'Copy this now — it is stored only as a hash and cannot be shown again.',
  }
}

/** Constant-time compare, exported for the tests that pin hashing behaviour. */
export async function codeMatchesHash(code: string, hash: string): Promise<boolean> {
  const a = Buffer.from(hashCode(code))
  const b = Buffer.from(hash)
  return a.length === b.length && timingSafeEqual(a, b)
}
