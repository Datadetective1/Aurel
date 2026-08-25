'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import {
  updatePreferences,
  updateProfile,
  type SettingsState,
} from '@/app/(app)/settings/actions'
import { Button } from '@/components/ui/button'
import { FormField, Input, OptionCard } from '@/components/ui/field'
import { Eyebrow } from '@/components/ui/primitives'
import { ThemePicker } from '@/components/theme-provider'
import { COACHING_STYLES } from '@/lib/onboarding'
import { brand } from '@/lib/brand'

export function SettingsForms({
  profile,
  preferences,
  email,
}: {
  profile: {
    fullName: string
    preferredName: string
    jobTitle: string
    company: string
    pronouns: string
    timezone: string
  }
  preferences: {
    theme: string
    coachingStyle: string
    emailNotifications: boolean
  }
  email: string
}) {
  return (
    <div className="grid gap-10">
      <ProfileForm profile={profile} email={email} />
      <PreferencesForm preferences={preferences} />
    </div>
  )
}

function ProfileForm({
  profile,
  email,
}: {
  profile: {
    fullName: string
    preferredName: string
    jobTitle: string
    company: string
    pronouns: string
    timezone: string
  }
  email: string
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(updateProfile, {})

  return (
    <form action={formAction} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="settings-fullName"
          label="Full name"
          required
          error={state.fieldErrors?.fullName?.[0]}
        >
          {(props) => <Input {...props} name="fullName" defaultValue={profile.fullName} maxLength={120} />}
        </FormField>

        <FormField id="settings-preferredName" label="Preferred name">
          {(props) => (
            <Input {...props} name="preferredName" defaultValue={profile.preferredName} maxLength={80} />
          )}
        </FormField>

        <FormField id="settings-jobTitle" label="Job title">
          {(props) => <Input {...props} name="jobTitle" defaultValue={profile.jobTitle} maxLength={120} />}
        </FormField>

        <FormField id="settings-company" label="Company">
          {(props) => <Input {...props} name="company" defaultValue={profile.company} maxLength={160} />}
        </FormField>

        <FormField id="settings-pronouns" label="Pronouns">
          {(props) => <Input {...props} name="pronouns" defaultValue={profile.pronouns} maxLength={40} />}
        </FormField>

        <FormField id="settings-timezone" label="Timezone">
          {(props) => <Input {...props} name="timezone" defaultValue={profile.timezone} maxLength={64} />}
        </FormField>

        <div className="sm:col-span-2">
          <p className="text-[0.8125rem] font-medium text-ink-secondary">Email</p>
          <p className="mt-1.5 text-sm text-ink">{email}</p>
          <p className="mt-1 text-xs text-ink-muted">
            Your sign-in address. Contact support to change it.
          </p>
        </div>
      </div>

      <SaveRow message={state.message} error={state.error} />
    </form>
  )
}

function PreferencesForm({
  preferences,
}: {
  preferences: { theme: string; coachingStyle: string; emailNotifications: boolean }
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(updatePreferences, {})
  const [theme, setTheme] = React.useState(preferences.theme)

  // Mirror the live next-themes value so the saved preference matches what the
  // user is actually looking at.
  React.useEffect(() => {
    const read = () => {
      const stored = localStorage.getItem('theme')
      if (stored) setTheme(stored === 'light' ? 'pearl' : stored === 'dark' ? 'obsidian' : 'system')
    }
    read()
    const id = window.setInterval(read, 400)
    return () => window.clearInterval(id)
  }, [])

  return (
    <form action={formAction}>
      <input type="hidden" name="theme" value={theme} />

      <Eyebrow>Appearance</Eyebrow>
      <ThemePicker className="mt-3" />

      <Eyebrow className="mt-8 block">Voice</Eyebrow>
      <p className="mt-2 text-xs leading-relaxed text-ink-muted">
        Changes tone and density only. It never hides a risk or softens a warning.
      </p>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {COACHING_STYLES.map((style) => (
          <OptionCard
            key={style.value}
            type="radio"
            name="coachingStyle"
            value={style.value}
            defaultChecked={style.value === preferences.coachingStyle}
            title={style.label}
            description={style.hint}
          />
        ))}
      </div>

      <Eyebrow className="mt-8 block">Email</Eyebrow>
      <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
        <input
          type="checkbox"
          name="emailNotifications"
          defaultChecked={preferences.emailNotifications}
          className="mt-0.5 size-4 shrink-0 appearance-none rounded-[3px] border border-line-strong bg-surface checked:border-accent checked:bg-accent"
        />
        <span>
          <span className="block text-sm font-medium text-ink">
            Send me useful {brand.name} email
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
            Meeting reminders when something is unprepared, and your weekly relationship summary.
            Never marketing.
          </span>
        </span>
      </label>

      <SaveRow message={state.message} error={state.error} />
    </form>
  )
}

function SaveRow({ message, error }: { message?: string; error?: string }) {
  const { pending } = useFormStatus()
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
        Save
      </Button>
      {message ? (
        <span role="status" className="text-xs text-positive">
          {message}
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="text-xs text-critical">
          {error}
        </span>
      ) : null}
    </div>
  )
}
