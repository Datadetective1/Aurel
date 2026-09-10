import { NextResponse, type NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { serverEnv, features } from '@/lib/env'
import { logger } from '@/lib/logger'
import { clampHour, localClock, modeFor, shouldSendNow } from '@/lib/follow-through/schedule'
import { alreadyServedToday, sendFollowThrough } from '@/lib/follow-through/send'

/**
 * THE DAILY FOLLOW-THROUGH JOB
 * =============================================================================
 * Invoked by the platform's scheduler with `Authorization: Bearer CRON_SECRET`.
 * Walks every onboarded, opted-in user, works out whether their local day has
 * been served, and sends the digest when it has not and there is something
 * open. Everything about *what* to send lives in lib/follow-through; this is
 * the loop around it.
 *
 * Service role, because there is no user session at three in the morning.
 * Every query it makes is scoped by the user id it is currently serving, and
 * the only thing it writes is the delivery ledger.
 *
 * Refuses outright without the secret. A URL that emails every user is not
 * something to leave open on the off chance the secret was forgotten.
 * =============================================================================
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = serverEnv.CRON_SECRET
  const header = request.headers.get('authorization')
  if (!secret || header !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  if (!features.serviceRole) {
    logger.warn('follow_through.no_service_role')
    return NextResponse.json({ ok: false, reason: 'service_role_unavailable' }, { status: 503 })
  }

  const mode = modeFor({
    query: request.nextUrl.searchParams.get('mode'),
    scheduleHeader: request.headers.get('x-vercel-cron-schedule'),
  })
  const now = new Date()
  const admin = createServiceRoleClient()

  // Addresses live in auth, not in profiles. One paged listing, then a map.
  const emails = new Map<string, string>()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 })
    if (error) {
      logger.error('follow_through.list_users_failed', { message: error.message })
      return NextResponse.json({ ok: false, reason: 'list_users_failed' }, { status: 500 })
    }
    for (const user of data.users) if (user.email) emails.set(user.id, user.email)
    if (data.users.length < 500) break
  }

  const { data: profiles, error } = await admin
    .from('profiles')
    .select(
      'id, full_name, preferred_name, timezone, email_notifications, follow_through_email, follow_through_hour, onboarding_completed_at',
    )
    .eq('email_notifications', true)
    .eq('follow_through_email', true)
    .not('onboarding_completed_at', 'is', null)
    .limit(5000)

  if (error) {
    logger.error('follow_through.list_profiles_failed', { code: error.code })
    return NextResponse.json({ ok: false, reason: 'list_profiles_failed' }, { status: 500 })
  }

  const tally = { considered: 0, sent: 0, skipped: 0, failed: 0, waiting: 0 }

  for (const profile of profiles ?? []) {
    tally.considered++
    const clock = localClock(now, profile.timezone)
    const email = emails.get(profile.id) ?? null

    const decision = shouldSendNow({
      mode,
      clock,
      preferredHour: clampHour(profile.follow_through_hour),
      emailNotifications: profile.email_notifications,
      followThroughEmail: profile.follow_through_email,
      onboarded: Boolean(profile.onboarding_completed_at),
      hasEmail: Boolean(email),
      alreadySentToday: await alreadyServedToday(admin, profile.id, clock.date),
    })

    if (!decision.send) {
      tally.waiting++
      continue
    }

    const outcome = await sendFollowThrough(
      admin,
      {
        id: profile.id,
        email,
        firstName: profile.preferred_name || profile.full_name?.split(' ')[0] || '',
        timeZone: profile.timezone,
      },
      { trigger: 'scheduled', now },
    )

    if (outcome.status === 'sent') {
      tally.sent++
      // There is no session to attribute to, so the event is written for the
      // user just served. Counts and the mode only, like every other event.
      await admin
        .from('analytics_events')
        .insert({ user_id: profile.id, name: 'follow_through_sent', props: { loops: outcome.count, mode } })
    } else if (outcome.status === 'skipped') {
      tally.skipped++
    } else {
      tally.failed++
    }
  }

  logger.info('follow_through.run', { mode, ...tally })
  return NextResponse.json({ ok: true, mode, ...tally }, { headers: { 'cache-control': 'no-store' } })
}
