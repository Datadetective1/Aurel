import { CalendarClock, Target } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { DIRECTION_ICON } from '@/components/visual/direction'
import { brand } from '@/lib/brand'
import { MEETING, OPEN_LOOP, REMEMBER, ROOM, firstName } from './fixtures'
import { ProductFrame } from './frame'

/**
 * HERO: THE BRIEF, AT A GLANCE
 * =============================================================================
 * Not the whole brief -- the five things that make the point in a second:
 *
 *   when             the countdown and the time
 *   who              their faces and first names
 *   what for         the objective
 *   what to recall   one thing to remember, with where it came from
 *   what you owe     the one open loop
 *
 * Built from the app's own pieces (Avatar, the direction icons, the Glance's
 * blocks) so the promise is the product, at a size that leaves the hero short
 * on a phone.
 * =============================================================================
 */
export function HeroBrief({ className }: { className?: string }) {
  const OweIcon = DIRECTION_ICON.owe
  const remember = REMEMBER[0]!

  return (
    <ProductFrame
      className={className}
      note="Illustrative example · fictional people"
      description={`An ${brand.name} meeting brief for "${MEETING.title}", starting in about two hours, with ${ROOM.map((p) => `${p.name}, ${p.role} at ${p.org}`).join('; ')}. Objective: ${MEETING.objective} Remember: ${remember.text} (${remember.basis.toLowerCase()}). Open loop: ${OPEN_LOOP.text}, due today.`}
    >
      <div className="px-5 pt-4 pb-4 sm:px-6 sm:pt-5">
        <p className="text-ink-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] tracking-[0.12em] uppercase">
          <CalendarClock className="text-accent size-3.5" />
          <span className="text-accent">{MEETING.countdown}</span>
          <span>·</span>
          <span>{MEETING.when}</span>
        </p>
        <div className="mt-2 flex items-center justify-between gap-4">
          <p className="font-display text-ink min-w-0 text-xl leading-tight sm:text-2xl">
            {MEETING.title}
          </p>
          {/* Negative margins: the faces are larger than the title line, and
              overhang it rather than making the card taller. */}
          <ul className="-my-0.5 flex shrink-0 -space-x-3 sm:-my-2">
            {ROOM.map((p) => (
              <li key={p.id}>
                <Avatar
                  name={p.name}
                  src={p.photo}
                  priority
                  className="ring-surface size-11 ring-2 sm:size-14"
                />
              </li>
            ))}
          </ul>
        </div>
        <p className="text-ink-muted mt-1 text-xs">
          {ROOM.map((p) => firstName(p)).join(', ')} · {ROOM[0]!.org}
        </p>
      </div>

      <div className="border-line grid gap-4 border-t px-5 py-4 sm:px-6 sm:py-5">
        <div>
          <p className="label flex items-center gap-1.5">
            <Target className="text-accent size-3.5" />
            Objective
          </p>
          <p className="font-display text-ink mt-1.5 text-lg leading-snug text-balance">
            {MEETING.objective}
          </p>
        </div>

        <div className="flex gap-3">
          <span className="bg-accent-graphic mt-[0.5625rem] size-1.5 shrink-0 rounded-full" />
          <span className="min-w-0">
            <span className="label block">Remember</span>
            <span className="text-ink mt-1 block text-[0.9375rem] leading-snug">
              {remember.text}
            </span>
            <span className="text-ink-muted mt-0.5 block text-xs">{remember.basis}</span>
          </span>
        </div>

        <div className="border-accent/25 bg-accent-wash flex items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3">
          <OweIcon className="text-accent mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">
            <span className="text-ink block text-[0.9375rem] leading-snug">{OPEN_LOOP.text}</span>
            <span className="text-ink-muted mt-0.5 block text-xs">{OPEN_LOOP.meta}</span>
          </span>
        </div>
      </div>
    </ProductFrame>
  )
}
