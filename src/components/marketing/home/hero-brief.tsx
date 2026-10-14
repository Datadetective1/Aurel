import { brand } from '@/lib/brand'
import { CalendarClock, CircleCheck, Target } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Chip, ChipRow } from '@/components/visual/chip'
import { DIRECTION_ICON } from '@/components/visual/direction'
import { MEETING, OPEN_LOOP, REMEMBER, ROOM, firstName } from './fixtures'
import { OrgMark, ProductFrame } from './frame'

/**
 * HERO: THE BRIEFING COCKPIT
 * =============================================================================
 * The meeting view a user opens on the way in, recomposed from the app's own
 * pieces (Avatar, Chip, the direction icons, the Glance's three blocks). It
 * answers the three questions the product is built around, in the order the
 * eye takes them:
 *
 *   who am I meeting?      faces, first names, organisations
 *   what matters?          objective, three things to remember
 *   what do I need to do?  the one open loop, in the user's direction
 * =============================================================================
 */
export function HeroBrief({ className }: { className?: string }) {
  const orgs = [...new Set(ROOM.map((p) => p.org))]
  const OweIcon = DIRECTION_ICON.owe

  return (
    <ProductFrame
      className={className}
      description={`An ${brand.name} meeting brief for "${MEETING.title}", starting in about two hours. It shows the three people attending — ${ROOM.map((p) => `${p.name}, ${p.role} at ${p.org}`).join('; ')} — marks the brief as ready, and notes one thing you owe. The objective is to ${MEETING.objective.charAt(0).toLowerCase()}${MEETING.objective.slice(1)} It lists three things to remember: ${REMEMBER.map((r) => r.text).join(' ')} The open loop: ${OPEN_LOOP.text}, due today.`}
    >
      <div className="px-5 pt-5 pb-4 sm:px-6">
        <p className="text-ink-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] tracking-[0.12em] uppercase">
          <CalendarClock className="text-accent size-3.5" />
          <span className="text-accent">{MEETING.countdown}</span>
          <span>·</span>
          <span>{MEETING.when}</span>
        </p>
        <p className="font-display text-ink mt-2 text-[1.375rem] leading-tight sm:text-2xl">
          {MEETING.title}
        </p>

        <ul className="mt-4 flex gap-4">
          {ROOM.map((p) => (
            <li key={p.id} className="flex w-16 flex-col items-center gap-1.5 text-center">
              <Avatar name={p.name} size="lg" />
              <span className="text-ink w-full truncate text-xs">{firstName(p)}</span>
            </li>
          ))}
        </ul>

        <ChipRow className="mt-4">
          <Chip icon={CircleCheck} tone="positive">
            Brief ready
          </Chip>
          <Chip icon={OweIcon} tone="accent">
            You owe 1
          </Chip>
          {orgs.map((org) => (
            <Chip key={org} tone="quiet" className="gap-1">
              <OrgMark name={org} size="xs" />
              {org}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <div className="border-line grid gap-5 border-t px-5 py-5 sm:px-6">
        <div>
          <p className="label flex items-center gap-1.5">
            <Target className="text-accent size-3.5" />
            Objective
          </p>
          <p className="font-display text-ink mt-2 text-lg leading-snug text-balance sm:text-[1.25rem]">
            {MEETING.objective}
          </p>
        </div>

        <div>
          <p className="label">Remember</p>
          <ul className="mt-3 grid gap-3">
            {REMEMBER.map((item) => (
              <li key={item.text} className="flex gap-3">
                <span className="bg-accent-graphic mt-[0.5625rem] size-1.5 shrink-0 rounded-full" />
                <span className="min-w-0">
                  <span className="text-ink block text-[0.9375rem] leading-snug">{item.text}</span>
                  <span className="text-ink-muted mt-0.5 block text-xs">{item.basis}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-accent/25 bg-accent-wash rounded-[var(--radius-lg)] border px-4 py-3.5">
          <p className="label text-accent flex items-center gap-1.5">
            <OweIcon className="size-3.5" />
            Open loop
          </p>
          <p className="text-ink mt-2 text-[0.9375rem] leading-snug">{OPEN_LOOP.text}</p>
          <p className="text-ink-muted mt-1 text-xs">{OPEN_LOOP.meta}</p>
        </div>
      </div>
    </ProductFrame>
  )
}
