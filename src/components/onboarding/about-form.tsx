'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { saveAbout } from '@/app/onboarding/actions'
import { type StepState } from '@/lib/onboarding'
import { FormField, Input, Select } from '@/components/ui/field'
import { StepShell } from './step-shell'
import { TimezoneField } from '@/components/app/timezone-field'
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

  // Open the optional section when it already holds something, or when one of
  // its fields came back with an error, so nothing typed is hidden.
  const roleOpen =
    Boolean(defaults.jobTitle || defaults.company || defaults.jobFunction || defaults.seniority) ||
    Boolean(
      state.fieldErrors?.jobTitle || state.fieldErrors?.company || state.fieldErrors?.pronouns,
    )

  return (
    <form action={formAction} noValidate>
      <StepShell
        title="Walk into the room knowing what matters."
        description={`First, what to call you. Then ${brand.name} helps you prepare for one real meeting. Nothing here is shared with anyone.`}
        submitLabel="Continue to Today"
        note={`${brand.name} never asks for anything about your colleagues' personal characteristics, and it will not infer them.`}
      >
        <div className="grid gap-4 sm:grid-cols-2">
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
            description={`Optional. What ${brand.name} calls you.`}
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

          <TimezoneField
            id="timezone"
            name="timezone"
            defaultValue={defaults.timezone}
            description="Detected from this device. Meeting times are read and shown in it."
          />
        </div>

        {/* Optional, and folded away so the required step is two fields. A
            native <details> keeps its inputs in the form while closed, so
            collapsing it never discards what was typed. */}
        <details
          className="group border-line mt-6 rounded-[var(--radius-md)] border"
          open={roleOpen}
        >
          <summary className="text-ink-secondary flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm [&::-webkit-details-marker]:hidden">
            Your role
            <span className="text-ink-muted text-xs">
              Optional
              <span
                aria-hidden="true"
                className="ml-2 inline-block transition-transform group-open:rotate-90"
              >
                ›
              </span>
            </span>
          </summary>

          <div className="border-line grid gap-4 border-t px-4 pt-4 pb-5 sm:grid-cols-2">
            <FormField id="jobTitle" label="Job title" error={state.fieldErrors?.jobTitle?.[0]}>
              {(props) => (
                <Input
                  {...props}
                  name="jobTitle"
                  autoComplete="organization-title"
                  placeholder="e.g. Director of Engineering"
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
                  placeholder="e.g. Northwind"
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

            <FormField id="seniority" label="Level">
              {(props) => (
                <Select {...props} name="seniority" defaultValue={defaults.seniority}>
                  <option value="">Select…</option>
                  {SENIORITY.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>

            <FormField id="pronouns" label="Pronouns" error={state.fieldErrors?.pronouns?.[0]}>
              {(props) => (
                <Input
                  {...props}
                  name="pronouns"
                  placeholder="e.g. they/them"
                  defaultValue={defaults.pronouns}
                  maxLength={40}
                />
              )}
            </FormField>
          </div>
        </details>

        {state.error ? (
          <p role="alert" className="text-critical mt-4 text-xs">
            {state.error}
          </p>
        ) : null}
      </StepShell>
    </form>
  )
}
