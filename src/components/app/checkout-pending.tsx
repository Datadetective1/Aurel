'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

/**
 * After a successful checkout, the plan changes when Stripe's webhook lands --
 * usually a few seconds after the redirect. This refreshes the page a handful
 * of times so the new plan appears on its own, then stops. It renders nothing
 * and never changes a plan itself; the webhook is the only thing that can.
 */
export function CheckoutPending({
  attempts = 10,
  intervalMs = 3000,
}: {
  attempts?: number
  intervalMs?: number
}) {
  const router = useRouter()
  React.useEffect(() => {
    let count = 0
    const timer = window.setInterval(() => {
      count += 1
      router.refresh()
      if (count >= attempts) window.clearInterval(timer)
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [attempts, intervalMs, router])
  return null
}
