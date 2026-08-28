'use client'

import * as React from 'react'
import { Sparkles, X } from 'lucide-react'
import {
  answerProfileQuestion,
  snoozeProfilePrompt,
} from '@/app/(app)/profile-prompt-actions'
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
  scenarioId: string
  prompt: string
  options: { id: string; label: string }[]
  answeredCount: number
  totalCount: number
}

export function ProfilePrompt({ block }: { block: PromptBlock }) {
  const [pending, setPending] = React.useState(false)
  const [gone, setGone] = React.useState(false)

  if (gone) return null

  async function choose(optionId: string) {
    if (pending) return
    setPending(true)
    const result = await answerProfileQuestion({
      assessmentId: block.assessmentId,
      scenarioId: block.scenarioId,
      optionId,
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
            <p className="text-ink mt-2 text-sm leading-relaxed">{block.prompt}</p>
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

        <div className="mt-4 grid gap-2">
          {block.options.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={pending}
              onClick={() => choose(option.id)}
              className={cn(
                'border-line-strong text-ink-secondary hover:border-ink-faint hover:bg-bg-sunken',
                'min-h-11 w-full rounded-[var(--radius-md)] border px-3.5 py-2.5 text-left text-sm transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                'disabled:opacity-50',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <p className="text-ink-faint mt-3 text-xs tabular-nums">
          Profile refinement: {block.answeredCount} of {block.totalCount}
        </p>
      </div>
    </Panel>
  )
}
