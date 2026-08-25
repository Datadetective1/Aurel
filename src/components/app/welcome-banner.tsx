'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { ApertureMark } from '@/components/brand/aperture'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { brand } from '@/lib/brand'

/** One-time greeting after onboarding. Dismissing clears the query param. */
export function WelcomeBanner({ name, className }: { name: string; className?: string }) {
  const router = useRouter()
  const [visible, setVisible] = React.useState(true)
  if (!visible) return null

  const dismiss = () => {
    setVisible(false)
    router.replace('/today')
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[var(--radius-lg)] border border-accent/25 bg-accent-wash p-6',
        className,
      )}
    >
      <Button
        variant="quiet"
        size="icon-sm"
        onClick={dismiss}
        aria-label="Dismiss welcome message"
        className="absolute right-2 top-2"
      >
        <X className="size-3.5" aria-hidden="true" />
      </Button>

      <ApertureMark className="size-5 text-accent" />
      <h2 className="mt-3 font-display text-xl text-ink">
        Your profile is saved, {name}.
      </h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-secondary">
        {brand.name} is nearly empty right now, and that is expected. Add one person you work with
        often, then prepare for your next conversation with them — that is where this starts paying
        off.
      </p>
    </div>
  )
}
