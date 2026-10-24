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
  /** A signed or pasted photo URL, when the user has added one. */
  photo?: string | null
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
  timeZoneLabel,
}: {
  people: PersonOption[]
  preselectedPersonId?: string
  /**
   * The account's zone, described ("Central Time (America/Chicago)"). The time
   * typed here is read in that zone on the server, so the field says which zone
   * that is rather than leaving the user to wonder whether "8:53" meant theirs
   * or the server's. Composed on the server so both renders agree.
   */
  timeZoneLabel: string
}) {
  const [state, formAction] = useActionState<MeetingState, FormData>(createMeeting, {})
  // Echoed by the action on a refusal, so React's post-action reset restores
  // what was typed rather than clearing it. See MeetingState.values.
  const values = state.values ?? {}
  const hasExtraContext = Boolean(values.stakes || values.extraContext)
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
            <Input
              {...props}
              name="title"
              defaultValue={values.title}
              placeholder="e.g. Q3 capacity review"
              maxLength={200}
            />
          )}
        </FormField>

        {/* Directly under the title, because it is the one field the brief
            cannot do without. It used to sit below the participant list, which
            on a phone put it two screens down from the button that needs it. */}
        <FormField
          id="objective"
          label="What do you need from it?"
          description={`The most useful thing you can tell ${brand.name}. One specific sentence.`}
          required
          error={state.fieldErrors?.objective?.[0]}
          className="sm:col-span-2"
        >
          {(props) => (
            <Textarea
              {...props}
              name="objective"
              rows={3}
              maxLength={2000}
              defaultValue={values.objective}
              // Framed as an example. A placeholder that reads as a finished
              // answer is indistinguishable from one, which is how an empty
              // objective got submitted by someone who believed they had
              // written it.
              placeholder="e.g. A yes on moving two engineers to the migration"
            />
          )}
        </FormField>

        <FormField
          id="scheduledAt"
          label="When"
          description={`Optional. Your time zone: ${timeZoneLabel}.`}
          error={state.fieldErrors?.scheduledAt?.[0]}
        >
          {(props) => (
            <Input
              {...props}
              name="scheduledAt"
              type="datetime-local"
              defaultValue={values.scheduledAt}
            />
          )}
        </FormField>

        <FormField id="kind" label="Type of conversation">
          {(props) => (
            <Select {...props} name="kind" defaultValue={values.kind || 'other'}>
              {MEETING_KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </div>

      {/* --- participants ---------------------------------------------------- */}
      <div className="mt-8">
        <Eyebrow>Who is in the room?</Eyebrow>
        <p className="text-ink-muted mt-2 text-xs leading-relaxed">
          Marking who decides lets {brand.name} order the brief around them.
        </p>

        {people.length === 0 ? (
          <p className="border-line text-ink-muted mt-4 rounded-[var(--radius-md)] border border-dashed px-4 py-4 text-sm">
            You have not added anyone yet. You can still create the meeting and add people later.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-2">
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
                      className="border-line-strong bg-surface checked:border-accent checked:bg-accent size-4 shrink-0 appearance-none rounded-[3px] border"
                    />
                    <Avatar name={person.name} src={person.photo} size="sm" />
                    <span className="min-w-0">
                      <span className="text-ink block truncate text-sm">{person.name}</span>
                      {person.subtitle ? (
                        <span className="text-ink-muted block truncate text-xs">
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
                        className="h-11 w-auto text-xs"
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

      {/* --- more context ---------------------------------------------------- */}
      {/* Optional depth, folded away so the first meeting is three fields and a
          button. A native <details> keeps its fields in the form while closed,
          so nothing typed here is lost by collapsing it. */}
      <details
        className="group border-line mt-8 rounded-[var(--radius-md)] border"
        open={
          hasExtraContext || Boolean(state.fieldErrors?.stakes || state.fieldErrors?.extraContext)
        }
      >
        <summary className="text-ink-secondary flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm [&::-webkit-details-marker]:hidden">
          More context
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

        <div className="border-line grid gap-4 border-t px-4 pt-4 pb-5">
          <FormField id="stakes" label="What is at stake?" error={state.fieldErrors?.stakes?.[0]}>
            {(props) => (
              <Textarea
                {...props}
                name="stakes"
                rows={2}
                maxLength={2000}
                defaultValue={values.stakes}
                placeholder="e.g. If this slips we miss the compliance deadline"
              />
            )}
          </FormField>

          <FormField
            id="extraContext"
            label={`Anything else ${brand.name} should know?`}
            error={state.fieldErrors?.extraContext?.[0]}
          >
            {(props) => (
              <Textarea
                {...props}
                name="extraContext"
                rows={2}
                maxLength={4000}
                defaultValue={values.extraContext}
              />
            )}
          </FormField>

          <div className="grid gap-1.5">
            <label htmlFor="importance" className="text-ink-secondary text-[0.8125rem] font-medium">
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
              className="mt-1 h-11 w-full accent-[var(--accent)]"
            />
            <p className="text-ink text-xs">
              {
                ['Routine', 'Worth attention', 'Important', 'Very important', 'Critical'][
                  importance - 1
                ]
              }
            </p>
          </div>
        </div>
      </details>

      {state.error ? (
        <p
          role="alert"
          className="border-critical/25 bg-critical-wash text-critical mt-5 flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-xs"
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
