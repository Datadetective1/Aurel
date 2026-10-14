import { brand } from '@/lib/brand'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CalendarCheck,
  Handshake,
  MessagesSquare,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Chip, ChipRow } from '@/components/visual/chip'
import { ELENA, MEETING, NADIA, ROOM, THEO, type DemoPerson } from './fixtures'
import { OrgMark, ProductFrame } from './frame'

/**
 * SEE THE ROOM
 * =============================================================================
 * The room view: everyone attending, where they sit, and the one thing the
 * record says about each of them. Every line names where it came from --
 * a meeting, a conversation, the user's own records -- because the product
 * never shows context it cannot trace.
 * =============================================================================
 */

const SIGNAL: Record<
  string,
  { icon: typeof CalendarCheck; text: string; basis: string; loop?: 'owe' | 'waiting' }
> = {
  [ELENA.id]: {
    icon: CalendarCheck,
    text: 'Met 4 times since June',
    basis: 'From your meetings',
    loop: 'owe',
  },
  [THEO.id]: {
    icon: MessagesSquare,
    text: 'Wants cost impact first',
    basis: 'Confirmed in conversation',
    loop: 'waiting',
  },
  [NADIA.id]: {
    icon: Handshake,
    text: 'Introduced you to Elena',
    basis: 'From your records',
  },
}

function PersonCard({ person }: { person: DemoPerson }) {
  const signal = SIGNAL[person.id]!
  const Icon = signal.icon
  return (
    <li className="border-line bg-bg grid min-w-0 grid-cols-[auto_1fr] gap-x-4 rounded-[var(--radius-lg)] border p-4 sm:flex sm:flex-col sm:items-center sm:px-4 sm:pt-5 sm:pb-4 sm:text-center">
      {/* A row on a phone, so three people do not stack into a tall column;
          a portrait card from sm up, where the room reads left to right. */}
      <Avatar name={person.name} size="lg" className="sm:hidden" />
      <Avatar name={person.name} size="xl" className="hidden sm:flex" />
      <div className="min-w-0 sm:flex sm:flex-col sm:items-center">
        <p className="font-display text-ink text-lg leading-tight sm:mt-3">{person.name}</p>
        <p className="text-ink-secondary mt-1 text-[0.8125rem]">{person.role}</p>
        <p className="text-ink-muted mt-1.5 flex items-center gap-1.5 text-xs sm:justify-center">
          <OrgMark name={person.org} size="xs" />
          {person.org}
        </p>
        <div className="mt-2.5 sm:mt-3">
          <Chip tone="neutral">{person.context}</Chip>
        </div>
      </div>
      <div className="border-line col-span-2 mt-4 w-full border-t pt-3 text-left">
        <p className="text-ink flex items-center gap-2 text-[0.8125rem]">
          <Icon className="text-accent size-3.5 shrink-0" />
          {signal.text}
        </p>
        <p className="text-ink-muted mt-0.5 pl-[1.375rem] text-[0.6875rem]">{signal.basis}</p>
        {signal.loop ? (
          <p className="text-ink-secondary mt-2 flex items-center gap-2 text-[0.75rem]">
            {signal.loop === 'owe' ? (
              <ArrowUpRight className="text-accent size-3.5 shrink-0" />
            ) : (
              <ArrowDownLeft className="text-ink-muted size-3.5 shrink-0" />
            )}
            {signal.loop === 'owe' ? 'You owe 1' : 'Waiting on 1'}
          </p>
        ) : null}
      </div>
    </li>
  )
}

export function RoomVisual({ className }: { className?: string }) {
  return (
    <ProductFrame
      className={className}
      bodyClassName="bg-bg-sunken p-4 sm:p-6"
      description={`The room for "${MEETING.title}": ${ROOM.map((p) => `${p.name}, ${p.role} at ${p.org}, ${p.context.toLowerCase()}`).join('; ')}. For each person ${brand.name} shows one traced fact: you have met Elena four times since June and owe her one thing; Theo confirmed he wants the cost impact first and you are waiting on him for one thing; Nadia introduced you to Elena, from your own records. Elena and Theo work at the same organisation.`}
    >
      <div className="flex flex-col items-center">
        <span className="border-line bg-surface text-ink inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[0.8125rem]">
          <CalendarCheck className="text-accent size-3.5" />
          {MEETING.title}
          <span className="text-ink-muted">· {MEETING.when.split(' · ')[1]}</span>
        </span>
        {/* The three threads from the meeting down to each person. */}
        <div className="relative hidden h-7 w-2/3 sm:block">
          <span className="bg-line absolute top-0 left-1/2 h-3.5 w-px" />
          <span className="border-line absolute top-3.5 right-0 left-0 h-3.5 rounded-t-md border-x border-t" />
          <span className="bg-line absolute top-3.5 left-1/2 h-3.5 w-px" />
        </div>
      </div>

      <ul className="mt-4 grid gap-3 sm:mt-0 sm:grid-cols-3">
        {ROOM.map((p) => (
          <PersonCard key={p.id} person={p} />
        ))}
      </ul>

      <ChipRow className="mt-4 justify-center">
        <Chip icon={Building2} tone="quiet">
          Elena and Theo · same organisation
        </Chip>
        <Chip icon={ArrowUpRight} tone="quiet">
          2 open loops in this room
        </Chip>
      </ChipRow>
    </ProductFrame>
  )
}
