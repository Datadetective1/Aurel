'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { choosePlan, type BillingState } from '@/app/(app)/settings/billing/actions'
import {
  PLANS,
  annualSavingPercent,
  formatPrice,
  monthlyEquivalentCents,
  type BillingInterval,
} from '@/lib/billing/plans'

/**
 * The paid plan, and the choice between paying monthly and paying for a year.
 *
 * Monthly is preselected. It is the smaller commitment and the one somebody
 * evaluating the product should be nudged toward; the annual saving is stated
 * rather than sold.
 *
 * The action behind the button figures out who is clicking. The page around
 * this component is statically rendered and must stay that way — it is the
 * page search engines read — so it cannot itself ask whether there is a
 * session. `choosePlan` does that server-side and routes to Stripe, to
 * onboarding, or to signup accordingly.
 */
export function PlanSelector({
  className,
  children,
}: {
  /** The plan's feature list. Rendered between the price and the button so the
   *  card keeps the shape of the two beside it, whose buttons sit at the foot. */
  children?: React.ReactNode
  className?: string
}) {
  const [interval, setInterval] = React.useState<BillingInterval>('monthly')
  const [state, formAction] = useActionState<BillingState, FormData>(choosePlan, {})

  const pro = PLANS.pro
  const saving = annualSavingPercent(pro)
  const perMonth = monthlyEquivalentCents(pro)

  return (
    <div className={['flex flex-1 flex-col', className].filter(Boolean).join(' ')}>
      <IntervalToggle value={interval} onChange={setInterval} saving={saving} />

      <div className="mt-6 flex items-baseline gap-3">
        <p className="font-display text-ink text-4xl">
          {formatPrice(interval === 'yearly' ? pro.yearlyPriceCents : pro.monthlyPriceCents)}
        </p>
        <span className="text-ink-muted text-sm">
          {interval === 'yearly' ? 'per year' : 'per month'}
        </span>
      </div>

      {/* Two prices a year apart are hard to compare, and the comparison is the
          entire argument for paying annually. */}
      <p className="text-ink-secondary mt-1 min-h-[1.25rem] text-xs">
        {interval === 'yearly'
          ? perMonth
            ? `${formatPrice(perMonth)} a month, billed once a year.`
            : null
          : saving
            ? `Or ${formatPrice(pro.yearlyPriceCents)} a year and save ${saving}%.`
            : null}
      </p>

      {children ? <div className="mt-7 flex-1">{children}</div> : null}

      <form action={formAction} className="mt-8">
        <input type="hidden" name="interval" value={interval} />
        <SubmitButton label={interval === 'yearly' ? 'Get Pro, billed yearly' : 'Get Pro'} />
        {state.error ? (
          <p role="alert" className="text-critical mt-2 text-xs leading-relaxed">
            {state.error}
          </p>
        ) : null}
      </form>

      <p className="text-ink-muted mt-2.5 text-xs">Cancel any time. No invitation needed.</p>
    </div>
  )
}

/**
 * A two-option segmented control.
 *
 * Radios rather than buttons: this is a choice between two mutually exclusive
 * options, and a radio group is what a screen reader announces as one. Two
 * buttons would be announced as two unrelated controls with no indication that
 * picking one unpicks the other.
 */
function IntervalToggle({
  value,
  onChange,
  saving,
}: {
  value: BillingInterval
  onChange: (next: BillingInterval) => void
  saving: number | null
}) {
  return (
    <fieldset className="border-line bg-bg-sunken inline-flex rounded-full border p-0.5">
      <legend className="sr-only">Billing period</legend>
      {(['monthly', 'yearly'] as const).map((option) => {
        const selected = value === option
        return (
          <label
            key={option}
            className={[
              'cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
              'focus-within:outline-accent focus-within:outline focus-within:outline-2 focus-within:outline-offset-2',
              selected ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
            ].join(' ')}
          >
            <input
              type="radio"
              name="billing-period"
              value={option}
              checked={selected}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            {option === 'monthly' ? 'Monthly' : 'Yearly'}
            {option === 'yearly' && saving ? (
              <span className="text-accent ml-1.5">−{saving}%</span>
            ) : null}
          </label>
        )
      })}
    </fieldset>
  )
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Opening Stripe…
        </>
      ) : (
        <>
          {label}
          <ArrowRight className="size-4" aria-hidden="true" />
        </>
      )}
    </Button>
  )
}
