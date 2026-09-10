'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import {
  updatePreferences,
  updateProfile,
  type SettingsState,
  sendFollowThroughNow,
} from '@/app/(app)/settings/actions'
import { Button } from '@/components/ui/button'
import { FormField, Input, OptionCard } from '@/components/ui/field'
import { Eyebrow } from '@/components/ui/primitives'
import { ThemePicker } from '@/components/theme-provider'
import { TimezoneField } from '@/components/app/timezone-field'
import { COACHING_STYLES } from '@/lib/onboarding'
import { brand } from '@/lib/brand'
import { cn } from '@/lib/utils'
import { hourLabel } from '@/lib/follow-through/schedule'

export function ProfileSettingsForm({
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
          {(props) => (
            <Input {...props} name="fullName" defaultValue={profile.fullName} maxLength={120} />
          )}
        </FormField>

        <FormField id="settings-preferredName" label="Preferred name">
          {(props) => (
            <Input
              {...props}
              name="preferredName"
              defaultValue={profile.preferredName}
              maxLength={80}
            />
          )}
        </FormField>

        <FormField id="settings-jobTitle" label="Job title">
          {(props) => (
            <Input {...props} name="jobTitle" defaultValue={profile.jobTitle} maxLength={120} />
          )}
        </FormField>

        <FormField id="settings-company" label="Company">
          {(props) => (
            <Input {...props} name="company" defaultValue={profile.company} maxLength={160} />
          )}
        </FormField>

        <FormField id="settings-pronouns" label="Pronouns">
          {(props) => (
            <Input {...props} name="pronouns" defaultValue={profile.pronouns} maxLength={40} />
          )}
        </FormField>

        <TimezoneField id="settings-timezone" name="timezone" defaultValue={profile.timezone} />

        <div className="sm:col-span-2">
          <p className="text-ink-secondary text-[0.8125rem] font-medium">Email</p>
          <p className="text-ink mt-1.5 text-sm">{email}</p>
          <p className="text-ink-muted mt-1 text-xs">
            Your sign-in address. Contact support to change it.
          </p>
        </div>
      </div>

      <SaveRow message={state.message} error={state.error} />
    </form>
  )
}

export function PreferencesSettingsForm({
  preferences,
  followThrough,
}: {
  preferences: {
    theme: string
    coachingStyle: string
    emailNotifications: boolean
    followThroughEmail: boolean
    followThroughHour: number
  }
  followThrough: {
    /** A provider is configured, so the email can actually arrive. */
    deliveryConfigured: boolean
    /** The scheduled job can run on this deployment. */
    scheduled: boolean
    lastSentLabel: string | null
  }
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(updatePreferences, {})
  const [theme, setTheme] = React.useState(preferences.theme)
  const [emailOn, setEmailOn] = React.useState(preferences.emailNotifications)
  const [followOn, setFollowOn] = React.useState(preferences.followThroughEmail)

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
      <p className="text-ink-muted mt-2 text-xs leading-relaxed">
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
      <label className="border-line bg-surface mt-3 flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-4">
        <input
          type="checkbox"
          name="emailNotifications"
          checked={emailOn}
          onChange={(e) => setEmailOn(e.currentTarget.checked)}
          className="border-line-strong bg-surface checked:border-accent checked:bg-accent mt-0.5 size-4 shrink-0 appearance-none rounded-[3px] border"
        />
        <span>
          <span className="text-ink block text-sm font-medium">
            Send me useful {brand.name} email
          </span>
          <span className="text-ink-muted mt-0.5 block text-xs leading-relaxed">
            The daily follow-through below, meeting reminders when something is unprepared, and your
            weekly relationship summary. Never marketing.
          </span>
        </span>
      </label>

      {/* The follow-through. One switch and one hour, under the master switch
          it depends on. Not a notification centre. */}
      <label
        className={cn(
          'border-line bg-surface mt-2 flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-4',
          !emailOn && 'opacity-60',
        )}
      >
        <input
          type="checkbox"
          name="followThroughEmail"
          checked={followOn}
          disabled={!emailOn}
          onChange={(e) => setFollowOn(e.currentTarget.checked)}
          className="border-line-strong bg-surface checked:border-accent checked:bg-accent mt-0.5 size-4 shrink-0 appearance-none rounded-[3px] border"
        />
        <span className="min-w-0 flex-1">
          <span className="text-ink block text-sm font-medium">Daily follow-through</span>
          <span className="text-ink-muted mt-0.5 block text-xs leading-relaxed">
            One short email on days something you confirmed is due, overdue, or waiting on someone.
            Nothing on quiet days. It says who owes what, and each line opens the loop.
          </span>
          {followOn && emailOn ? (
            <span className="text-ink-secondary mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span>Around</span>
              <select
                name="followThroughHour"
                defaultValue={preferences.followThroughHour}
                aria-label="Delivery hour"
                className="border-line-strong bg-surface text-ink h-9 rounded-[var(--radius-sm)] border px-2 text-xs"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
              <span>where you are.</span>
              {!followThrough.scheduled ? (
                <span className="text-ink-muted">
                  This deployment sends once a day, so the hour is a preference for now.
                </span>
              ) : null}
            </span>
          ) : null}
          {followThrough.lastSentLabel ? (
            <span className="text-ink-faint mt-2 block text-xs">
              Last sent {followThrough.lastSentLabel}.
            </span>
          ) : null}
        </span>
      </label>
      {emailOn && followOn ? <SendNowRow configured={followThrough.deliveryConfigured} /> : null}

      <SaveRow message={state.message} error={state.error} />
    </form>
  )
}

/**
 * "Send it to me now." The honest preview: the real email, to the real
 * address, built from today's real loops. Does not touch the day's schedule.
 */
function SendNowRow({ configured }: { configured: boolean }) {
  const [pending, setPending] = React.useState(false)
  const [result, setResult] = React.useState<SettingsState | null>(null)

  const send = async () => {
    setPending(true)
    setResult(await sendFollowThroughNow())
    setPending(false)
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 px-1">
      <Button type="button" variant="ghost" size="sm" onClick={send} disabled={pending}>
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
        Send today&rsquo;s to me now
      </Button>
      {!configured ? (
        <span className="text-ink-muted text-xs">
          Email delivery is not configured on this deployment.
        </span>
      ) : null}
      {result?.message ? (
        <span role="status" className="text-positive text-xs">
          {result.message}
        </span>
      ) : null}
      {result?.error ? (
        <span role="alert" className="text-critical text-xs">
          {result.error}
        </span>
      ) : null}
    </div>
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
        <span role="status" className="text-positive text-xs">
          {message}
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="text-critical text-xs">
          {error}
        </span>
      ) : null}
    </div>
  )
}
