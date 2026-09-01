import Link from 'next/link'
import type { Metadata } from 'next'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Eyebrow } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { getEntitlements, usageInPeriod } from '@/lib/billing/entitlements'
import { PLANS, formatPrice, type BillingInterval, type MeterKind } from '@/lib/billing/plans'
import { billingView } from '@/lib/billing/display'
import { formatDate } from '@/lib/format'
import { ManageBillingButton, UpgradeButton } from '@/components/app/billing-actions'
import { CheckoutReturn } from '@/components/app/checkout-return'
import { InvitationPanel } from '@/components/app/invitation-panel'
import { features } from '@/lib/env'

export const metadata: Metadata = { title: 'Plan', robots: { index: false, follow: false } }

const METER_LABEL: Partial<Record<MeterKind, string>> = {
  person_research: 'People researched',
  meeting_brief: 'Meeting briefs',
  transcript_analysis: 'Transcripts analyzed',
  document_analysis: 'Documents read',
  ai_coach_message: 'Coach questions',
  message_adaptation: 'Messages adapted',
}

function parseIntent(value: string | undefined): BillingInterval {
  return value === 'yearly' ? 'yearly' : 'monthly'
}

export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; intent?: string }>
}) {
  const { profile } = await requireOnboardedUser()
  const { checkout, intent } = await searchParams
  const entitlements = await getEntitlements()
  const plan = PLANS[entitlements.plan]
  const timeZone = profile.timezone ?? 'UTC'

  const view = billingView({
    level: entitlements.level,
    plan: entitlements.plan,
    status: entitlements.billing.status,
    interval: entitlements.billing.interval,
    currentPeriodEnd: entitlements.billing.currentPeriodEnd,
    cancelAtPeriodEnd: entitlements.billing.cancelAtPeriodEnd,
    trialEndsAt: entitlements.billing.trialEndsAt,
    hasCustomer: entitlements.billing.hasCustomer,
  })

  // Only meters with an actual numeric quota are worth showing a bar for.
  const metered = (Object.keys(METER_LABEL) as MeterKind[]).filter((kind) => {
    const limit = entitlements.quotas[kind]
    return typeof limit === 'number' && limit > 0
  })

  const usage = await Promise.all(
    metered.map(async (kind) => ({
      kind,
      used: await usageInPeriod(kind, entitlements.periodStart),
      limit: entitlements.quotas[kind] as number,
    })),
  )

  // Someone who chose a plan on the pricing page before they had an account.
  // The choice is honoured as a prompt, never as a charge: they still press the
  // button, and the price is still the one the server configuration says.
  const resumingPurchase = Boolean(intent) && view.showUpgrade && features.billing

  // Monthly leads unless they arrived having already chosen yearly.
  const preferred = parseIntent(intent)
  const alternate: BillingInterval = preferred === 'yearly' ? 'monthly' : 'yearly'

  return (
    <div>
      <Eyebrow>Plan</Eyebrow>

      {checkout === 'success' ? <CheckoutReturn alreadyPro={entitlements.plan !== 'free'} /> : null}

      {checkout === 'canceled' ? (
        <p className="text-ink-muted mt-4 max-w-lg text-xs leading-relaxed">
          Checkout was canceled and nothing was charged. Your plan has not changed.
        </p>
      ) : null}

      {resumingPurchase ? (
        <p
          role="status"
          className="border-accent/25 bg-accent-wash text-ink-secondary mt-4 flex max-w-lg items-start gap-2 rounded-[var(--radius-md)] border px-3.5 py-3 text-xs leading-relaxed"
        >
          <CircleCheck className="text-accent mt-px size-3.5 shrink-0" aria-hidden="true" />
          Your account is ready. Finish upgrading to Pro below — you picked{' '}
          {parseIntent(intent) === 'yearly' ? 'yearly' : 'monthly'} billing.
        </p>
      ) : null}

      {/* --- what this account is ------------------------------------------ */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="font-display text-ink text-2xl">{view.planName}</span>
        {view.statusLabel ? <Badge tone={view.statusTone}>{view.statusLabel}</Badge> : null}
        {entitlements.isFounding ? <Badge tone="accent">Founding</Badge> : null}
      </div>

      <p className="text-ink-secondary mt-3 max-w-lg text-sm leading-relaxed">
        {view.priceLabel ?? plan.tagline}
      </p>

      {/* Billing facts, and only the ones we actually hold. A row whose value
          is missing is omitted entirely rather than filled with a plausible
          date -- a wrong renewal date on an account screen is worse than none. */}
      {view.priceLabel || view.periodLabel ? (
        <dl className="mt-6 grid max-w-lg gap-2.5 text-sm">
          {view.priceLabel ? (
            <div className="border-line flex justify-between gap-6 border-b pb-2.5">
              <dt className="text-ink-muted">Billing</dt>
              <dd className="text-ink">{view.priceLabel}</dd>
            </div>
          ) : null}
          {view.periodLabel && entitlements.billing.currentPeriodEnd ? (
            <div className="border-line flex justify-between gap-6 border-b pb-2.5">
              <dt className="text-ink-muted">{view.periodLabel}</dt>
              <dd className="text-ink">
                {formatDate(entitlements.billing.currentPeriodEnd, timeZone)}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {view.notice ? (
        <p
          className={`mt-5 flex max-w-lg items-start gap-2 rounded-[var(--radius-md)] border px-3.5 py-3 text-xs leading-relaxed ${
            view.noticeTone === 'critical'
              ? 'border-critical/25 bg-critical-wash text-critical'
              : view.noticeTone === 'caution'
                ? 'border-caution/25 bg-caution-wash text-caution'
                : 'border-accent/25 bg-accent-wash text-ink-secondary'
          }`}
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {view.notice}
        </p>
      ) : null}

      {/* The Free highlights enumerate quotas -- "3 researched people and 3
          meeting briefs a month" -- which is not true of an account those
          quotas do not apply to. */}
      {entitlements.billable ? (
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
            Storing people, notes and observations is never metered — only the operations that cost
            real money to run.
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
                      {row.used} of {row.limit}
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

      {/* No payment control is offered to an account that cannot be billed.
          Nothing is hidden from them -- Compare plans is still reachable -- it
          is simply not a prompt an owner or a pilot needs. */}
      <div className="mt-10 flex flex-wrap items-start gap-2">
        {features.billing && view.showUpgrade ? (
          <>
            {/* Both intervals, here. Sending somebody who wants to pay yearly
                off to the pricing page to find the toggle is a detour on the
                one screen where they have already decided. The preselected
                intent, when there is one, leads. */}
            <UpgradeButton
              interval={preferred}
              label={`Upgrade to Pro — ${formatPrice(
                preferred === 'yearly' ? PLANS.pro.yearlyPriceCents : PLANS.pro.monthlyPriceCents,
              )} ${preferred === 'yearly' ? 'a year' : 'a month'}`}
            />
            <UpgradeButton
              interval={alternate}
              variant="secondary"
              label={`Or ${formatPrice(
                alternate === 'yearly' ? PLANS.pro.yearlyPriceCents : PLANS.pro.monthlyPriceCents,
              )} ${alternate === 'yearly' ? 'a year' : 'a month'}`}
            />
          </>
        ) : null}
        {features.billing && view.showManage ? <ManageBillingButton /> : null}
        <Button asChild variant="secondary" size="sm">
          <Link href="/pricing">Compare plans</Link>
        </Button>
      </div>

      {!features.billing && entitlements.billable ? (
        <p className="border-line bg-bg-sunken text-ink-muted mt-6 flex max-w-lg items-start gap-2 rounded-[var(--radius-md)] border px-3.5 py-3 text-xs leading-relaxed">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          Payments are not connected on this deployment, so upgrading is unavailable. Everything
          else works normally.
        </p>
      ) : null}

      {/* Quiet by design -- see components/app/invitation-panel. */}
      <InvitationPanel tier={entitlements.tier} />
    </div>
  )
}
