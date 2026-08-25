'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { ArrowRight, CircleAlert, Loader2, Send, Sparkles, Wand2 } from 'lucide-react'
import { adaptMessage, ask, type AdaptState, type CoachState } from '@/app/(app)/coach/actions'
import { EvidenceBadge } from './evidence'
import { Button } from '@/components/ui/button'
import { Select, Textarea } from '@/components/ui/field'
import { Badge, Eyebrow, Panel } from '@/components/ui/primitives'
import {
  ADAPTATION_MODE_HINT,
  ADAPTATION_MODE_LABEL,
  ADAPTATION_MODES,
} from '@/lib/ai/prompts/message-adaptation'
import { cn } from '@/lib/utils'
import { brand } from '@/lib/brand'

export interface CoachPerson {
  id: string
  name: string
}

/**
 * ASK — question answering over the user's own relationship record.
 * Every answer carries the evidence it was built from.
 */
export function AskPanel({
  examples,
  intro,
  initialQuestion,
}: {
  examples: readonly string[]
  intro: string
  initialQuestion?: string
}) {
  const [state, formAction] = useActionState<CoachState, FormData>(ask, {})
  const [question, setQuestion] = React.useState(initialQuestion ?? '')
  const formRef = React.useRef<HTMLFormElement>(null)

  const submitWith = (value: string) => {
    setQuestion(value)
    // Let React commit the value before the form reads it.
    requestAnimationFrame(() => formRef.current?.requestSubmit())
  }

  return (
    <div>
      <form ref={formRef} action={formAction}>
        <label htmlFor="coach-question" className="sr-only">
          Ask {brand.name} a question
        </label>
        <Textarea
          id="coach-question"
          name="question"
          value={question}
          onChange={(e) => setQuestion(e.currentTarget.value)}
          rows={3}
          maxLength={2000}
          placeholder={`What have I learned about working with…?`}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              formRef.current?.requestSubmit()
            }
          }}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-ink-muted">{intro}</p>
          <AskButton disabled={question.trim().length < 2} />
        </div>
      </form>

      {!state.answer && !state.error ? (
        <div className="mt-6">
          <Eyebrow>Try</Eyebrow>
          <div className="mt-3 flex flex-wrap gap-2">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => submitWith(example)}
                className="rounded-full border border-line bg-surface px-3.5 py-2 text-xs text-ink-secondary transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="mt-6 flex items-start gap-2 rounded-[var(--radius-md)] border border-caution/25 bg-caution-wash px-4 py-3 text-sm text-ink-secondary"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-caution" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}

      {state.answer ? (
        <div className="mt-8">
          {state.question ? (
            <p className="text-sm text-ink-muted">
              <span className="label mr-2">You asked</span>
              {state.question}
            </p>
          ) : null}

          <Panel className="mt-4 p-5 sm:p-6">
            {/* Answers are plain text with newlines; rendered pre-wrap rather
                than as HTML, since content can include user-recorded material. */}
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">
              {state.answer.answer}
            </p>
          </Panel>

          {state.answer.actions.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {state.answer.actions.map((action) => (
                <Button key={action.href} asChild variant="secondary" size="sm">
                  <Link href={action.href}>
                    {action.label}
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </Button>
              ))}
            </div>
          ) : null}

          {state.answer.citations.length > 0 ? (
            <details className="mt-5 rounded-[var(--radius-md)] border border-line bg-surface">
              <summary className="cursor-pointer px-4 py-3 text-xs text-ink-secondary">
                Evidence · {state.answer.citations.length}
              </summary>
              <ul className="grid gap-2 border-t border-line px-4 py-3">
                {state.answer.citations.slice(0, 20).map((citation, i) => (
                  <li key={i} className="flex flex-wrap items-start justify-between gap-3">
                    <span className="min-w-0 flex-1 text-xs leading-relaxed text-ink-secondary">
                      {citation.label}
                    </span>
                    <EvidenceBadge level={citation.evidenceLevel} />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <p className="mt-4 text-[0.6875rem] text-ink-faint">
            {state.answer.grounded
              ? 'Composed directly from your records.'
              : 'Generated from your records.'}
          </p>

          {state.answer.followUps.length > 0 ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {state.answer.followUps.map((followUp) => (
                <button
                  key={followUp}
                  type="button"
                  onClick={() => submitWith(followUp)}
                  className="rounded-full border border-line bg-surface px-3.5 py-2 text-xs text-ink-secondary transition-colors hover:border-line-strong hover:text-ink"
                >
                  {followUp}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function AskButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={disabled || pending}>
      {pending ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Looking…
        </>
      ) : (
        <>
          <Send className="size-3.5" aria-hidden="true" />
          Ask
        </>
      )}
    </Button>
  )
}

/**
 * ADAPT THIS MESSAGE — rewrite a draft for one recipient, and show why each
 * change was made. The explanation is the product.
 */
export function AdaptPanel({
  people,
  initialPersonId,
}: {
  people: CoachPerson[]
  initialPersonId?: string
}) {
  const [state, formAction] = useActionState<AdaptState, FormData>(adaptMessage, {})
  const [draft, setDraft] = React.useState('')
  const [mode, setMode] = React.useState<string>('recipient')
  const [copied, setCopied] = React.useState(false)

  const copy = async () => {
    if (!state.result) return
    await navigator.clipboard.writeText(state.result.adapted)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <form action={formAction}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor="adapt-person" className="text-[0.8125rem] font-medium text-ink-secondary">
              Who is it for?
            </label>
            <Select id="adapt-person" name="personId" defaultValue={initialPersonId ?? ''}>
              <option value="">Nobody in particular</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="adapt-mode" className="text-[0.8125rem] font-medium text-ink-secondary">
              How should it change?
            </label>
            <Select
              id="adapt-mode"
              name="mode"
              value={mode}
              onChange={(e) => setMode(e.currentTarget.value)}
            >
              {ADAPTATION_MODES.map((option) => (
                <option key={option} value={option}>
                  {ADAPTATION_MODE_LABEL[option]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <p className="mt-2 text-xs text-ink-muted">
          {ADAPTATION_MODE_HINT[mode as (typeof ADAPTATION_MODES)[number]]}
        </p>

        <label htmlFor="adapt-draft" className="sr-only">
          Your draft
        </label>
        <Textarea
          id="adapt-draft"
          name="draft"
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          rows={7}
          maxLength={20_000}
          className="mt-4"
          placeholder="Paste your email, message or talking point here."
        />

        <AdaptButton disabled={draft.trim().length < 5} />
      </form>

      {state.error ? (
        <p
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-[var(--radius-md)] border border-caution/25 bg-caution-wash px-4 py-3 text-sm text-ink-secondary"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-caution" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}

      {state.result ? (
        <div className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Eyebrow>Adapted</Eyebrow>
            <Button variant="secondary" size="sm" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <Panel className="mt-3 p-5">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">
              {state.result.adapted}
            </p>
          </Panel>

          {state.result.changes.length > 0 ? (
            <section className="mt-7">
              <Eyebrow>Why this changed</Eyebrow>
              <ul className="mt-3 grid gap-3">
                {state.result.changes.map((change, i) => (
                  <li key={i} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-2 h-px w-3 shrink-0',
                        change.fromRecord ? 'bg-accent-graphic' : 'bg-line-strong',
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-ink">{change.what}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{change.why}</p>
                      {change.fromRecord ? (
                        <Badge tone="accent" className="mt-1.5">
                          From your record
                        </Badge>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {state.result.cautions.length > 0 ? (
            <ul className="mt-6 grid gap-2">
              {state.result.cautions.map((caution, i) => (
                <li key={i} className="flex gap-2 text-xs leading-relaxed text-ink-muted">
                  <CircleAlert className="mt-px size-3.5 shrink-0 text-caution" aria-hidden="true" />
                  {caution}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function AdaptButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" className="mt-5" disabled={disabled || pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Rewriting…
        </>
      ) : (
        <>
          <Wand2 className="size-4" aria-hidden="true" />
          Adapt this message
        </>
      )}
    </Button>
  )
}

/** Tab switch between asking and adapting. */
export function CoachTabs({
  ask: askPanel,
  adapt: adaptPanel,
  initialTab,
}: {
  ask: React.ReactNode
  adapt: React.ReactNode
  initialTab?: 'ask' | 'adapt'
}) {
  const [tab, setTab] = React.useState<'ask' | 'adapt'>(initialTab ?? 'ask')

  return (
    <div>
      <div role="tablist" aria-label="Coach mode" className="flex gap-1 border-b border-line">
        {(
          [
            { id: 'ask', label: `Ask ${brand.name}`, icon: Sparkles },
            { id: 'adapt', label: 'Adapt a message', icon: Wand2 },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            id={`tab-${item.id}`}
            onClick={() => setTab(item.id)}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
              tab === item.id
                ? 'border-accent text-ink'
                : 'border-transparent text-ink-muted hover:text-ink-secondary',
            )}
          >
            <item.icon className="size-3.5" aria-hidden="true" />
            {item.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="panel-ask"
        aria-labelledby="tab-ask"
        hidden={tab !== 'ask'}
        className="pt-8"
      >
        {askPanel}
      </div>
      <div
        role="tabpanel"
        id="panel-adapt"
        aria-labelledby="tab-adapt"
        hidden={tab !== 'adapt'}
        className="pt-8"
      >
        {adaptPanel}
      </div>
    </div>
  )
}
