'use client'

import * as React from 'react'
import { useActionState } from 'react'
import {
  saveAppearance,
  saveCoaching,
  saveFrameworks,
  saveIntent,
} from '@/app/onboarding/actions'
import {
  COACHING_CONTEXTS,
  COACHING_STYLES,
  FRAMEWORKS,
  INTENTS,
  type StepState,
} from '@/lib/onboarding'
import { Input, OptionCard } from '@/components/ui/field'
import { ThemePicker } from '@/components/theme-provider'
import { Eyebrow } from '@/components/ui/primitives'
import { SkipButton, StepShell } from './step-shell'
import { brand } from '@/lib/brand'
import { cn } from '@/lib/utils'

/** Why did you sign up — used to choose what the app shows you first. */
export function IntentStep({ defaults }: { defaults: string[] }) {
  const [state, formAction] = useActionState<StepState, FormData>(saveIntent, {})
  const [selected, setSelected] = React.useState<string[]>(defaults)

  const toggle = (value: string, checked: boolean) => {
    setSelected((prev) =>
      checked ? [...prev, value].slice(0, 4) : prev.filter((v) => v !== value),
    )
  }

  return (
    <form action={formAction}>
      <StepShell
        title="What brought you here?"
        description="Pick up to three. This decides what Aurel puts in front of you first — it does not lock anything."
        skipAction={<SkipButton />}
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          {INTENTS.map((intent) => {
            const checked = selected.includes(intent.value)
            const atLimit = selected.length >= 3 && !checked
            return (
              <OptionCard
                key={intent.value}
                type="checkbox"
                name="intents"
                value={intent.value}
                checked={checked}
                onChange={(next) => !atLimit && toggle(intent.value, next)}
                title={intent.label}
                className={cn(atLimit && 'opacity-50')}
              />
            )
          })}
        </div>
        {state.error ? (
          <p role="alert" className="mt-4 text-xs text-critical">
            {state.error}
          </p>
        ) : null}
      </StepShell>
    </form>
  )
}

/**
 * Prior frameworks.
 * Captured strictly as user-supplied context. Aurel does not implement, score
 * or validate any of these instruments, and the copy says so plainly.
 */
export function FrameworksStep({ defaults }: { defaults: Record<string, { result?: string }> }) {
  const [state, formAction] = useActionState<StepState, FormData>(saveFrameworks, {})
  const [selected, setSelected] = React.useState<string[]>(Object.keys(defaults))

  const toggle = (value: string, checked: boolean) => {
    setSelected((prev) => {
      if (value === 'none') return checked ? ['none'] : []
      const next = checked ? [...prev, value] : prev.filter((v) => v !== value)
      return next.filter((v) => v !== 'none')
    })
  }

  return (
    <form action={formAction}>
      <StepShell
        title="Taken anything like this before?"
        description="Optional. If you already know your results, Aurel will keep them alongside your profile as context."
        skipAction={<SkipButton />}
        note={`These are other people's instruments. ${brand.name} does not administer, score or validate them — it simply remembers what you told it.`}
      >
        <div className="grid gap-2.5">
          {FRAMEWORKS.map((framework) => {
            const checked = selected.includes(framework.value)
            return (
              <div key={framework.value}>
                <OptionCard
                  type="checkbox"
                  name="frameworks"
                  value={framework.value}
                  checked={checked}
                  onChange={(next) => toggle(framework.value, next)}
                  title={framework.label}
                />
                {checked && framework.value !== 'none' ? (
                  <div className="mt-2 pl-7">
                    <Input
                      name={`result_${framework.value}`}
                      defaultValue={defaults[framework.value]?.result ?? ''}
                      placeholder="Your result, if you remember it"
                      aria-label={`Your ${framework.label} result`}
                      maxLength={120}
                      className="h-9 text-[0.8125rem]"
                    />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
        {state.error ? (
          <p role="alert" className="mt-4 text-xs text-critical">
            {state.error}
          </p>
        ) : null}
      </StepShell>
    </form>
  )
}

/** Coaching context — used only to set tone. */
export function CoachingStep({ defaults }: { defaults: string[] }) {
  const [state, formAction] = useActionState<StepState, FormData>(saveCoaching, {})
  const [selected, setSelected] = React.useState<string[]>(defaults)

  const toggle = (value: string, checked: boolean) => {
    setSelected((prev) => {
      if (value === 'none') return checked ? ['none'] : []
      const next = checked ? [...prev, value] : prev.filter((v) => v !== value)
      return next.filter((v) => v !== 'none')
    })
  }

  return (
    <form action={formAction}>
      <StepShell
        title="Have you worked with a coach?"
        description="Optional, and only used to pitch the tone. Select anything that applies."
        skipAction={<SkipButton />}
      >
        <div className="grid gap-2.5">
          {COACHING_CONTEXTS.map((context) => (
            <OptionCard
              key={context.value}
              type="checkbox"
              name="coaching"
              value={context.value}
              checked={selected.includes(context.value)}
              onChange={(next) => toggle(context.value, next)}
              title={context.label}
            />
          ))}
        </div>
        {state.error ? (
          <p role="alert" className="mt-4 text-xs text-critical">
            {state.error}
          </p>
        ) : null}
      </StepShell>
    </form>
  )
}

/** Appearance + voice. The theme choice is previewed with real surfaces. */
export function AppearanceStep({
  defaultTheme,
  defaultStyle,
}: {
  defaultTheme: string
  defaultStyle: string
}) {
  const [state, formAction] = useActionState<StepState, FormData>(saveAppearance, {})
  // Mirror next-themes' current value into a hidden field so the server stores
  // the same choice the user is looking at.
  const [theme, setTheme] = React.useState(defaultTheme)

  React.useEffect(() => {
    const read = () => {
      const stored = localStorage.getItem('theme')
      if (stored) setTheme(stored === 'light' ? 'pearl' : stored === 'dark' ? 'obsidian' : 'system')
    }
    read()
    const id = window.setInterval(read, 250)
    return () => window.clearInterval(id)
  }, [])

  return (
    <form action={formAction}>
      <StepShell
        title={`How should ${brand.name} look and sound?`}
        description="Both are changeable at any time in Settings."
        submitLabel={`Start my ${brand.assessmentName.toLowerCase()}`}
      >
        <input type="hidden" name="theme" value={theme} />

        <Eyebrow className="block">Appearance</Eyebrow>
        <ThemePicker className="mt-3" />

        <Eyebrow className="mt-9 block">Voice</Eyebrow>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          This changes tone and density only. It never hides a risk or softens a warning.
        </p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {COACHING_STYLES.map((style) => (
            <OptionCard
              key={style.value}
              type="radio"
              name="coachingStyle"
              value={style.value}
              defaultChecked={style.value === defaultStyle}
              title={style.label}
              description={style.hint}
            />
          ))}
        </div>

        {state.error ? (
          <p role="alert" className="mt-4 text-xs text-critical">
            {state.error}
          </p>
        ) : null}
      </StepShell>
    </form>
  )
}
