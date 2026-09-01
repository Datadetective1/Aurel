'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CircleCheck, Loader2 } from 'lucide-react'
import { reconcileSubscription } from '@/app/(app)/settings/billing/actions'
import { brand } from '@/lib/brand'

/**
 * What somebody sees in the second after they come back from Stripe.
 *
 * The redirect is not proof of payment — anybody can type the success URL — so
 * this does not celebrate on the strength of a query parameter. It asks the
 * server to go and ask STRIPE what this customer's subscription actually is,
 * and reports what came back.
 *
 * That call is also what closes the gap the webhook leaves. The webhook is the
 * authority and usually wins the race, but it is asynchronous and invisible,
 * and a customer who has just been charged should not be reading the word
 * "Free" on their own account screen while they wait for a delivery they have
 * no way to observe. Both writers go through the same ordered, idempotent
 * database function, so whichever lands second cannot undo the first.
 */
export function CheckoutReturn({ alreadyPro }: { alreadyPro: boolean }) {
  const router = useRouter()
  const [state, setState] = React.useState<'checking' | 'confirmed' | 'pending'>(
    alreadyPro ? 'confirmed' : 'checking',
  )

  React.useEffect(() => {
    if (alreadyPro) return
    let cancelled = false

    reconcileSubscription()
      .then((result) => {
        if (cancelled) return
        if (result.plan !== 'free') {
          setState('confirmed')
          // The page was rendered before the write. Refresh so the plan, price
          // and renewal date below this banner are the new ones.
          router.refresh()
        } else {
          setState('pending')
        }
      })
      .catch(() => {
        if (!cancelled) setState('pending')
      })

    return () => {
      cancelled = true
    }
  }, [alreadyPro, router])

  if (state === 'checking') {
    return (
      <Banner tone="neutral" role="status">
        <Loader2 className="mt-px size-3.5 shrink-0 animate-spin" aria-hidden="true" />
        Confirming your payment with Stripe…
      </Banner>
    )
  }

  if (state === 'pending') {
    return (
      <Banner tone="caution" role="status">
        <span>
          Payment received. Stripe has not confirmed the subscription to us yet — this usually takes
          a few seconds. Reload this page in a moment; nothing is lost if you close it.
        </span>
      </Banner>
    )
  }

  return (
    <Banner tone="positive" role="status">
      <CircleCheck className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      You are on {brand.name} Pro. People and relationship memory are now unlimited, transcript
      analysis is on, and every monthly limit has gone up.
    </Banner>
  )
}

function Banner({
  tone,
  role,
  children,
}: {
  tone: 'neutral' | 'positive' | 'caution'
  role?: string
  children: React.ReactNode
}) {
  const tones = {
    neutral: 'border-line bg-bg-sunken text-ink-secondary',
    positive: 'border-positive/25 bg-positive-wash text-positive',
    caution: 'border-caution/25 bg-caution-wash text-caution',
  } as const

  return (
    <p
      role={role}
      className={`mt-4 flex max-w-lg items-start gap-2 rounded-[var(--radius-md)] border px-3.5 py-3 text-xs leading-relaxed ${tones[tone]}`}
    >
      {children}
    </p>
  )
}
