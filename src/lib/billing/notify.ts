import 'server-only'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import {
  proActivatedEmail,
  proCancellationScheduledEmail,
  proEndedEmail,
  proFirstChargeSoonEmail,
  proTrialEndedEmail,
  proTrialEndingEmail,
  proTrialStartedEmail,
} from '@/lib/email/templates'
import { formatDate } from '@/lib/format'
import { logger } from '@/lib/logger'
import { PLANS, formatPrice } from './plans'
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
 *
 * Subscribing during the trial is `activated` with the first charge date;
 * canceling before that charge says nothing will be charged. The trial's own
 * notices (started, ending, ended) go through `notifyTrial`.
 */
async function recipient(userId: string) {
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
  if (!to) return null
  return {
    to,
    firstName: (profile?.preferred_name || profile?.full_name || '').split(' ')[0] ?? '',
    timeZone: profile?.timezone ?? 'UTC',
  }
}

const PRO_PRICE_LABEL = formatPrice(PLANS.pro.monthlyPriceCents)

export async function notifyBillingTransition(
  userId: string,
  transition: SubscriptionTransition,
): Promise<void> {
  if (!['activated', 'cancellation_scheduled', 'ended'].includes(transition.kind)) return

  const reader = await recipient(userId)
  if (!reader) return
  const { to, firstName, timeZone } = reader
  const built =
    transition.kind === 'activated'
      ? proActivatedEmail({
          firstName,
          planLabel: PLANS.pro.name,
          firstChargeOn: transition.firstChargeAt
            ? formatDate(transition.firstChargeAt, timeZone)
            : null,
          price: PRO_PRICE_LABEL,
        })
      : transition.kind === 'cancellation_scheduled'
        ? proCancellationScheduledEmail({
            firstName,
            endsOn: transition.endsAt ? formatDate(transition.endsAt, timeZone) : null,
            inTrial: transition.inTrial ?? false,
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

export type TrialNotice = 'started' | 'ending' | 'ended' | 'charge_soon'

/** One of the trial's notices. Never throws; a failed email is logged. */
export async function notifyTrial(
  userId: string,
  notice: TrialNotice,
  endsAt: string,
): Promise<boolean> {
  try {
    const reader = await recipient(userId)
    if (!reader) return false
    const endsOn = formatDate(endsAt, reader.timeZone)
    const built =
      notice === 'started'
        ? proTrialStartedEmail({ firstName: reader.firstName, endsOn, price: PRO_PRICE_LABEL })
        : notice === 'ending'
          ? proTrialEndingEmail({ firstName: reader.firstName, endsOn, price: PRO_PRICE_LABEL })
          : notice === 'charge_soon'
            ? proFirstChargeSoonEmail({
                firstName: reader.firstName,
                chargeOn: endsOn,
                price: PRO_PRICE_LABEL,
              })
            : proTrialEndedEmail({ firstName: reader.firstName })
    const result = await sendEmail({
      to: reader.to,
      subject: built.subject,
      html: built.html,
      kind: `trial_${notice}`,
    })
    if (!result.ok) logger.warn('billing.trial_email_failed', { notice })
    return result.ok
  } catch {
    logger.warn('billing.trial_email_failed', { notice })
    return false
  }
}
