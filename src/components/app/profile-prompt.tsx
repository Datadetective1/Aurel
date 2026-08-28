'use client'

import * as React from 'react'
import { Sparkles, X } from 'lucide-react'
import {
  answerProfileQuestion,
  snoozeProfilePrompt,
} from '@/app/(app)/profile-prompt-actions'
import { Button } from '@/components/ui/button'
import { Eyebrow, Panel } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

/**
 * ONE QUESTION, ON TODAY, WHEN NOTHING ELSE IS HAPPENING
 * =============================================================================
 * The refinement that happens without anybody going to Settings.
 *
 * Placement is the whole design. It renders only on Today — never on a brief,
 * a debrief or a prepare flow — because interrupting someone mid-preparation to
 * ask an introspective question about themselves is exactly the wrong moment,
 * and Today is the one screen a user visits when they are between things.
 *
 * It also waits until the account has produced a brief. Somebody who has not
 * yet seen Atturel do anything has no reason to invest more in teaching it
 * about themselves, which is the trade this whole change exists to fix.
 *
 * One question at a time. Dismissible. Never blocks anything.
 * =============================================================================
 */

export interface PromptBlock {
  assessmentId: string
  roundIndex: number
  blockId: string
  items: { id: string; text: string }[]
  answeredCount: number
  totalCount: number
}

export function ProfilePrompt({ block }: { block: PromptBlock }) {
  const [most, setMost] = React.useState<string | null>(null)
  const [least, setLeast] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const [gone, setGone] = React.useState(false)

  if (gone) return null

  const ready = most !== null && least !== null && most !== least

  async function submit() {
    if (!ready || pending) return
    setPending(true)
    const result = await answerProfileQuestion({
      assessmentId: block.assessmentId,
      roundIndex: block.roundIndex,
      blockId: block.blockId,
      mostItemId: most!,
      leastItemId: least!,
    })
    if (result.ok) setGone(true)
    else setPending(false)
  }

  async function dismiss() {
    setGone(true)
    await snoozeProfilePrompt()
  }

  return (
    <Panel className="mt-10">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Eyebrow className="flex items-center gap-1.5">
              <Sparkles className="text-accent size-3" aria-hidden="true" />
              Refine your profile
            </Eyebrow>
            <p className="text-ink-secondary mt-2 text-xs leading-relaxed">
              One question. Which is most like you at work, and which is least?
            </p>
          </div>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Not now — hide this for a week"
            className="text-ink-faint hover:text-ink-secondary focus-visible:outline-[var(--focus-ring)] -m-2 flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <ul className="mt-4 grid gap-2">
          {block.items.map((item) => (
            <li
              key={item.id}
              className="border-line bg-bg-sunken flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-md)] border px-3 py-2.5"
            >
              <span className="text-ink min-w-0 flex-1 text-sm leading-relaxed">{item.text}</span>
              <span className="flex shrink-0 gap-1.5">
                <Choice
                  label="Most"
                  selected={most === item.id}
                  disabled={least === item.id}
                  onSelect={() => setMost(most === item.id ? null : item.id)}
                  describedBy={item.text}
                />
                <Choice
                  label="Least"
                  selected={least === item.id}
                  disabled={most === item.id}
                  onSelect={() => setLeast(least === item.id ? null : item.id)}
                  describedBy={item.text}
                />
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" className="min-h-11" disabled={!ready || pending} onClick={submit}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
          <span className="text-ink-faint text-xs tabular-nums">
            Profile refinement: {block.answeredCount} of {block.totalCount}
          </span>
        </div>
      </div>
    </Panel>
  )
}

function Choice({
  label,
  selected,
  disabled,
  onSelect,
  describedBy,
}: {
  label: string
  selected: boolean
  disabled: boolean
  onSelect: () => void
  describedBy: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${label} like me: ${describedBy}`}
      className={cn(
        'min-h-11 rounded-[var(--radius-sm)] border px-2.5 text-xs transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
        'disabled:cursor-not-allowed disabled:opacity-40',
        selected
          ? 'border-accent bg-accent text-accent-contrast'
          : 'border-line-strong text-ink-secondary hover:border-ink-faint',
      )}
    >
      {label}
    </button>
  )
}
