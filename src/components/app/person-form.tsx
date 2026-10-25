'use client'

import { RELEVANCE_LABELS } from '@/lib/visual/relevance'
import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { CircleAlert, Loader2, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { createPerson, updatePerson, type ActionState } from '@/app/(app)/people/actions'
import { RestorePersonButton } from '@/components/app/person-lifecycle'
import { TimezoneField } from '@/components/app/timezone-field'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { FormField, Input, Select, Textarea } from '@/components/ui/field'
import { Eyebrow } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { brand } from '@/lib/brand'

const RELATIONSHIP_OPTIONS = [
  { value: 'manager', label: 'My manager' },
  { value: 'report', label: 'My direct report' },
  { value: 'skip_level', label: 'My skip-level' },
  { value: 'peer', label: 'A peer' },
  { value: 'cross_functional', label: 'Cross-functional partner' },
  { value: 'customer', label: 'A customer' },
  { value: 'prospect', label: 'A prospect' },
  { value: 'vendor', label: 'A vendor' },
  { value: 'partner', label: 'A partner' },
  { value: 'candidate', label: 'A candidate' },
  { value: 'mentor', label: 'My mentor' },
  { value: 'external', label: 'External contact' },
  { value: 'other', label: 'Other' },
]

export interface PersonDefaults {
  id?: string
  fullName: string
  preferredName: string
  jobTitle: string
  organizationName: string
  email: string
  profileUrl: string
  relationshipType: string
  relevance: number
  pronouns: string
  timezone: string
  notes: string
}

const EMPTY: PersonDefaults = {
  fullName: '',
  preferredName: '',
  jobTitle: '',
  organizationName: '',
  email: '',
  profileUrl: '',
  relationshipType: 'peer',
  relevance: 3,
  pronouns: '',
  timezone: '',
  notes: '',
}

export function PersonForm({
  defaults = EMPTY,
  mode = 'create',
  canResearch,
  discoveryHint,
}: {
  defaults?: PersonDefaults
  mode?: 'create' | 'edit'
  canResearch: boolean
  discoveryHint: string | null
}) {
  const action = mode === 'create' ? createPerson : updatePerson
  const [state, formAction] = useActionState<ActionState, FormData>(action, {})
  // After a refusal, what was typed; otherwise the stored defaults. Keyed on
  // the state so React re-applies them when the form resets.
  const v = state.values
  const field = (name: keyof PersonDefaults & string): string =>
    v?.[name] ?? String(defaults[name] ?? '')
  const [name, setName] = React.useState(defaults.fullName)
  const [relevance, setRelevance] = React.useState(defaults.relevance)

  return (
    <form action={formAction} noValidate>
      {defaults.id ? <input type="hidden" name="personId" value={defaults.id} /> : null}

      <div className="border-line bg-surface flex items-center gap-4 rounded-[var(--radius-lg)] border p-4">
        <Avatar name={name || '?'} size="lg" />
        <div className="min-w-0">
          <p className="text-ink text-sm font-medium">{name || 'Their initials'}</p>
          <p className="text-ink-muted mt-0.5 text-xs leading-relaxed">
            Only professional context. {brand.name} never asks for, and never infers, personal
            characteristics.
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
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="e.g. Maya Chen"
              maxLength={160}
              autoComplete="off"
            />
          )}
        </FormField>

        <FormField
          id="organizationName"
          label="Company"
          description="Helps confirm the right person during research."
        >
          {(props) => (
            <Input
              {...props}
              name="organizationName"
              defaultValue={field('organizationName')}
              placeholder="e.g. Acme Corporation"
              maxLength={160}
            />
          )}
        </FormField>

        <FormField id="jobTitle" label="Role or title">
          {(props) => (
            <Input
              {...props}
              name="jobTitle"
              defaultValue={field('jobTitle')}
              placeholder="e.g. VP Engineering"
              maxLength={120}
            />
          )}
        </FormField>

        <FormField
          id="profileUrl"
          label="Profile or company page"
          description={`Optional. A company bio, personal site or talk page. ${brand.name} reads it first.`}
          error={state.fieldErrors?.profileUrl?.[0]}
          className="sm:col-span-2"
        >
          {(props) => (
            <Input
              {...props}
              name="profileUrl"
              type="url"
              inputMode="url"
              defaultValue={field('profileUrl')}
              placeholder="https://acme.com/leadership/maya-chen"
            />
          )}
        </FormField>
      </div>

      {/* Depth, folded away for a first add so it does not read as a CRM
          record. Every field is still here; <details> keeps them in the form
          while closed. Open when editing, or when one of them has an error. */}
      <details
        className="group border-line mt-6 rounded-[var(--radius-md)] border"
        open={
          mode === 'edit' ||
          Boolean(state.fieldErrors?.email) ||
          Boolean(v?.preferredName || v?.email || v?.notes || v?.pronouns || v?.timezone)
        }
      >
        <summary className="text-ink-secondary flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm [&::-webkit-details-marker]:hidden">
          More about them
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
          <FormField
            id="preferredName"
            label="Preferred name"
            description="What you actually call them."
          >
            {(props) => (
              <Input
                {...props}
                name="preferredName"
                defaultValue={field('preferredName')}
                placeholder={name.split(' ')[0] || 'Maya'}
                maxLength={80}
              />
            )}
          </FormField>

          <FormField id="email" label="Email" error={state.fieldErrors?.email?.[0]}>
            {(props) => (
              <Input
                {...props}
                name="email"
                type="email"
                defaultValue={field('email')}
                placeholder="maya.chen@acme.com"
              />
            )}
          </FormField>

          <FormField
            id="pronouns"
            label="Pronouns"
            description="Only if they have told you."
            error={state.fieldErrors?.pronouns?.[0]}
          >
            {(props) => (
              <Input
                {...props}
                name="pronouns"
                defaultValue={field('pronouns')}
                placeholder="e.g. she/her"
                maxLength={40}
              />
            )}
          </FormField>

          <TimezoneField
            id="person-timezone"
            name="timezone"
            label="Their time zone"
            description="For meeting times and when to follow up."
            defaultValue={field('timezone')}
            optional
          />

          <FormField id="relationshipType" label="Relationship">
            {(props) => (
              <Select {...props} name="relationshipType" defaultValue={field('relationshipType')}>
                {RELATIONSHIP_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          <div className="grid gap-1.5">
            <label htmlFor="relevance" className="text-ink-secondary text-[0.8125rem] font-medium">
              How much does this relationship matter?
            </label>
            <p className="text-ink-muted text-xs">
              Your call, never inferred. Used to order what {brand.name} puts in front of you.
            </p>
            <input
              id="relevance"
              name="relevance"
              type="range"
              min={1}
              max={5}
              step={1}
              value={relevance}
              onChange={(e) => setRelevance(Number(e.currentTarget.value))}
              className="mt-1 h-11 w-full accent-[var(--accent)]"
              aria-describedby="relevance-value"
            />
            <p id="relevance-value" className="text-ink text-xs">
              {RELEVANCE_LABELS[relevance - 1]}
            </p>
          </div>

          <FormField
            id="notes"
            label={`What should ${brand.name} know?`}
            description="Anything you already know about working with them. You can add more later."
            className="sm:col-span-2"
          >
            {(props) => (
              <Textarea
                {...props}
                name="notes"
                rows={4}
                defaultValue={field('notes')}
                maxLength={4000}
                placeholder="e.g. Runs the platform org. Wants the recommendation before the reasoning."
              />
            )}
          </FormField>
        </div>
      </details>

      {state.error ? (
        <p
          role="alert"
          className="border-critical/25 bg-critical-wash text-critical mt-5 flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-xs leading-relaxed"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}

      {state.duplicate ? (
        <div
          role="alert"
          className="border-caution/30 bg-caution-wash mt-5 rounded-[var(--radius-md)] border px-4 py-3"
        >
          <p className="text-ink text-sm">
            You already have {state.duplicate.name}
            {state.duplicate.organization ? ` (${state.duplicate.organization})` : ''}
            {state.duplicate.archived ? ', in Archived' : ''}.{' '}
            <span className="text-ink-secondary">
              {state.duplicate.reason === 'email'
                ? 'Same email address.'
                : state.duplicate.reason === 'profile'
                  ? 'Same profile link.'
                  : 'Same name.'}
            </span>
          </p>
          <div className="mt-3 flex flex-wrap items-start gap-2">
            {state.duplicate.archived ? (
              <RestorePersonButton personId={state.duplicate.id} size="sm" />
            ) : null}
            <Button asChild size="sm" variant="secondary">
              <Link href={`/people/${state.duplicate.id}`}>Open {state.duplicate.name}</Link>
            </Button>
            <Button type="submit" size="sm" variant="ghost" name="confirmDuplicate" value="yes">
              Add as someone new
            </Button>
          </div>
        </div>
      ) : null}

      {state.message ? (
        <p role="status" className="text-positive mt-5 text-xs">
          {state.message}
        </p>
      ) : null}

      {mode === 'create' ? (
        <div className="border-line bg-bg-sunken mt-8 rounded-[var(--radius-md)] border p-4">
          <Eyebrow className="flex items-center gap-1.5">
            <Sparkles className="text-accent size-3" aria-hidden="true" />
            What happens next
          </Eyebrow>
          <p className="text-ink-secondary mt-2 text-xs leading-relaxed">
            {canResearch
              ? `Start with who they are; add depth over time. If you gave a link, ${brand.name} reads it straight away. Everything it finds shows where it came from, and nothing enters your relationship memory until you accept it.`
              : (discoveryHint ??
                `${brand.name} will read any link you provide and build a source-backed professional footprint.`)}
          </p>
        </div>
      ) : null}

      <SubmitRow mode={mode} />
    </form>
  )
}

function SubmitRow({ mode }: { mode: 'create' | 'edit' }) {
  const { pending } = useFormStatus()
  return (
    <div className={cn('mt-8 flex flex-wrap items-center gap-3')}>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Saving…
          </>
        ) : mode === 'create' ? (
          'Add person'
        ) : (
          'Save changes'
        )}
      </Button>
    </div>
  )
}
