import Link from 'next/link'
import type { Metadata } from 'next'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Eyebrow } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { getEntitlements, usageInPeriod } from '@/lib/billing/entitlements'
import { PLANS, foundingProtectionBlurb, formatPrice, type MeterKind } from '@/lib/billing/plans'
import { foundingPlacesRemaining } from './actions'
import { ManageBillingButton, TrialButton, UpgradeButton } from '@/components/app/billing-actions'
import { InvitationPanel } from '@/components/app/invitation-panel'
import { hasFullAccess } from '@/lib/billing/access'
import { planSummary } from '@/lib/billing/plan-summary'
import { checkoutAvailable } from '@/lib/billing/stripe'
import { trialEligibility } from '@/lib/billing/trial'
import { features } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'
import { brand } from '@/lib/brand'
import { CheckoutPending } from '@/components/app/checkout-pending'

export const metadata: Metadata = { title: 'Plan', robots: { index: false, follow: false } }

const METER_LABEL: Partial<Record<MeterKind, string>> = {
  person_research: 'People researched',
  meeting_brief: 'Meeting briefs',
  transcript_analysis: 'Transcripts analyzed',
  document_analysis: 'Documents read',
  ai_coach_message: 'Coach questions',
  message_adaptation: 'Messages adapted',
  transcription_seconds: 'Transcription minutes',
}

/** Seconds are metered; minutes are what a person reads. */
const display = (kind: MeterKind, n: number) =>
  kind === 'transcription_seconds' ? Math.floor(n / 60) : n

