import Link from 'next/link'
import type { Metadata } from 'next'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Eyebrow } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { getEntitlements, usageInPeriod } from '@/lib/billing/entitlements'
import { FOUNDING_OFFER, PLANS, formatPrice, type MeterKind } from '@/lib/billing/plans'
import { foundingPlacesRemaining } from './actions'
import { ManageBillingButton, UpgradeButton } from '@/components/app/billing-actions'
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

export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>
}) {
  await requireOnboardedUser()
  const { checkout } = await searchParams
  const entitlements = await getEntitlements()
  const plan = PLANS[entitlements.plan]
  const founding = await foundingPlacesRemaining()

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

  return (
    <div>
      <Eyebrow>Plan</Eyebrow>

      {checkout === 'success' ? (
        <p
          role="status"
          className="mt-4 flex max-w-lg items-start gap-2 rounded-[var(--radius-md)] border border-positive/25 bg-positive-wash px-3.5 py-3 text-xs leading-relaxed text-positive"
        >
          <CircleCheck className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          Payment received. Your plan updates the moment Stripe confirms it — usually within
          seconds. Reload if this page still shows the old plan.
        </p>
      ) : null}

      {checkout === 'canceled' ? (
        <p className="mt-4 max-w-lg text-xs leading-relaxed text-ink-muted">
          Checkout was canceled and nothing was charged.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="font-display text-2xl text-ink">{plan.name}</span>
        {entitlements.isFounding ? <Badge tone="accent">Founding</Badge> : null}
        {plan.monthlyPriceCents ? (
          <span className="text-sm text-ink-secondary">
            {formatPrice(plan.monthlyPriceCents)} per month
          </span>
        ) : null}
      </div>

      <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-secondary">{plan.tagline}</p>

      <ul className="mt-6 grid gap-2.5">
        {plan.highlights.map((item) => (
          <li key={item} className="flex gap-2.5 text-sm text-ink-secondary">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>

      {usage.length > 0 ? (
        <section className="mt-10">
          <Eyebrow>This month</Eyebrow>
          <p className="mt-2 max-w-lg text-xs leading-relaxed text-ink-muted">
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
                    <span className="text-sm text-ink">{METER_LABEL[row.kind]}</span>
                    <span className="text-xs tabular-nums text-ink-muted">
                      {row.used} of {row.limit}
                    </span>
                  </div>
                  <div
                    className="mt-1.5 h-px w-full overflow-hidden bg-line"
                    role="progressbar"
                    aria-valuenow={row.used}
                    aria-valuemin={0}
                    aria-valuemax={row.limit}
                    aria-label={METER_LABEL[row.kind]}
                  >
                    <div
                      className={exhausted ? 'h-full bg-critical' : 'h-full bg-accent-graphic'}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="mt-4 text-xs text-ink-faint">Resets on the 1st.</p>
        </section>
      ) : null}

      <div className="mt-10 flex flex-wrap items-start gap-2">
        {features.billing && entitlements.plan === 'free' ? (
          <UpgradeButton
            label={
              founding !== null && founding > 0
                ? `Upgrade at the founding price — ${formatPrice(FOUNDING_OFFER.monthlyPriceCents)}`
                : 'Upgrade to Pro'
            }
          />
        ) : null}
        {features.billing && entitlements.plan !== 'free' ? <ManageBillingButton /> : null}
        <Button asChild variant="secondary" size="sm">
          <Link href="/pricing">Compare plans</Link>
        </Button>
      </div>

      {/* Only where someone could actually take a place. Advertising scarcity on
          a deployment that cannot sell is a claim with nothing behind it. */}
      {features.billing && founding !== null && founding > 0 && entitlements.plan === 'free' ? (
        <p className="mt-3 text-xs text-ink-muted">
          {founding} founding {founding === 1 ? 'place' : 'places'} left. {FOUNDING_OFFER.blurb}
        </p>
      ) : null}

      {entitlements.isFounding ? (
        <p className="mt-3 text-xs text-ink-muted">
          You joined as a founding customer. {FOUNDING_OFFER.blurb}
        </p>
      ) : null}

      {!features.billing ? (
        <p className="mt-6 flex max-w-lg items-start gap-2 rounded-[var(--radius-md)] border border-line bg-bg-sunken px-3.5 py-3 text-xs leading-relaxed text-ink-muted">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          Payments are not connected on this deployment, so upgrading is unavailable. Everything else
          works normally.
        </p>
      ) : null}

      {/* Quiet by design -- see components/app/invitation-panel. */}
      <InvitationPanel tier={entitlements.tier} />
    </div>
  )
}
