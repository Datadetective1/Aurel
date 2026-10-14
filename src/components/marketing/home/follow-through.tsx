import { brand } from '@/lib/brand'
import { Avatar } from '@/components/ui/avatar'
import { DIRECTION_ICON } from '@/components/visual/direction'
import { DIRECTION_META, type ActionDirection } from '@/lib/visual/relationship-actions'
import { cn } from '@/lib/utils'
import { ELENA, NADIA, THEO, firstName, type DemoPerson } from './fixtures'
import { ProductFrame } from './frame'

/**
 * FOLLOW THROUGH
 * =============================================================================
 * The relationship-native lens over open loops: not a task list, but the
 * direction each promise runs between you and someone else. Labels and icons
 * are the app's own (`DIRECTION_META`, `DIRECTION_ICON`), so the homepage
 * says exactly what the product says.
 * =============================================================================
 */

const LANES: {
  direction: ActionDirection
  items: { text: string; person: DemoPerson; meta: string }[]
}[] = [
  {
    direction: 'owe',
    items: [
      { text: 'Adoption breakdown', person: ELENA, meta: 'Due today' },
      { text: 'Revised plan', person: ELENA, meta: 'Friday' },
    ],
  },
  {
    direction: 'waiting',
    items: [
      { text: 'Budget code', person: THEO, meta: 'Asked Thursday' },
      { text: 'Security review notes', person: NADIA, meta: 'Next week' },
    ],
  },
  {
    direction: 'revisit',
    items: [{ text: 'Onboarding capacity in Q1', person: NADIA, meta: 'Next meeting' }],
  },
  {
    direction: 'completed',
    items: [
      { text: 'Pilot plan sent', person: ELENA, meta: 'Jul 9' },
      { text: 'Adoption data received', person: ELENA, meta: 'Sep 25' },
    ],
  },
]

export function FollowThroughVisual({ className }: { className?: string }) {
  return (
    <ProductFrame
      className={className}
      bodyClassName="bg-bg-sunken p-3 sm:p-4"
      description={`${brand.name}'s follow-through view, grouped by direction. ${LANES.map((l) => `${DIRECTION_META[l.direction].label}: ${l.items.map((i) => `${i.text} (${firstName(i.person)}, ${i.meta.toLowerCase()})`).join(', ')}`).join('. ')}.`}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {LANES.map((lane) => {
          const Icon = DIRECTION_ICON[lane.direction]
          const done = lane.direction === 'completed'
          return (
            <section
              key={lane.direction}
              className="border-line bg-surface rounded-[var(--radius-lg)] border p-4"
            >
              <p
                className={cn(
                  'label flex items-center gap-1.5',
                  lane.direction === 'owe' && 'text-accent',
                  done && 'text-positive',
                )}
              >
                <Icon className="size-3.5" />
                {DIRECTION_META[lane.direction].label}
                <span className="text-ink-muted ml-auto tabular-nums">{lane.items.length}</span>
              </p>
              <ul className="mt-3 grid gap-2.5">
                {lane.items.map((item) => (
                  <li key={item.text} className="flex items-center gap-2.5">
                    <Avatar name={item.person.name} size="xs" />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate text-[0.8125rem] leading-snug',
                          done ? 'text-ink-muted line-through' : 'text-ink',
                        )}
                      >
                        {item.text}
                      </span>
                      <span className="text-ink-muted block text-[0.6875rem]">
                        {firstName(item.person)} · {item.meta}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </ProductFrame>
  )
}
