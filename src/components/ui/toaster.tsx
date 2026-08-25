'use client'

import { useTheme } from 'next-themes'
import { Toaster as Sonner } from 'sonner'

/** Toasts, themed to Atturel surfaces rather than Sonner defaults. */
export function Toaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Sonner
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'group rounded-[var(--radius-md)] border border-line bg-surface text-ink text-sm elevate',
          description: 'text-ink-muted',
          actionButton: 'bg-surface-inverse text-ink-inverse',
          cancelButton: 'bg-bg-sunken text-ink-secondary',
          error: 'border-critical/30',
          success: 'border-positive/30',
        },
      }}
    />
  )
}
