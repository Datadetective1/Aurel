import { brand } from '@/lib/brand'
import { CircleCheck, Mic, Scale, Target } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Chip } from '@/components/visual/chip'
import { DIRECTION_ICON } from '@/components/visual/direction'
import { ELENA, MEETING, REMEMBER, THEO, firstName } from './fixtures'
import { ProductFrame } from './frame'

/**
 * BEFORE / DURING / AFTER
 * =============================================================================
 * The loop the product closes, one interface state per stage:
 *
 *   before   the Glance: objective and what to remember
 *   during   capture: a recording in progress, transcribed when it stops
 *   after    the outcome: a decision and commitments, kept only on confirm
 *
 * Each card is short enough to read on a phone without scrolling inside it.
 * =============================================================================
 */

/** Fixed bar heights, so the waveform is the same on every render. */
const WAVE = [
  30, 52, 38, 70, 46, 84, 58, 40, 66, 90, 54, 36, 62, 78, 48, 34, 58, 72, 44, 28, 50, 64, 38, 56,
]

function Before() {
  return (
    <ProductFrame
      description={`Before: the brief for "${MEETING.title}" is ready. Objective: ${MEETING.objective} Remember: ${REMEMBER[0]!.text} ${REMEMBER[1]!.text}`}
      bodyClassName="p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="label flex items-center gap-1.5">
          <Target className="text-accent size-3.5" />
          Objective
        </p>
        <Chip icon={CircleCheck} tone="positive">
          Brief ready
        </Chip>
      </div>
      <p className="font-display text-ink mt-2.5 text-[1.0625rem] leading-snug">
        {MEETING.objective}
      </p>
      <p className="label mt-5">Remember</p>
      <ul className="mt-2.5 grid gap-2.5">
        {REMEMBER.slice(0, 2).map((item) => (
          <li key={item.text} className="flex gap-2.5">
            <span className="bg-accent-graphic mt-[0.5rem] size-1.5 shrink-0 rounded-full" />
            <span className="text-ink text-[0.8125rem] leading-snug">{item.text}</span>
          </li>
        ))}
      </ul>
    </ProductFrame>
  )
}

function During() {
  return (
    <ProductFrame
      description={`During: ${brand.name} is capturing "${MEETING.title}". A recording has been running for 18 minutes and 42 seconds, and will be transcribed when you stop.`}
      bodyClassName="p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="label flex items-center gap-1.5">
          <span className="bg-critical size-2 rounded-full" />
          Recording
        </p>
        <span className="font-display text-ink text-lg tabular-nums">18:42</span>
      </div>
      <p className="text-ink-secondary mt-2 truncate text-[0.8125rem]">{MEETING.title}</p>
      <div className="mt-5 flex h-14 items-center gap-[3px]">
        {WAVE.map((h, i) => (
          <span
            key={i}
            className={i < 17 ? 'bg-accent-graphic' : 'bg-line'}
            style={{ height: `${h}%`, width: '100%', borderRadius: 2 }}
          />
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <span className="bg-ink text-bg inline-flex size-11 shrink-0 items-center justify-center rounded-full">
          <Mic className="size-4" />
        </span>
        <p className="text-ink-muted text-xs leading-snug">Transcribed when you stop.</p>
      </div>
    </ProductFrame>
  )
}

function After() {
  const Owe = DIRECTION_ICON.owe
  const Waiting = DIRECTION_ICON.waiting
  return (
    <ProductFrame
      description={`After: ${brand.name} proposes what the conversation decided — expand to three more teams in January — and two commitments: you send Elena the revised plan by Friday, and Theo confirms the budget code. Nothing is kept until you confirm it.`}
      bodyClassName="p-5"
    >
      <p className="label flex items-center gap-1.5">
        <Scale className="text-accent size-3.5" />
        Decided
      </p>
      <p className="text-ink mt-2 text-[0.9375rem] leading-snug">
        Expand to three more teams in January.
      </p>
      <p className="label mt-5">Commitments</p>
      <ul className="mt-2.5 grid gap-2.5">
        <li className="flex items-center gap-2.5">
          <Avatar name={ELENA.name} size="xs" />
          <span className="text-ink min-w-0 flex-1 truncate text-[0.8125rem]">
            Send revised plan to {firstName(ELENA)}
          </span>
          <Owe className="text-accent size-3.5 shrink-0" />
        </li>
        <li className="flex items-center gap-2.5">
          <Avatar name={THEO.name} size="xs" />
          <span className="text-ink min-w-0 flex-1 truncate text-[0.8125rem]">
            {firstName(THEO)} confirms budget code
          </span>
          <Waiting className="text-ink-muted size-3.5 shrink-0" />
        </li>
      </ul>
      <div className="border-line mt-5 flex items-center justify-between gap-3 border-t pt-4">
        <span className="text-ink-muted text-xs">Kept only when you confirm</span>
        <span className="border-line text-ink inline-flex h-8 items-center rounded-[var(--radius-md)] border px-3 text-xs font-medium">
          Confirm
        </span>
      </div>
    </ProductFrame>
  )
}

const STAGES = [
  { when: 'Before', title: 'Prepare', line: 'Know who, why and what you owe.', Visual: Before },
  { when: 'During', title: 'Capture', line: 'Record or paste the conversation.', Visual: During },
  {
    when: 'After',
    title: 'Remember and follow through',
    line: 'Decisions and promises, kept on your say-so.',
    Visual: After,
  },
]

export function Stages() {
  return (
    <ol className="grid gap-10 md:grid-cols-3 md:gap-6">
      {STAGES.map(({ when, title, line, Visual }, i) => (
        <li key={when} className="flex min-w-0 flex-col">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-accent text-sm tabular-nums">0{i + 1}</span>
            <span className="label">{when}</span>
          </div>
          <h3 className="font-display text-ink mt-2 text-2xl leading-tight">{title}</h3>
          <p className="text-ink-secondary mt-1.5 text-sm">{line}</p>
          <div className="mt-4">
            <Visual />
          </div>
        </li>
      ))}
    </ol>
  )
}
