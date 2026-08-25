'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { CircleAlert, Loader2, Sparkles } from 'lucide-react'
import { createMeeting, type MeetingState } from '@/app/(app)/meetings/actions'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { FormField, Input, Select, Textarea } from '@/components/ui/field'
import { Eyebrow } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { brand } from '@/lib/brand'

const MEETING_KINDS = [
  { value: 'one_on_one', label: '1:1' },
  { value: 'executive_review', label: 'Executive review' },
  { value: 'project_review', label: 'Project review' },
  { value: 'customer_meeting', label: 'Customer meeting' },
  { value: 'sales_conversation', label: 'Sales conversation' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'difficult_conversation', label: 'Difficult conversation' },
  { value: 'feedback_conversation', label: 'Feedback conversation' },
  { value: 'performance_conversation', label: 'Performance conversation' },
  { value: 'interview', label: 'Interview' },
  { value: 'networking', label: 'Networking' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'vendor_discussion', label: 'Vendor discussion' },
  { value: 'team_meeting', label: 'Team meeting' },
  { value: 'other', label: 'Something else' },
]

const ROLES = [
  { value: 'decision_maker', label: 'Decides' },
  { value: 'influencer', label: 'Influences' },
  { value: 'contributor', label: 'Contributes' },
  { value: 'presenter', label: 'Presents' },
  { value: 'informed', label: 'Informed' },
]

export interface PersonOption {
  id: string
  name: string
  subtitle: string | null
}

/**
 * Meeting creation.
 *
 * Roles matter: the brief is ordered around who decides, so capturing that here
 * is what lets the room-dynamics section say anything useful.
 */
export function MeetingForm({
  people,
  preselectedPersonId,
}: {
  people: PersonOption[]
  preselectedPersonId?: string
}) {
  const [state, formAction] = useActionState<MeetingState, FormData>(createMeeting, {})
  const [selected, setSelected] = React.useState<Record<string, string>>(() =>
    preselectedPersonId ? { [preselectedPersonId]: 'decision_maker' } : {},
  )
  const [importance, setImportance] = React.useState(3)

  const toggle = (personId: string) => {
    setSelected((prev) => {
      const next = { ...prev }
      if (next[personId]) delete next[personId]
      else next[personId] = 'contributor'
      return next
    })
  }

  const setRole = (personId: string, role: string) => {
    setSelected((prev) => ({ ...prev, [personId]: role }))
  }

  return (
    <form action={formAction} noValidate>
      {Object.entries(selected).map(([personId, role]) => (
        <input key={personId} type="hidden" name="attendee" value={`${personId}:${role}`} />
      ))}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="title"
          label="What is the meeting?"
          required
          error={state.fieldErrors?.title?.[0]}
          className="sm:col-span-2"
        >
          {(props) => (
            <Input {...props} name="title" placeholder="Q3 capacity review" maxLength={200} />
          )}
        </FormField>

        <FormField id="kind" label="Type of conversation">
          {(props) => (
            <Select {...props} name="kind" defaultValue="other">
              {MEETING_KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        <FormField
          id="scheduledAt"
          label="When"
          description="Optional."
          error={state.fieldErrors?.scheduledAt?.[0]}
        >
          {(props) => <Input {...props} name="scheduledAt" type="datetime-local" />}
        </FormField>
      </div>

      {/* --- participants ---------------------------------------------------- */}
      <div className="mt-8">
        <Eyebrow>Who is in the room?</Eyebrow>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          Marking who decides lets {brand.name} order the brief around them.
        </p>

        {people.length === 0 ? (
          <p className="mt-4 rounded-[var(--radius-md)] border border-dashed border-line px-4 py-4 text-sm text-ink-muted">
            You have not added anyone yet. You can still create the meeting and add people later.
          </p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {people.map((person) => {
              const isSelected = Boolean(selected[person.id])
              return (
                <li
                  key={person.id}
                  className={cn(
                    'flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3 transition-colors',
                    isSelected ? 'border-accent bg-accent-wash' : 'border-line bg-surface',
                  )}
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(person.id)}
                      className="size-4 shrink-0 appearance-none rounded-[3px] border border-line-strong bg-surface checked:border-accent checked:bg-accent"
                    />
                    <Avatar name={person.name} size="xs" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink">{person.name}</span>
                      {person.subtitle ? (
                        <span className="block truncate text-xs text-ink-muted">
                          {person.subtitle}
                        </span>
                      ) : null}
                    </span>
                  </label>

                  {isSelected ? (
                    <>
                      <label htmlFor={`role-${person.id}`} className="sr-only">
                        {person.name}&rsquo;s role in this meeting
                      </label>
                      <Select
                        id={`role-${person.id}`}
                        value={selected[person.id]}
                        onChange={(e) => setRole(person.id, e.currentTarget.value)}
                        className="h-9 w-auto text-xs"
                      >
                        {ROLES.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </Select>
                    </>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* --- objective -------------------------------------------------------- */}
      <div className="mt-8 grid gap-4">
        <FormField
          id="objective"
          label="What do you need to accomplish?"
          description={`The single most useful thing you can tell ${brand.name}. Be specific.`}
        >
          {(props) => (
            <Textarea
              {...props}
              name="objective"
              rows={3}
              maxLength={2000}
              placeholder="Get approval to move two engineers onto the migration before the quarter closes."
            />
          )}
        </FormField>

        <FormField id="stakes" label="What is at stake?" description="Optional.">
          {(props) => (
            <Textarea
              {...props}
              name="stakes"
              rows={2}
              maxLength={2000}
              placeholder="If this slips again we miss the compliance deadline."
            />
          )}
        </FormField>

        <FormField
          id="extraContext"
          label={`Anything else ${brand.name} should know?`}
          description="Optional."
        >
          {(props) => <Textarea {...props} name="extraContext" rows={2} maxLength={4000} />}
        </FormField>

        <div className="grid gap-1.5">
          <label htmlFor="importance" className="text-[0.8125rem] font-medium text-ink-secondary">
            How much does this meeting matter?
          </label>
          <input
            id="importance"
            name="importance"
            type="range"
            min={1}
            max={5}
            step={1}
            value={importance}
            onChange={(e) => setImportance(Number(e.currentTarget.value))}
            className="mt-1 w-full accent-[var(--accent)]"
          />
          <p className="text-xs text-ink">
            {['Routine', 'Worth attention', 'Important', 'Very important', 'Critical'][importance - 1]}
          </p>
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-[var(--radius-md)] border border-critical/25 bg-critical-wash px-3 py-2.5 text-xs text-critical"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}

      <Submit />
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" className="mt-8" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Creating…
        </>
      ) : (
        <>
          <Sparkles className="size-4" aria-hidden="true" />
          Create and prepare
        </>
      )}
    </Button>
  )
}
