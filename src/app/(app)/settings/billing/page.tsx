import Link from 'next/link'
import type { Metadata } from 'next'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Eyebrow } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { getEntitlements, usageInPeriod } from '@/lib/billing/entitlements'
import {
  FOUNDING_OFFER,
  PLANS,
  foundingProtectionBlurb,
  formatPrice,
  type MeterKind,
} from '@/lib/billing/plans'
import { foundingPlacesRemaining } from './actions'
import { ManageBillingButton, UpgradeButton } from '@/components/app/billing-actions'
import { InvitationPanel } from '@/components/app/invitation-panel'
import { hasFullAccess } from '@/lib/billing/access'
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
          Thank you. Your plan changes as soon as the payment is confirmed — usually within seconds.
          Reload if this page still shows the old plan.
        </p>
      ) : null}

      {checkout === 'canceled' ? (
        <p className="text-ink-muted mt-4 max-w-lg text-xs leading-relaxed">
          Checkout was canceled and nothing was charged.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="font-display text-ink text-2xl">{plan.name}</span>
        {entitlements.isFounding ? <Badge tone="accent">Founding</Badge> : null}
        {plan.monthlyPriceCents ? (
          <span className="text-ink-secondary text-sm">
            {formatPrice(plan.monthlyPriceCents)} per month
          </span>
        ) : null}
      </div>

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

      {/* No upgrade path is offered to an account that already has everything.
          Nothing here is hidden from them -- Compare plans is still reachable
          from the marketing site -- it is simply not a prompt they need. */}
      <div className={fullAccess ? 'hidden' : 'mt-10 flex flex-wrap items-start gap-2'}>
        {features.billing && entitlements.plan === 'free' ? (
          <UpgradeButton
            label={
              FOUNDING_OFFER.enabled && (founding === null || founding > 0)
                ? `Upgrade to ${FOUNDING_OFFER.label} — ${formatPrice(FOUNDING_OFFER.monthlyPriceCents)} a month`
                : 'Upgrade to Pro'
            }
          />
        ) : null}
        <Button asChild variant="secondary" size="sm">
          <Link href="/pricing">Compare plans</Link>
        </Button>
      </div>

      {/* Anyone paying can always reach billing to change or cancel it -- an
          owner or pilot grant included. Hiding this row for full-access
          accounts also hid the only way a paying pilot could cancel. */}
      {features.billing && entitlements.plan !== 'free' ? (
        <div className={fullAccess ? 'mt-10' : 'mt-2'}>
          <ManageBillingButton />
        </div>
      ) : null}

      {/* Only where someone could actually take a place. Advertising scarcity on
          a deployment that cannot sell is a claim with nothing behind it. */}
      {features.billing && founding !== null && founding > 0 && entitlements.plan === 'free' ? (
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

      {!features.billing ? (
        <p className="border-line bg-bg-sunken text-ink-muted mt-6 flex max-w-lg items-start gap-2 rounded-[var(--radius-md)] border px-3.5 py-3 text-xs leading-relaxed">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          Upgrading is not available yet. Everything else works normally.
        </p>
      ) : null}

      {/* Quiet by design -- see components/app/invitation-panel. */}
      <InvitationPanel tier={entitlements.tier} />
    </div>
  )
}
