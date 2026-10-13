import 'server-only'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import {
  proActivatedEmail,
  proCancellationScheduledEmail,
  proEndedEmail,
} from '@/lib/email/templates'
import { formatDate } from '@/lib/format'
import { logger } from '@/lib/logger'
import { PLANS } from './plans'
import type { SubscriptionTransition } from './subscription-state'

/**
 * Billing emails, decided here and nowhere else.
 *
 *   activated               yes -- what Pro now includes
 *   cancellation_scheduled  yes -- when it ends, and that nothing is deleted
 *   ended                   yes -- the account is on Free, the record intact
 *   payment_problem         no  -- Stripe's own failed-payment emails carry
 *                                  the card update link; enable them in the
 *                                  Stripe dashboard. The app shows the state.
 *   cancellation_withdrawn  no
 *   payment_recovered       no  -- Stripe's receipt is the confirmation
 */
export async function notifyBillingTransition(
  userId: string,
  transition: SubscriptionTransition,
): Promise<void> {
  if (!['activated', 'cancellation_scheduled', 'ended'].includes(transition.kind)) return

  const admin = createServiceRoleClient()
  const [{ data: authUser }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin
      .from('profiles')
      .select('full_name, preferred_name, timezone')
      .eq('id', userId)
      .maybeSingle(),
  ])
  const to = authUser.user?.email
  if (!to) return

  const firstName = (profile?.preferred_name || profile?.full_name || '').split(' ')[0] ?? ''
  const built =
    transition.kind === 'activated'
      ? proActivatedEmail({
          firstName,
          planLabel: PLANS.pro.name,
        })
      : transition.kind === 'cancellation_scheduled'
        ? proCancellationScheduledEmail({
            firstName,
            endsOn: transition.endsAt
              ? formatDate(transition.endsAt, profile?.timezone ?? 'UTC')
              : null,
          })
        : transition.kind === 'ended'
          ? proEndedEmail({ firstName, reason: transition.reason })
          : null
  if (!built) return

  const result = await sendEmail({
    to,
    subject: built.subject,
    html: built.html,
    kind: `billing_${transition.kind}`,
  })
  if (!result.ok) logger.warn('billing.email_failed', { kind: transition.kind })
}
