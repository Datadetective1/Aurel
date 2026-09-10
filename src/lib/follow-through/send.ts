import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { followThroughEmail } from '@/lib/email/templates'
import { sendEmail } from '@/lib/email/send'
import { AVATAR_BUCKET } from '@/lib/conversations/avatars'
import { absoluteUrl } from '@/lib/brand'
import { formatDateIn } from '@/lib/tz'
import { initials } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { headline, selectFollowThrough, subjectFor, type DigestLoop, type Selection } from './select'
import { localClock, type LocalClock } from './schedule'

type Client = SupabaseClient<Database>

/**
 * BUILD AND SEND ONE USER'S FOLLOW-THROUGH
 * =============================================================================
 * Shared by the scheduled job (service role, every user) and the settings
 * button (the user's own session, one user). The client passed in decides
 * whose rows are visible; this code never widens that.
 *
 * Steps: load the active loops, decide what qualifies, render, reserve the
 * day in the ledger, send, record the outcome. A day is reserved BEFORE the
 * send so two overlapping runs cannot both mail it; a failed send releases
 * the reservation so the next run can try again.
 * =============================================================================
 */

/** Long enough for an email to be opened tomorrow, short enough to expire. */
const EMAIL_PHOTO_SECONDS = 7 * 24 * 60 * 60

export interface FollowThroughProfile {
  id: string
  email: string | null
  firstName: string
  timeZone: string | null
}

export type FollowThroughOutcome =
  | { status: 'sent'; count: number; messageId: string }
  | { status: 'skipped'; reason: 'nothing_open' | 'not_configured' | 'already_sent_today' }
  | { status: 'failed'; reason: string }

/** Everything the digest needs about one user's loops, from any client. */
export async function loadDigestLoops(supabase: Client, userId: string): Promise<DigestLoop[]> {
  const { data } = await supabase
    .from('commitments')
    .select(
      'id, description, kind, owner, status, review_status, due_on, deferred_until, created_at, person_id, interaction_id, people!commitments_person_id_fkey(id, full_name, preferred_name, avatar_url, avatar_path), interactions(title, occurred_at)',
    )
    .eq('user_id', userId)
    .eq('review_status', 'confirmed')
    .in('status', ['open', 'later'])
    .limit(300)

  return (data ?? []).map((row) => ({
    id: row.id,
    description: row.description,
    kind: row.kind,
    owner: row.owner,
    status: row.status,
    reviewStatus: row.review_status,
    dueOn: row.due_on,
    deferredUntil: row.deferred_until,
    createdAt: row.created_at,
    personId: row.person_id,
    personName: row.people ? row.people.preferred_name || row.people.full_name : null,
    interactionId: row.interaction_id,
    interactionTitle: row.interactions?.title ?? null,
    interactionDay: row.interactions?.occurred_at ? row.interactions.occurred_at.slice(0, 10) : null,
  }))
}

/**
 * Compose the email for one user. Pure apart from photo signing, and returned
 * unsent so the preview and the send share one renderer.
 */
