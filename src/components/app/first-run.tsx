import Link from 'next/link'
import { CalendarPlus, Check, Sparkles, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Eyebrow, Panel } from '@/components/ui/primitives'
import { brand } from '@/lib/brand'

/**
 * FIRST RUN
 * =============================================================================
 * The one activation sequence, in the same words the welcome email uses:
 *
 *   1. Find the meeting      connect your calendar, OR create one by hand
 *   2. Choose who it's with  pick or add the person; research happens here
 *   3. Prepare it            say what you need, get the brief
 *
 * It exists because a new account said nothing about the calendar, and later
 * because the panel and the welcome email taught two different journeys. Now
 * there is one, and research is part of choosing the person rather than a
 * separate concept a first-time user has to understand.
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
  /** Meetings of any origin, calendar or manual. */
  meetingCount: number
}

/** Step one is having a meeting to prepare; the calendar is one way, not the only one. */
function meetingStepDone(state: FirstRunState): boolean {
  return state.calendarConnected || state.meetingCount > 0
}

export function firstRunComplete(state: FirstRunState): boolean {
  return meetingStepDone(state) && state.peopleCount > 0 && state.preparedCount > 0
}

/** The OAuth start, returning to Today rather than Settings. */
export const CALENDAR_CONNECT_HREF = '/api/calendar/microsoft/connect?return=today'

export function FirstRun({ state, className }: { state: FirstRunState; className?: string }) {
  if (firstRunComplete(state)) return null

  const meetingDone = meetingStepDone(state)
  const personDone = state.peopleCount > 0
  const prepareDone = state.preparedCount > 0

  const meetingActions: { label: string; href: string }[] = []
  if (!state.calendarConnected && state.calendarAvailable) {
    meetingActions.push({ label: 'Connect Microsoft 365', href: CALENDAR_CONNECT_HREF })
  }
  if (!meetingDone || (state.calendarConnected && state.upcomingCount === 0)) {
    meetingActions.push({ label: 'Create a meeting manually', href: '/meetings/new' })
  }

  return (
    <Panel className={className}>
      <div className="p-6 sm:p-7">
        <div className="flex items-start gap-3">
          <Sparkles className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <Eyebrow>Getting started</Eyebrow>
            <p className="text-ink font-display mt-3 text-xl leading-snug">
              Let&rsquo;s prepare for one real conversation.
            </p>
            <p className="text-ink-secondary mt-2 text-sm leading-relaxed">
              Three steps. Each one makes the next easier.
            </p>

            <ol className="border-line mt-6 grid gap-5 border-t pt-5">
              <Step
                index={1}
                done={meetingDone}
                icon={<CalendarPlus className="size-4" aria-hidden="true" />}
                title="Find the meeting"
                // Says what it does and what it will not do, in the same
                // breath. Read-only is the thing a person hesitates over.
                body={
                  state.calendarConnected
                    ? state.upcomingCount > 0
                      ? `Calendar connected. ${state.upcomingCount} upcoming ${state.upcomingCount === 1 ? 'meeting' : 'meetings'} in the next two weeks.`
                      : 'Calendar connected. Nothing scheduled in the next two weeks — create the meeting by hand.'
                    : state.meetingCount > 0
                      ? 'You have a meeting to prepare.'
                      : state.calendarAvailable
                        ? `Connect your calendar and ${brand.name} finds the meetings and the people for you. Read-only — it never creates, edits or answers anything. Or create one meeting by hand.`
                        : 'Create the meeting by hand — preparation works the same way.'
                }
                actions={meetingActions}
              />

              <Step
                index={2}
                done={personDone}
                icon={<UserRound className="size-4" aria-hidden="true" />}
                title="Choose who it’s with"
                body={
                  personDone
                    ? state.researchedCount > 0
                      ? `${state.peopleCount} ${state.peopleCount === 1 ? 'person' : 'people'} added, ${state.researchedCount} researched.`
                      : `${state.peopleCount} ${state.peopleCount === 1 ? 'person' : 'people'} added. Research from their page to confirm who they are.`
                    : state.unknownAttendees > 0
                      ? `${state.unknownAttendees} ${state.unknownAttendees === 1 ? 'person' : 'people'} on your calendar ${state.unknownAttendees === 1 ? 'is' : 'are'} not in ${brand.name} yet. A name, a company and a role is enough — it then checks legitimate public professional sources to confirm who they are.`
                      : `A name, a company and a role is enough. ${brand.name} then checks legitimate public professional sources to confirm who they are, and accepts nothing it cannot match.`
                }
                actions={personDone ? [] : [{ label: 'Add the person', href: '/people/new' }]}
              />

              <Step
                index={3}
                done={prepareDone}
                icon={<Sparkles className="size-4" aria-hidden="true" />}
                title="Prepare the meeting"
                body={
                  prepareDone
                    ? `${state.preparedCount} ${state.preparedCount === 1 ? 'brief' : 'briefs'} built. After the meeting, debrief it — that is what makes the next one sharper.`
                    : `Say what you need from the conversation, and ${brand.name} turns everything it knows into how to open, what to emphasize and what to leave with.`
                }
                actions={
                  prepareDone
                    ? []
                    : [
                        state.calendarConnected && state.upcomingCount > 0
                          ? { label: 'Pick a meeting', href: '/meetings' }
                          : { label: 'Prepare a meeting', href: '/meetings/new' },
                      ]
                }
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
  actions,
}: {
  index: number
  done: boolean
  icon: React.ReactNode
  title: string
  body: string
  actions: { label: string; href: string }[]
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

        {actions.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {actions.map((action, i) => (
              <Button
                key={action.href}
                asChild
                size="sm"
                variant={i === 0 ? 'secondary' : 'ghost'}
                className="h-11"
              >
                {/* A plain anchor for the OAuth start, never next/link.
                    Link prefetches its href, and prefetching this one executed
                    the connect route on page load: it minted OAuth state, fired
                    calendar_connect_started, and redirected to Microsoft -- so
                    every visit to Today counted as a connection attempt nobody
                    made, and the funnel said connection almost never converts. */}
                {action.href.startsWith('/api/') ? (
                  <a href={action.href}>{action.label}</a>
                ) : (
                  <Link href={action.href}>{action.label}</Link>
                )}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  )
}