export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>
}) {
  const { user, profile } = await requireOnboardedUser()
  const timeZone = profile.timezone ?? 'UTC'
  const { checkout } = await searchParams
  const entitlements = await getEntitlements()

  // The subscription as the account sees it (owner-readable under RLS): what
  // the plan is doing next, and whether there is a Stripe customer to manage.
  const supabase = await createClient()
  const { data: billing } = await supabase
    .from('subscriptions')
    .select(
      'status, cancel_at_period_end, current_period_end, stripe_customer_id, stripe_subscription_id, trial_ends_at',
    )
    .eq('user_id', user.id)
    .maybeSingle()
  const pastDue = billing?.status === 'past_due'
  const hasBillingAccount = Boolean(billing?.stripe_customer_id)
  const plan = PLANS[entitlements.plan]
  const founding = await foundingPlacesRemaining()
  const protection = foundingProtectionBlurb()

  // Only meters with an actual numeric quota are worth showing a bar for.
  const metered = (Object.keys(METER_LABEL) as MeterKind[]).filter((kind) => {
    const limit = entitlements.quotas[kind]
    return typeof limit === 'number' && limit > 0
  })

  // Owner and pilot: the plan is still Free commercially, but its ceilings do
  // not apply, so the copy that describes them would contradict the Access
  // section a few lines below it.
  const fullAccess = hasFullAccess(entitlements.tier)

  // What the plan is doing next, in the same words as the iPhone's Account
  // screen: the trial and its end, the first or next charge, or that nothing
  // will be charged.
  const onTrial = entitlements.trial?.state === 'active'
  const subscribable = checkoutAvailable()
  const summary = planSummary({
    plan: entitlements.plan,
    fullAccess,
    trial: entitlements.trial,
    subscription: billing
      ? {
          status: billing.status,
          cancelAtPeriodEnd: billing.cancel_at_period_end,
          currentPeriodEnd: billing.current_period_end,
        }
      : null,
    trialOffered:
      subscribable &&
      entitlements.plan === 'free' &&
      trialEligibility(
        billing
          ? {
              status: billing.status,
              trialEndsAt: billing.trial_ends_at,
              stripeSubscriptionId: billing.stripe_subscription_id,
            }
          : null,
        fullAccess,
      ).eligible,
    canSubscribe: subscribable && !fullAccess && (entitlements.plan === 'free' || onTrial),
    timeZone,
  })
  // Subscribed at Stripe, as opposed to on the trial Atturel grants itself.
  const subscribed = entitlements.plan !== 'free' && !onTrial

  const usage = await Promise.all(
    metered.map(async (kind) => ({
      kind,
      used: await usageInPeriod(kind, entitlements.periodStart),
      limit: entitlements.quotas[kind] as number,
    })),
  )

  return (
    <div>
      <Eyebrow>Plan</Eyebrow>

      {checkout === 'success' ? (
        <p
          role="status"
          className="border-positive/25 bg-positive-wash text-positive mt-4 flex max-w-lg items-start gap-2 rounded-[var(--radius-md)] border px-3.5 py-3 text-xs leading-relaxed"
        >
          <CircleCheck className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {subscribed
            ? 'Thank you. You are subscribed to Pro.'
            : 'Thank you. Your subscription starts as soon as Stripe confirms it — usually within seconds. This page checks for you.'}
        </p>
      ) : null}
      {/* Refreshes the page a few times while the webhook lands, so the
          customer does not have to reload to see what they agreed to. */}
      {checkout === 'success' && !subscribed ? <CheckoutPending /> : null}

      {pastDue ? (
        <p
          role="alert"
          className="border-caution/25 bg-caution-wash text-ink-secondary mt-4 flex max-w-lg items-start gap-2 rounded-[var(--radius-md)] border px-3.5 py-3 text-xs leading-relaxed"
        >
          <CircleAlert className="text-caution mt-px size-3.5 shrink-0" aria-hidden="true" />
          Your last payment did not go through. Pro stays on while Stripe retries; update your card
          in Manage billing to keep it.
        </p>
      ) : null}

      {checkout === 'canceled' ? (
        <p className="text-ink-muted mt-4 max-w-lg text-xs leading-relaxed">
          Checkout was canceled and nothing was charged.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="font-display text-ink text-2xl">{summary.label}</span>
        {entitlements.isFounding ? <Badge tone="accent">Founding</Badge> : null}
        {subscribed && plan.monthlyPriceCents ? (
          <span className="text-ink-secondary text-sm">
            {formatPrice(plan.monthlyPriceCents)} per month
          </span>
        ) : null}
      </div>

      {summary.lines.map((line) => (
        <p key={line} className="text-ink mt-2 max-w-lg text-sm leading-relaxed">
          {line}
        </p>
      ))}

      <p className="text-ink-secondary mt-3 max-w-lg text-sm leading-relaxed">{plan.tagline}</p>

      {/* The Free highlights enumerate quotas -- "3 researched people and 3
          meeting briefs a month" -- which is not true of an account those
          quotas do not apply to. */}
      {!fullAccess ? (
        <ul className="mt-6 grid gap-2.5">
          {plan.highlights.map((item) => (
            <li key={item} className="text-ink-secondary flex gap-2.5 text-sm">
              <CircleCheck className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      ) : null}

      {usage.length > 0 ? (
        <section className="mt-10">
          <Eyebrow>This month</Eyebrow>
          <p className="text-ink-muted mt-2 max-w-lg text-xs leading-relaxed">
            Storing notes and observations is never metered — only the operations that cost real
            money to run.
          </p>
          <ul className="mt-5 grid gap-4">
            {usage.map((row) => {
              const pct = Math.min(100, Math.round((row.used / Math.max(row.limit, 1)) * 100))
              const exhausted = row.used >= row.limit
              return (
                <li key={row.kind}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-ink text-sm">{METER_LABEL[row.kind]}</span>
                    <span className="text-ink-muted text-xs tabular-nums">
                      {display(row.kind, row.used)} of {display(row.kind, row.limit)}
                    </span>
                  </div>
                  <div
                    className="bg-line mt-1.5 h-px w-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={row.used}
                    aria-valuemin={0}
                    aria-valuemax={row.limit}
                    aria-label={METER_LABEL[row.kind]}
                  >
                    <div
                      className={exhausted ? 'bg-critical h-full' : 'bg-accent-graphic h-full'}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="text-ink-faint mt-4 text-xs">Resets on the 1st.</p>
        </section>
      ) : null}

      {/* No upgrade path is offered to an account that already has everything.
          Nothing here is hidden from them -- Compare plans is still reachable
          from the marketing site -- it is simply not a prompt they need. */}
      {/* Subscribing is its own explicit action, with the first charge date
          and the monthly terms beside it -- here and again on Stripe's page.
          Nothing else (a card saved in Manage billing included) subscribes. */}
      <div className={fullAccess ? 'hidden' : 'mt-10 flex flex-wrap items-start gap-2'}>
        {summary.offerTrial ? <TrialButton /> : null}
        {summary.subscribe ? (
          <UpgradeButton
            label={summary.subscribe.label}
            variant={summary.offerTrial ? 'secondary' : 'primary'}
          />
        ) : null}
        <Button asChild variant="secondary" size="sm">
          <Link href="/pricing">Compare plans</Link>
        </Button>
      </div>
      {!fullAccess && (summary.offerTrial || summary.subscribe) ? (
        <div className="text-ink-muted mt-3 grid max-w-lg gap-1 text-xs leading-relaxed">
          {summary.offerTrial ? (
            <p>
              The trial: 14 days of Pro, no card. It returns to Free unless you subscribe, and
              nothing is deleted.
            </p>
          ) : null}
          {summary.subscribe ? (
            <p>
              {summary.offerTrial ? 'Subscribing: ' : ''}
              {summary.subscribe.terms}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Anyone paying can always reach billing to change or cancel it -- an
          owner or pilot grant included. Hiding this row for full-access
          accounts also hid the only way a paying pilot could cancel. */}
      {/* Whenever there is a Stripe customer, not only while on Pro: an unpaid
          or ended subscription is exactly when someone needs to fix a card,
          pay an invoice or find a receipt. */}
      {/* Not for the trial alone: it has nothing at Stripe to manage. */}
      {features.billing && (hasBillingAccount || subscribed) ? (
        <div className={fullAccess ? 'mt-10' : 'mt-2'}>
          <ManageBillingButton />
        </div>
      ) : null}

      {/* Only where someone could actually take a place. Advertising scarcity on
          a deployment that cannot sell is a claim with nothing behind it. */}
      {features.billing && founding !== null && founding > 0 && summary.subscribe ? (
        <p className="text-ink-muted mt-3 text-xs">
          {founding} founding {founding === 1 ? 'place' : 'places'} left.
          {protection ? ` ${protection}` : ''}
        </p>
      ) : null}

      {entitlements.isFounding ? (
        <p className="text-ink-muted mt-3 text-xs">
          You joined as a founding customer.{protection ? ` ${protection}` : ''}
        </p>
      ) : null}

      {!subscribable ? (
        <p className="border-line bg-bg-sunken text-ink-muted mt-6 flex max-w-lg items-start gap-2 rounded-[var(--radius-md)] border px-3.5 py-3 text-xs leading-relaxed">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          Upgrading is not available yet. Everything else works normally.
        </p>
      ) : null}

      <p className="text-ink-muted mt-8 max-w-lg text-xs leading-relaxed">
        Cancel any time from Manage billing; Pro stays on until the end of the period you paid for,
        or of your trial if you subscribed during it. Billing questions:{' '}
        <a
          href={`mailto:${brand.email.support}`}
          className="text-accent underline underline-offset-2"
        >
          {brand.email.support}
        </a>
        .
      </p>

      {/* Quiet by design -- see components/app/invitation-panel. */}
      <InvitationPanel tier={entitlements.tier} />
    </div>
  )
}
