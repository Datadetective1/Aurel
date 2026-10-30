import { CircleCheck, Mic, Scale } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Chip } from '@/components/visual/chip'
import { DIRECTION_ICON } from '@/components/visual/direction'
import { brand } from '@/lib/brand'
import { ELENA, MEETING, firstName } from './fixtures'
import { ProductFrame } from './frame'

/**
 * BEFORE / DURING / AFTER
 * =============================================================================
 * The loop the product closes, one interface state per stage, each cut to the
 * single thing that shows the action:
 *
 *   before   the brief is ready, and what it is for
 *   during   a recording in progress
 *   after    the decision and the commitment it produced, kept on confirm
 *
 * Illustrations, not screens: each card is a few lines tall on a phone.
 * =============================================================================
 */

/** Fixed bar heights, so the waveform is the same on every render. */
const WAVE = [30, 52, 38, 70, 46, 84, 58, 40, 66, 90, 54, 36, 62, 78, 48, 34, 58, 72, 44, 28]

function Before() {
  return (
    <ProductFrame
      bodyClassName="p-4"
      description={`Before: the brief for "${MEETING.title}" is ready. Objective: ${MEETING.objective}`}
    >
      <Chip icon={CircleCheck} tone="positive">
        Brief ready
      </Chip>
      <p className="font-display text-ink mt-3 text-base leading-snug">{MEETING.objective}</p>
    </ProductFrame>
  )
}

function During() {
  return (
    <ProductFrame
      bodyClassName="p-4"
      description={`During: ${brand.name} is recording "${MEETING.title}", 18 minutes and 42 seconds in, to transcribe when you stop.`}
    >
      <div className="flex items-center gap-3">
        <span className="bg-ink text-bg inline-flex size-9 shrink-0 items-center justify-center rounded-full">
          <Mic className="size-4" />
        </span>
        <p className="label flex items-center gap-1.5">
          <span className="bg-critical size-2 rounded-full" />
          Recording
        </p>
        <span className="font-display text-ink ml-auto text-lg tabular-nums">18:42</span>
      </div>
      <div className="mt-3 flex h-8 items-center gap-[3px]">
        {WAVE.map((h, i) => (
          <span
            key={i}
            className={i < 14 ? 'bg-accent-graphic' : 'bg-line'}
            style={{ height: `${h}%`, width: '100%', borderRadius: 2 }}
          />
        ))}
      </div>
    </ProductFrame>
  )
}

function After() {
  const Owe = DIRECTION_ICON.owe
  return (
    <ProductFrame
      bodyClassName="p-4"
      description={`After: ${brand.name} proposes the decision (expand to three more teams in January) and the commitment it produced: you send ${ELENA.name} the revised plan. Nothing is kept until you confirm it.`}
    >
      <p className="text-ink flex items-start gap-2 text-[0.875rem] leading-snug">
        <Scale className="text-accent mt-0.5 size-3.5 shrink-0" />
        Expand to three more teams in January.
      </p>
      <div className="border-line mt-3 flex items-center gap-2.5 border-t pt-3">
        <Avatar name={ELENA.name} src={ELENA.photo} size="sm" />
        <span className="text-ink min-w-0 flex-1 truncate text-[0.8125rem]">
          Send revised plan to {firstName(ELENA)}
        </span>
        <Owe className="text-accent size-3.5 shrink-0" />
        <span className="border-line text-ink-secondary rounded-[var(--radius-sm)] border px-2 py-0.5 text-[0.6875rem]">
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
    title: 'Remember',
    line: 'Decisions and promises, kept on your say-so.',
    Visual: After,
  },
]

export function Stages() {
  return (
    <ol className="grid gap-6 md:grid-cols-3">
      {STAGES.map(({ when, title, line, Visual }, i) => (
        <li key={when} className="flex min-w-0 flex-col">
          <p className="flex items-baseline gap-2.5">
            <span className="font-display text-accent text-sm tabular-nums">0{i + 1}</span>
            <span className="label">{when}</span>
          </p>
          <h3 className="font-display text-ink mt-1 text-xl leading-tight">
            {title}
            <span className="text-ink-secondary font-sans text-sm">. {line}</span>
          </h3>
          <div className="mt-3">
            <Visual />
          </div>
        </li>
      ))}
    </ol>
  )
}
