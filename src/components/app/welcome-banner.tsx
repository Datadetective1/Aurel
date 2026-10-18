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
        'border-accent/25 bg-accent-wash relative overflow-hidden rounded-[var(--radius-lg)] border p-6',
        className,
      )}
    >
      <Button
        variant="quiet"
        size="icon-sm"
        onClick={dismiss}
        aria-label="Dismiss welcome message"
        className="absolute top-1 right-1 size-11"
      >
        <X className="size-3.5" aria-hidden="true" />
      </Button>

      <ApertureMark className="text-accent size-5" />
      <h2 className="font-display text-ink mt-3 pr-8 text-xl">
        Welcome to {brand.name}, {name}.
      </h2>
      {/* Points at Getting Started rather than restating it: one sequence,
          told once, in the same words as the welcome email. */}
      <p className="text-ink-secondary mt-2 max-w-lg text-sm leading-relaxed">
        It is empty right now, and that is expected. Find one meeting, choose who it is with, and
        prepare it — the steps are just below.
      </p>
    </div>
  )
}
