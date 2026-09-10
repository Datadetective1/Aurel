'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  Check,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Handshake,
  Loader2,
  Scale,
} from 'lucide-react'
import { submitReview, type ConversationState } from '@/app/(app)/conversations/actions'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'
import { Badge, Eyebrow } from '@/components/ui/primitives'
import { confidenceLabel, LOOP_PRESELECT_THRESHOLD } from '@/lib/conversations/loops'
import type { DecisionRecord, Face, LoopRecord } from '@/lib/conversations/queries'
import { cn } from '@/lib/utils'

/**
 * THE REVIEW GATE
 * =============================================================================
 * Everything the reading proposed, in one form, with one button. Each row is
 * a checkbox: ticked means keep, with whatever edits were made to the words,
 * the owner and the date. Unticked means "not this". Likely ones start
 * ticked; possible ones start unticked; the user decides all of them.
 *
 * Same shape as the memory review on the person page, because it is the same
 * idea: nothing the model said is part of the record until a person says so.
 * =============================================================================
 */

export function ConversationReview({
  interactionId,
  loops,
  decisions,
  participants,
  className,
}: {
  interactionId: string
  loops: LoopRecord[]
  decisions: DecisionRecord[]
  participants: Face[]
  className?: string
}) {
  const [state, formAction] = useActionState<ConversationState, FormData>(submitReview, {})

  if (state.message) {
    return (
      <section
        className={cn(
          'border-positive/25 bg-positive-wash flex items-start gap-3 rounded-[var(--radius-lg)] border p-5',
          className,
        )}
        role="status"
      >
        <CircleCheck className="text-positive mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="text-ink-secondary text-sm leading-relaxed">{state.message}</p>
      </section>
    )
  }

  const total = loops.length + decisions.length
  if (total === 0) return null

  const commitments = loops.filter((l) => l.kind !== 'question')
  const questions = loops.filter((l) => l.kind === 'question')

  return (
    <form
      action={formAction}
      className={cn(
        'border-accent/25 bg-accent-wash rounded-[var(--radius-lg)] border p-5 sm:p-6',
        className,
      )}
    >
      <input type="hidden" name="interactionId" value={interactionId} />

      <Eyebrow className="text-accent">Worth keeping?</Eyebrow>
      <p className="text-ink-secondary mt-2 max-w-xl text-sm leading-relaxed">
        {total === 1 ? 'One thing' : `${total} things`} this conversation seems to have left behind.
        Tick what is real, fix anything that is not quite right, and untick the rest. Nothing here
        is part of your record until you keep it.
      </p>

      {commitments.length > 0 ? (
        <ReviewGroup
          icon={<Handshake className="text-accent size-3.5" aria-hidden="true" />}
          title={commitments.length === 1 ? 'A commitment' : `${commitments.length} commitments`}
        >
          {commitments.map((loop) => (
            <LoopProposal key={loop.id} loop={loop} participants={participants} />
          ))}
        </ReviewGroup>
      ) : null}

      {decisions.length > 0 ? (
        <ReviewGroup
          icon={<Scale className="text-accent size-3.5" aria-hidden="true" />}
          title={decisions.length === 1 ? 'A decision' : `${decisions.length} decisions`}
        >
          {decisions.map((decision) => (
            <DecisionProposal key={decision.id} decision={decision} />
          ))}
        </ReviewGroup>
      ) : null}

      {questions.length > 0 ? (
        <ReviewGroup
          icon={<CircleHelp className="text-accent size-3.5" aria-hidden="true" />}
          title={
            questions.length === 1
              ? 'An unanswered question'
              : `${questions.length} unanswered questions`
          }
        >
          {questions.map((loop) => (
            <LoopProposal key={loop.id} loop={loop} participants={participants} />
          ))}
        </ReviewGroup>
      ) : null}

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

function ReviewGroup({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="mt-6">
      <h3 className="text-ink flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </h3>
      <ul className="mt-3 grid gap-3">{children}</ul>
    </div>
  )
}

function LoopProposal({ loop, participants }: { loop: LoopRecord; participants: Face[] }) {
  const preselected = (loop.confidence ?? 0) >= LOOP_PRESELECT_THRESHOLD
  const [keep, setKeep] = React.useState(preselected)
  const [owner, setOwner] = React.useState<'user' | 'person' | 'shared'>(loop.owner)
  const label = confidenceLabel(loop.confidence)
  const id = `loop-${loop.id}`

  return (
    <li
      className={cn(
        'bg-surface rounded-[var(--radius-md)] border p-4 transition-colors',
        keep ? 'border-line-strong' : 'border-line opacity-80',
      )}
    >
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          name="keepLoop"
          value={loop.id}
          checked={keep}
          onChange={(e) => setKeep(e.currentTarget.checked)}
          className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="sr-only">
            Keep this
          </label>
          <Input
            name={`loop:${loop.id}:description`}
            defaultValue={loop.description}
            maxLength={500}
            aria-label="What is owed"
            className="text-sm"
          />

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {loop.kind !== 'question' ? (
              <>
                <Select
                  name={`loop:${loop.id}:owner`}
                  value={owner}
                  onChange={(e) => setOwner(e.currentTarget.value as typeof owner)}
                  aria-label="Who owes it"
                  className="h-9 w-auto text-xs"
                >
                  <option value="user">You promised</option>
                  <option value="person">They promised</option>
                  <option value="shared">Between you</option>
                </Select>
                {owner === 'person' ? (
                  <Select
                    name={`loop:${loop.id}:ownerPersonId`}
                    defaultValue={loop.ownerPersonId ?? participants[0]?.id ?? ''}
                    aria-label="Who"
                    className="h-9 w-auto text-xs"
                  >
                    {participants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                ) : null}
                <Input
                  type="date"
                  name={`loop:${loop.id}:dueOn`}
                  defaultValue={loop.dueOn ?? ''}
                  aria-label="Due"
                  className="h-9 w-auto text-xs"
                />
              </>
            ) : (
              <input type="hidden" name={`loop:${loop.id}:owner`} value="shared" />
            )}
            {label ? (
              <Badge tone={label === 'Likely' ? 'positive' : 'caution'}>{label}</Badge>
            ) : null}
            {loop.person && loop.owner === 'person' ? (
              <span className="text-ink-muted inline-flex items-center gap-1.5 text-xs">
                <Avatar name={loop.person.name} src={loop.person.src} size="xs" />
                {loop.person.name}
              </span>
            ) : null}
          </div>

          {loop.excerpt ? (
            <blockquote className="border-line-strong text-ink-muted mt-3 border-l-2 pl-3 text-xs leading-relaxed">
              {loop.excerpt.length > 240 ? `${loop.excerpt.slice(0, 240)}…` : loop.excerpt}
            </blockquote>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function DecisionProposal({ decision }: { decision: DecisionRecord }) {
  const preselected = (decision.confidence ?? 0) >= LOOP_PRESELECT_THRESHOLD
  const [keep, setKeep] = React.useState(preselected)
  const label = confidenceLabel(decision.confidence)
  const id = `decision-${decision.id}`

  return (
    <li
      className={cn(
        'bg-surface rounded-[var(--radius-md)] border p-4 transition-colors',
        keep ? 'border-line-strong' : 'border-line opacity-80',
      )}
    >
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          name="keepDecision"
          value={decision.id}
          checked={keep}
          onChange={(e) => setKeep(e.currentTarget.checked)}
          className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="sr-only">
            Keep this
          </label>
          <Input
            name={`decision:${decision.id}:description`}
            defaultValue={decision.description}
            maxLength={500}
            aria-label="What was decided"
            className="text-sm"
          />
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {label ? (
              <Badge tone={label === 'Likely' ? 'positive' : 'caution'}>{label}</Badge>
            ) : null}
            {decision.people.length > 0 ? (
              <span className="text-ink-muted inline-flex items-center gap-1.5 text-xs">
                {decision.people.slice(0, 3).map((p) => (
                  <Avatar key={p.id} name={p.name} src={p.src} size="xs" />
                ))}
                {decision.people.map((p) => p.name.split(' ')[0]).join(', ')}
              </span>
            ) : null}
          </div>
          {decision.context ? (
            <p className="text-ink-secondary mt-2 text-xs leading-relaxed">
              <span className="text-ink-muted">Because — </span>
              {decision.context}
            </p>
          ) : null}
          {decision.excerpt ? (
            <blockquote className="border-line-strong text-ink-muted mt-3 border-l-2 pl-3 text-xs leading-relaxed">
              {decision.excerpt.length > 240
                ? `${decision.excerpt.slice(0, 240)}…`
                : decision.excerpt}
            </blockquote>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="size-4" aria-hidden="true" />
        )}
        Keep what is ticked
      </Button>
      <p className="text-ink-muted text-xs">Unticked items are set aside, not deleted.</p>
    </div>
  )
}
