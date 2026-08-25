'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { CircleAlert, Loader2, Sparkles } from 'lucide-react'
import { createPerson, updatePerson, type ActionState } from '@/app/(app)/people/actions'
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

const RELEVANCE_LABELS = [
  'Occasional contact',
  'Works with me sometimes',
  'Regular working relationship',
  'Important to my work',
  'Critical relationship',
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
  const [name, setName] = React.useState(defaults.fullName)
  const [relevance, setRelevance] = React.useState(defaults.relevance)

  return (
    <form action={formAction} noValidate>
      {defaults.id ? <input type="hidden" name="personId" value={defaults.id} /> : null}

      <div className="flex items-center gap-4 rounded-[var(--radius-lg)] border border-line bg-surface p-4">
        <Avatar name={name || '?'} size="lg" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{name || 'Their initials'}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
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
              placeholder="Maya Chen"
              maxLength={160}
              autoComplete="off"
            />
          )}
        </FormField>

        <FormField
          id="preferredName"
          label="Preferred name"
          description="What you actually call them."
        >
          {(props) => (
            <Input
              {...props}
              name="preferredName"
              defaultValue={defaults.preferredName}
              placeholder={name.split(' ')[0] || 'Maya'}
              maxLength={80}
            />
          )}
        </FormField>

        <FormField id="jobTitle" label="Job title">
          {(props) => (
            <Input
              {...props}
              name="jobTitle"
              defaultValue={defaults.jobTitle}
              placeholder="VP Engineering"
              maxLength={120}
            />
          )}
        </FormField>

        <FormField
          id="organizationName"
          label="Company"
          description="Also helps confirm the right person during research."
        >
          {(props) => (
            <Input
              {...props}
              name="organizationName"
              defaultValue={defaults.organizationName}
              placeholder="Acme Corporation"
              maxLength={160}
            />
          )}
        </FormField>

        <FormField id="email" label="Email" description="Optional." error={state.fieldErrors?.email?.[0]}>
          {(props) => (
            <Input
              {...props}
              name="email"
              type="email"
              defaultValue={defaults.email}
              placeholder="maya.chen@acme.com"
            />
          )}
        </FormField>

        <FormField
          id="profileUrl"
          label="Professional profile or website"
          description={`A company bio, personal site, talk page or article. ${brand.name} can read this.`}
          error={state.fieldErrors?.profileUrl?.[0]}
          className="sm:col-span-2"
        >
          {(props) => (
            <Input
              {...props}
              name="profileUrl"
              type="url"
              inputMode="url"
              defaultValue={defaults.profileUrl}
              placeholder="https://acme.com/leadership/maya-chen"
            />
          )}
        </FormField>

        <FormField id="relationshipType" label="Relationship">
          {(props) => (
            <Select {...props} name="relationshipType" defaultValue={defaults.relationshipType}>
              {RELATIONSHIP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        <div className="grid gap-1.5">
          <label htmlFor="relevance" className="text-[0.8125rem] font-medium text-ink-secondary">
            How much does this relationship matter?
          </label>
          <p className="text-xs text-ink-muted">
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
            className="mt-1 w-full accent-[var(--accent)]"
            aria-describedby="relevance-value"
          />
          <p id="relevance-value" className="text-xs text-ink">
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
              defaultValue={defaults.notes}
              maxLength={4000}
              placeholder="Runs the platform org. Wants the recommendation before the reasoning. We disagreed about the migration timeline in March."
            />
          )}
        </FormField>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-[var(--radius-md)] border border-critical/25 bg-critical-wash px-3 py-2.5 text-xs leading-relaxed text-critical"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}

      {state.message ? (
        <p role="status" className="mt-5 text-xs text-positive">
          {state.message}
        </p>
      ) : null}

      {mode === 'create' ? (
        <div className="mt-8 rounded-[var(--radius-md)] border border-line bg-bg-sunken p-4">
          <Eyebrow className="flex items-center gap-1.5">
            <Sparkles className="size-3 text-accent" aria-hidden="true" />
            What happens next
          </Eyebrow>
          <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
            {canResearch
              ? `If you gave a link, ${brand.name} will read it and build a source-backed professional footprint. Everything it finds shows where it came from, and nothing enters your relationship memory until you accept it.`
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
