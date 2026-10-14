import { brand } from '@/lib/brand'
import { CalendarCheck, CalendarClock, Check, Handshake, Scale } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { ELENA, MEETING } from './fixtures'
import { OrgMark, ProductFrame } from './frame'

/**
 * RELATIONSHIP MEMORY
 * =============================================================================
 * A person's timeline, as the person page draws it: meetings, the decisions
 * they produced, the promises made in them and the day each was kept, ending
 * in the meeting that is coming up. Every entry names its kind in words, so
 * nothing depends on the colour of its dot.
 * =============================================================================
 */

type Kind = 'meeting' | 'decision' | 'commitment' | 'completed' | 'upcoming'

const KIND: Record<Kind, { label: string; icon: typeof Check; dot: string }> = {
  meeting: { label: 'Meeting', icon: CalendarCheck, dot: 'text-ink-secondary' },
  decision: { label: 'Decision', icon: Scale, dot: 'text-info' },
  commitment: { label: 'Commitment', icon: Handshake, dot: 'text-accent' },
  completed: { label: 'Completed', icon: Check, dot: 'text-positive' },
  upcoming: { label: 'Next', icon: CalendarClock, dot: 'text-accent' },
}

const ENTRIES: { date: string; kind: Kind; text: string; note?: string }[] = [
  { date: 'Jun 12', kind: 'meeting', text: 'Discovery call' },
  { date: 'Jul 3', kind: 'decision', text: 'Pilot with two teams first' },
  { date: 'Jul 3', kind: 'commitment', text: 'You send the pilot plan', note: 'I owe them' },
  { date: 'Jul 9', kind: 'completed', text: 'Pilot plan sent' },
  { date: 'Sep 18', kind: 'meeting', text: 'Pilot review' },
  {
    date: 'Sep 18',
    kind: 'commitment',
    text: 'Elena shares adoption data',
    note: 'Waiting on them',
  },
  { date: 'Sep 25', kind: 'completed', text: 'Adoption data received' },
  { date: 'Thu', kind: 'upcoming', text: MEETING.title, note: 'Brief ready' },
]

export function MemoryTimeline({ className }: { className?: string }) {
  return (
    <ProductFrame
      className={className}
      description={`${brand.name}'s timeline of your relationship with ${ELENA.name}: ${ENTRIES.map((e) => `${e.date}, ${KIND[e.kind].label.toLowerCase()}: ${e.text}${e.note ? ` (${e.note.toLowerCase()})` : ''}`).join('; ')}.`}
    >
      <div className="border-line flex items-center gap-3.5 border-b px-5 py-4 sm:px-6">
        <Avatar name={ELENA.name} size="md" />
        <div className="min-w-0">
          <p className="font-display text-ink text-lg leading-tight">{ELENA.name}</p>
          <p className="text-ink-muted mt-0.5 flex items-center gap-1.5 text-xs">
            <OrgMark name={ELENA.org} size="xs" />
            {ELENA.role} · 4 meetings since June
          </p>
        </div>
      </div>

      <ol className="px-5 py-5 sm:px-6">
        {ENTRIES.map((entry, i) => {
          const meta = KIND[entry.kind]
          const Icon = meta.icon
          const last = i === ENTRIES.length - 1
          return (
            <li
              key={`${entry.date}-${entry.text}`}
              className="grid grid-cols-[3.25rem_1.75rem_1fr]"
            >
              <span className="text-ink-muted pt-1 text-xs tabular-nums">{entry.date}</span>
              <span className="relative flex justify-center">
                {!last ? <span className="bg-line absolute top-6 bottom-0 w-px" /> : null}
                <span
                  className={cn(
                    'border-line bg-surface relative flex size-6 items-center justify-center rounded-full border',
                    entry.kind === 'upcoming' && 'border-accent/40 bg-accent-wash',
                  )}
                >
                  <Icon className={cn('size-3', meta.dot)} />
                </span>
              </span>
              <div className={cn('min-w-0 pl-2', last ? 'pb-0' : 'pb-4')}>
                <p className="label text-[0.625rem]">{meta.label}</p>
                <p
                  className={cn(
                    'mt-1 text-[0.875rem] leading-snug',
                    entry.kind === 'upcoming' ? 'font-display text-ink text-base' : 'text-ink',
                  )}
                >
                  {entry.text}
                </p>
                {entry.note ? (
                  <p className="text-ink-muted mt-0.5 text-[0.6875rem]">{entry.note}</p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </ProductFrame>
  )
}