export async function composeFollowThrough(
  supabase: Client,
  profile: FollowThroughProfile,
  clock: LocalClock,
): Promise<{ selection: Selection; subject: string; html: string } | null> {
  const loops = await loadDigestLoops(supabase, profile.id)
  const selection = selectFollowThrough(loops, {
    today: clock.date,
    weekday: clock.weekday,
    formatDay: (day) => formatDateIn(day, clock.timeZone),
  })
  if (selection.items.length === 0) return null

  // One signing call for every face in the email. Photos are optional: the
  // initials render whether or not the client shows images.
  const personIds = [...new Set(selection.items.map((i) => i.loop.personId).filter((id): id is string => Boolean(id)))]
  const { data: people } = personIds.length
    ? await supabase
        .from('people')
        .select('id, full_name, preferred_name, avatar_url, avatar_path')
        .eq('user_id', profile.id)
        .in('id', personIds)
    : { data: [] as { id: string; full_name: string; preferred_name: string | null; avatar_url: string | null; avatar_path: string | null }[] }

  const photoByPerson = new Map<string, string | null>()
  const paths = (people ?? []).filter((p) => p.avatar_path).map((p) => p.avatar_path as string)
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrls(paths, EMAIL_PHOTO_SECONDS)
    for (const p of people ?? []) {
      const match = signed?.find((s) => s.path === p.avatar_path && !s.error)
      photoByPerson.set(p.id, match?.signedUrl ?? p.avatar_url ?? null)
    }
  }
  for (const p of people ?? []) {
    if (!photoByPerson.has(p.id)) photoByPerson.set(p.id, p.avatar_url ?? null)
  }

  const built = followThroughEmail({
    firstName: profile.firstName,
    headline: headline(selection),
    subject: subjectFor(selection),
    more: selection.more,
    loopsUrl: absoluteUrl('/loops'),
    items: selection.items.map((item) => ({
      phrase: item.phrase,
      timing: item.timing,
      source: item.source,
      person: item.loop.personName
        ? {
            name: item.loop.personName,
            initials: initials(item.loop.personName),
            photoUrl: item.loop.personId ? (photoByPerson.get(item.loop.personId) ?? null) : null,
          }
        : null,
      href: absoluteUrl(`/loops?focus=${item.loop.id}`),
      personHref: item.loop.personId ? absoluteUrl(`/people/${item.loop.personId}`) : null,
      sourceHref: item.loop.interactionId ? absoluteUrl(`/conversations/${item.loop.interactionId}`) : null,
    })),
  })

  return { selection, subject: built.subject, html: built.html }
}

/**
 * Send today's follow-through to one user, idempotently.
 *
 * `trigger` 'scheduled' consumes the user's day in the ledger; 'manual' is
 * recorded but does not, so pressing the button in Settings never blocks the
 * morning email and the morning email never blocks the button.
 */
export async function sendFollowThrough(
  supabase: Client,
  profile: FollowThroughProfile,
  options: { trigger: 'scheduled' | 'manual'; now?: Date },
): Promise<FollowThroughOutcome> {
  const now = options.now ?? new Date()
  const clock = localClock(now, profile.timeZone)

  if (!profile.email) return { status: 'failed', reason: 'no_email' }

  const composed = await composeFollowThrough(supabase, profile, clock)
  if (!composed) return { status: 'skipped', reason: 'nothing_open' }

  // Reserve the day first. The partial unique index makes a second scheduled
  // reservation for the same local day fail, which is the whole idempotency.
  const { data: reservation, error: reserveError } = await supabase
    .from('follow_through_deliveries')
    .insert({
      user_id: profile.id,
      local_date: clock.date,
      trigger: options.trigger,
      status: 'reserved',
      loop_count: composed.selection.items.length,
    })
    .select('id')
    .single()

  if (reserveError || !reservation) {
    if (reserveError?.code === '23505') return { status: 'skipped', reason: 'already_sent_today' }
    logger.warn('follow_through.reserve_failed', { code: reserveError?.code })
    return { status: 'failed', reason: 'reserve_failed' }
  }

  const result = await sendEmail({
    to: profile.email,
    subject: composed.subject,
    html: composed.html,
    kind: 'follow_through',
  })

  if (result.ok && result.delivered) {
    await supabase
      .from('follow_through_deliveries')
      .update({ status: 'sent', sent_at: new Date().toISOString(), detail: result.id })
      .eq('id', reservation.id)
    return { status: 'sent', count: composed.selection.items.length, messageId: result.id }
  }

  if (result.ok && !result.delivered) {
    // No provider on this deployment. The day is recorded as skipped so the
    // ledger says what happened, and nothing retries into the void.
    await supabase
      .from('follow_through_deliveries')
      .update({ status: 'skipped', detail: result.reason })
      .eq('id', reservation.id)
    return { status: 'skipped', reason: 'not_configured' }
  }

  // The provider refused or failed. Release the day so the next run retries.
  await supabase.from('follow_through_deliveries').delete().eq('id', reservation.id)
  logger.warn('follow_through.send_failed', { reason: result.ok ? 'unknown' : result.reason })
  return { status: 'failed', reason: result.ok ? 'unknown' : result.reason }
}

/** Whether the scheduled send already served this user's local day. */
export async function alreadyServedToday(
  supabase: Client,
  userId: string,
  localDate: string,
): Promise<boolean> {
  const { count } = await supabase
    .from('follow_through_deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('local_date', localDate)
    .eq('trigger', 'scheduled')
  return (count ?? 0) > 0
}
