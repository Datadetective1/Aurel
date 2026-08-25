'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { saveAbout } from '@/app/onboarding/actions'
import { type StepState } from '@/lib/onboarding'
import { FormField, Input, Select } from '@/components/ui/field'
import { StepShell } from './step-shell'
import { Avatar } from '@/components/ui/avatar'
import { useHasMounted } from '@/lib/use-has-mounted'
import { brand } from '@/lib/brand'

const FUNCTIONS = [
  'Engineering',
  'Product',
  'Design',
  'Sales',
  'Marketing',
  'Finance',
  'Operations',
  'People / HR',
  'Legal',
  'Customer Success',
  'Consulting',
  'Executive',
  'Other',
]

const SENIORITY = [
  'Individual contributor',
  'Team lead',
  'Manager',
  'Senior manager',
  'Director',
  'VP',
  'C-level',
  'Founder',
  'Other',
]

export function AboutForm({
  defaults,
}: {
  defaults: {
    fullName: string
    preferredName: string
    jobTitle: string
    company: string
    jobFunction: string
    seniority: string
    pronouns: string
    timezone: string
  }
}) {
  const [state, formAction] = useActionState<StepState, FormData>(saveAbout, {})
  const [name, setName] = React.useState(defaults.fullName)
  const [preferred, setPreferred] = React.useState(defaults.preferredName)

  // The browser timezone is only knowable after hydration, so it is DERIVED
  // from the mount state rather than written back through an effect. `override`
  // holds an explicit user choice, which always wins.
  const mounted = useHasMounted()
  const [override, setOverride] = React.useState<string | null>(null)
  const browserTimezone = mounted ? Intl.DateTimeFormat().resolvedOptions().timeZone : ''
  const timezone = override ?? defaults.timezone ?? browserTimezone ?? 'UTC'

  const timezones = React.useMemo(() => {
    const supported =
      typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC']
    return supported
  }, [])

  return (
    <form action={formAction} noValidate>
      <StepShell
        title="Tell us about you"
        description="Only what makes the guidance specific to your role. Nothing here is shared with anyone."
        note={`${brand.name} never asks for anything about your colleagues' personal characteristics, and it will not infer them.`}
      >
        <div className="border-line bg-surface flex items-center gap-4 rounded-[var(--radius-lg)] border p-4">
          <Avatar name={preferred || name || '?'} size="lg" />
          <div className="min-w-0">
            <p className="text-ink text-sm font-medium">{preferred || name || 'Your initials'}</p>
            <p className="text-ink-muted mt-0.5 text-xs leading-relaxed">
              Your avatar is generated from your name. You can upload a photo later in Settings.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <FormField
            id="fullName"
            label="Full name"
            required
            error={state.fieldErrors?.fullName?.[0]}
            className="sm:col-span-2"
          >
            {(props) => (
              <Input
                {...props}
                name="fullName"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                maxLength={120}
              />
            )}
          </FormField>

          <FormField
            id="preferredName"
            label="Preferred name"
            description={`What ${brand.name} calls you.`}
            error={state.fieldErrors?.preferredName?.[0]}
          >
            {(props) => (
              <Input
                {...props}
                name="preferredName"
                autoComplete="nickname"
                placeholder={name.split(' ')[0] || 'Alex'}
                value={preferred}
                onChange={(e) => setPreferred(e.currentTarget.value)}
                maxLength={80}
              />
            )}
          </FormField>

          <FormField
            id="pronouns"
            label="Pronouns"
            description="Optional."
            error={state.fieldErrors?.pronouns?.[0]}
          >
            {(props) => <Input {...props} name="pronouns" placeholder="they/them" maxLength={40} />}
          </FormField>

          <FormField id="jobTitle" label="Job title" error={state.fieldErrors?.jobTitle?.[0]}>
            {(props) => (
              <Input
                {...props}
                name="jobTitle"
                autoComplete="organization-title"
                placeholder="Director of Engineering"
                defaultValue={defaults.jobTitle}
                maxLength={120}
              />
            )}
          </FormField>

          <FormField id="company" label="Company" error={state.fieldErrors?.company?.[0]}>
            {(props) => (
              <Input
                {...props}
                name="company"
                autoComplete="organization"
                placeholder="Northwind"
                defaultValue={defaults.company}
                maxLength={160}
              />
            )}
          </FormField>

          <FormField id="jobFunction" label="Function">
            {(props) => (
              <Select {...props} name="jobFunction" defaultValue={defaults.jobFunction}>
                <option value="">Select…</option>
                {FUNCTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          <FormField id="seniority" label="Level" description="Optional.">
            {(props) => (
              <Select {...props} name="seniority" defaultValue={defaults.seniority}>
                <option value="">Select…</option>
                {SENIORITY.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          <FormField
            id="timezone"
            label="Timezone"
            description="Used to order your day correctly."
            className="sm:col-span-2"
          >
            {(props) => (
              <Select
                {...props}
                name="timezone"
                value={timezone}
                onChange={(e) => setOverride(e.currentTarget.value)}
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </div>
      </StepShell>
    </form>
  )
}
