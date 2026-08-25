'use client'

import * as React from 'react'
import { ThemeProvider as NextThemes, useTheme } from 'next-themes'
import { useHasMounted } from '@/lib/use-has-mounted'
import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Theming.
 *
 * Two committed themes plus System:
 *   PEARL    warm ivory, editorial     (light)
 *   OBSIDIAN graphite, cinematic       (dark)
 *
 * next-themes writes `class="dark"` on <html> before paint, which is why the
 * root element carries suppressHydrationWarning — the class legitimately differs
 * between server and client render.
 */

export const THEMES = [
  { value: 'light', label: 'Pearl', description: 'Warm ivory. Reads like paper.', icon: Sun },
  { value: 'dark', label: 'Obsidian', description: 'Graphite. Easier at night.', icon: Moon },
  { value: 'system', label: 'System', description: 'Follows your device.', icon: Monitor },
] as const

export type ThemeValue = (typeof THEMES)[number]['value']

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  )
}

/** Compact segmented theme switch for headers and settings. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const mounted = useHasMounted()

  return (
    <div
      className={cn('inline-flex rounded-full border border-line bg-surface p-0.5', className)}
      role="radiogroup"
      aria-label="Theme"
    >
      {THEMES.map(({ value, label, icon: Icon }) => {
        // Before mount the resolved theme is unknown; render unselected rather
        // than guessing, so the control never flickers to the wrong state.
        const selected = mounted && theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            onClick={() => setTheme(value)}
            className={cn(
              'inline-flex size-7 items-center justify-center rounded-full transition-colors duration-150',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
              selected ? 'bg-accent-wash text-accent' : 'text-ink-faint hover:text-ink-secondary',
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}

/**
 * Large previewable theme picker used in onboarding. Shows a miniature of the
 * actual surface rather than a colour swatch, so the choice is made on how the
 * product will really look.
 */
export function ThemePicker({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const mounted = useHasMounted()

  return (
    <div className={cn('grid gap-3 sm:grid-cols-3', className)} role="radiogroup" aria-label="Appearance">
      {THEMES.map(({ value, label, description }) => {
        const selected = mounted && theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(value)}
            className={cn(
              'group rounded-[var(--radius-lg)] border p-3 text-left transition-colors duration-200',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
              selected ? 'border-accent bg-accent-wash' : 'border-line hover:border-line-strong',
            )}
          >
            <ThemeMiniature variant={value} />
            <span className="mt-3 block text-sm font-medium text-ink">{label}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{description}</span>
          </button>
        )
      })}
    </div>
  )
}

/** A miniature of a real Atturel surface, drawn with fixed colours per theme. */
function ThemeMiniature({ variant }: { variant: ThemeValue }) {
  if (variant === 'system') {
    return (
      <span className="relative block h-20 w-full overflow-hidden rounded-[var(--radius-md)] border border-line">
        <span className="absolute inset-0 flex">
          <span className="w-1/2 overflow-hidden">
            <Miniature bg="#fbf9f6" line="#e7e2d9" ink="#1a1815" accent="#b5893f" />
          </span>
          <span className="w-1/2 overflow-hidden">
            <Miniature bg="#0d0d0f" line="#26262b" ink="#f2efe9" accent="#d9b074" />
          </span>
        </span>
      </span>
    )
  }
  return (
    <span className="block h-20 w-full overflow-hidden rounded-[var(--radius-md)] border border-line">
      {variant === 'dark' ? (
        <Miniature bg="#0d0d0f" line="#26262b" ink="#f2efe9" accent="#d9b074" />
      ) : (
        <Miniature bg="#fbf9f6" line="#e7e2d9" ink="#1a1815" accent="#b5893f" />
      )}
    </span>
  )
}

function Miniature({
  bg,
  line,
  ink,
  accent,
}: {
  bg: string
  line: string
  ink: string
  accent: string
}) {
  return (
    <svg viewBox="0 0 120 80" className="h-full w-full" aria-hidden="true" preserveAspectRatio="none">
      <rect width="120" height="80" fill={bg} />
      <path d="M18 62 V44 a24 24 0 0 1 48 0 V62" stroke={accent} strokeWidth="1" fill="none" opacity="0.5" />
      <rect x="12" y="14" width="34" height="4" rx="2" fill={ink} opacity="0.85" />
      <rect x="12" y="24" width="70" height="3" rx="1.5" fill={ink} opacity="0.3" />
      <rect x="12" y="31" width="58" height="3" rx="1.5" fill={ink} opacity="0.3" />
      <rect x="12" y="46" width="96" height="1" fill={line} />
      <rect x="12" y="54" width="26" height="8" rx="3" fill={ink} opacity="0.9" />
      <circle cx="100" cy="18" r="4" fill={accent} opacity="0.8" />
    </svg>
  )
}
