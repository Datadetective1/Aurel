import Link from 'next/link'
import { CalendarPlus, Check, Search, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Eyebrow, Panel } from '@/components/ui/primitives'
import { brand } from '@/lib/brand'

/**
 * FIRST RUN
 * =============================================================================
 * The three things that turn an empty account into a useful one, in the order
 * that makes each one easier than the last.
 *
 * It exists because a new account said nothing about the calendar. Today read
 * "add one person you work with often", People said the same, Meetings said
 * "tell Atturel who is in the room" — and the one mechanism that finds the
 * meetings AND the people for you was reachable only by guessing at
 * Settings → Capabilities. The product's best path was its least visible one.
 *
 * Deliberately not a tour. No modal, no overlay, no tooltips, no dismiss state
 * to remember. It is a panel that reads the account and disappears on its own
 * once all three are done, because a checklist that has to be dismissed is a
 * checklist that outstays its welcome.
 *
 * Every step is a real link to the real screen. Nothing here is instructional
 * text pretending to be an action, and nothing claims a step is done unless the
 * record says it is.
 * =============================================================================
 */

export interface FirstRunState {
  /** A provider is connected and returning events. */
  calendarConnected: boolean
  /** This deployment can offer a calendar at all. */
  calendarAvailable: boolean
  /** Synced events in the horizon, once connected. */
  upcomingCount: number
  /** Attendees on those events with no Person record yet. */
  unknownAttendees: number
  /** People whose public footprint has been researched. */
  researchedCount: number
  peopleCount: number
  /** Briefs generated. */
  preparedCount: number
}

export function firstRunComplete(state: FirstRunState): boolean {
  // Calendar counts as settled either way on a deployment that cannot offer it,
  // so an operator without an OAuth app does not get a permanent checklist.
  const calendarDone = state.calendarConnected || !state.calendarAvailable
  return calendarDone && state.researchedCount > 0 && state.preparedCount > 0
}

export function FirstRun({ state, className }: { state: FirstRunState; className?: string }) {
  if (firstRunComplete(state)) return null

  const calendarDone = state.calendarConnected || !state.calendarAvailable
  const researchDone = state.researchedCount > 0
  const prepareDone = state.preparedCount > 0

  return (
    <Panel className={className}>
      <div className="p-6 sm:p-7">
        <div className="flex items-start gap-3">
          <Sparkles className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <Eyebrow>Getting started</Eyebrow>
            <p className="text-ink mt-3 font-display text-xl leading-snug">
              You&rsquo;re ready. Let&rsquo;s make {brand.name} useful.
            </p>
            <p className="text-ink-secondary mt-2 text-sm leading-relaxed">
              Three steps, in this order. Each one makes the next easier.
            </p>

            <ol className="border-line mt-6 grid gap-5 border-t pt-5">
              <Step
                index={1}
                done={calendarDone}
                icon={<CalendarPlus className="size-4" aria-hidden="true" />}
                title="Connect your calendar"
                // Says what it does and what it will not do, in the same
                // breath. Read-only is the thing a person hesitates over.
                body={
                  state.calendarConnected
                    ? state.upcomingCount > 0
                      ? `${state.upcomingCount} upcoming ${state.upcomingCount === 1 ? 'meeting' : 'meetings'} in the next two weeks.`
                      : 'Connected. Nothing scheduled in the next two weeks yet.'
                    : state.calendarAvailable
                      ? `${brand.name} reads your next two weeks so it can find the meetings and the people for you. Read-only — it never creates, edits or answers anything.`
                      : 'No calendar provider is configured on this deployment, so meetings are added by hand.'
                }
                action={
                  !state.calendarConnected && state.calendarAvailable
                    ? { label: 'Connect Microsoft 365', href: '/api/calendar/microsoft/connect' }
                    : undefined
                }
              />

              <Step
                index={2}
                done={researchDone}
                icon={<Search className="size-4" aria-hidden="true" />}
                title="Research someone you're meeting"
                body={
                  researchDone
                    ? `${state.researchedCount} ${state.researchedCount === 1 ? 'person' : 'people'} researched.`
                    : state.unknownAttendees > 0
                      ? `${state.unknownAttendees} ${state.unknownAttendees === 1 ? 'person' : 'people'} on your calendar ${state.unknownAttendees === 1 ? 'is' : 'are'} not in ${brand.name} yet. A name, a company and a role is enough — it searches legitimate public professional sources and checks each one is genuinely about them.`
                      : `A name, a company and a role is enough. ${brand.name} searches legitimate public professional sources and checks each one is genuinely about them before accepting anything.`
                }
                action={
                  researchDone
                    ? undefined
                    : { label: state.peopleCount > 0 ? 'Go to People' : 'Add a person', href: state.peopleCount > 0 ? '/people' : '/people/new' }
                }
              />

              <Step
                index={3}
                done={prepareDone}
                icon={<Sparkles className="size-4" aria-hidden="true" />}
                title="Prepare for your next meeting"
                body={
                  prepareDone
                    ? `${state.preparedCount} ${state.preparedCount === 1 ? 'brief' : 'briefs'} built. After the meeting, debrief it — that is what makes the next one sharper.`
                    : `Say what you need out of the conversation, and ${brand.name} turns everything it knows into how to open, what to emphasize and what to leave with.`
                }
                action={prepareDone ? undefined : { label: 'Go to Meetings', href: '/meetings' }}
              />
            </ol>
          </div>
        </div>
      </div>
    </Panel>
  )
}

function Step({
  index,
  done,
  icon,
  title,
  body,
  action,
}: {
  index: number
  done: boolean
  icon: React.ReactNode
  title: string
  body: string
  action?: { label: string; href: string }
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className={
          done
            ? 'bg-accent-graphic/15 text-accent mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full'
            : 'border-line text-ink-muted mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs'
        }
      >
        {done ? <Check className="size-3.5" /> : index}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={
            done
              ? 'text-ink-muted flex items-center gap-1.5 text-sm line-through'
              : 'text-ink flex items-center gap-1.5 text-sm font-medium'
          }
        >
          <span className="text-ink-faint shrink-0">{icon}</span>
          {title}
        </p>
        <p className="text-ink-secondary mt-1 text-xs leading-relaxed">{body}</p>

        {action ? (
          <Button asChild size="sm" variant="secondary" className="mt-2.5">
            {/* A plain anchor for the OAuth start, never next/link.
                Link prefetches its href, and prefetching this one executed the
                connect route on page load: it minted OAuth state, fired
                calendar_connect_started, and redirected to Microsoft -- so
                every visit to Today counted as a connection attempt nobody
                made, and the funnel said connection almost never converts. */}
            {action.href.startsWith('/api/') ? (
              <a href={action.href}>{action.label}</a>
            ) : (
              <Link href={action.href}>{action.label}</Link>
            )}
          </Button>
        ) : null}
      </div>
    </li>
  )
}
