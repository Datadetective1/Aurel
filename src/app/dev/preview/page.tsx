import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { BriefDepthNav } from '@/components/app/brief-depth-nav'
import { LoopList } from '@/components/app/loop-list'
import { PersonHero } from '@/components/app/person-hero'
import { MeetingCockpit } from '@/components/visual/meeting-cockpit'
import { GlanceBrief } from '@/components/visual/glance-brief'
import { QuickBrief } from '@/components/visual/quick-brief'
import { RoomView } from '@/components/visual/room-view'
import { PersonGlance } from '@/components/visual/person-glance'
import { RelationshipTimeline } from '@/components/visual/timeline'
import { MeetingCard } from '@/components/visual/meeting-card'
import { AtlasConnections, AtlasLegend } from '@/components/visual/atlas-connections'
import { PhotoSuggestionCard } from '@/components/visual/photo-suggestion'
import { Container, Eyebrow } from '@/components/ui/primitives'
import { ThemeToggle } from '@/components/theme-provider'
import { listeningCues } from '@/lib/brief'
import { countDirections } from '@/lib/visual/relationship-actions'
import {
  BRIEF,
  CONNECTIONS,
  GLANCE,
  LAST_CONVERSATION,
  LOOP_RECORDS,
  LOOPS,
  MEETING_START,
  MEETINGS,
  NOW,
  PEOPLE,
  TIMELINE,
} from './fixtures'

export const metadata: Metadata = {
  title: 'Visual preview',
  robots: { index: false, follow: false },
}

/**
 * VISUAL PREVIEW — development and preview deployments only.
 *
 * The visual surfaces rendered against invented fixtures, so the redesign can
 * be looked at, screenshotted and reviewed without signing in and without
 * reading or writing anyone's real record. Every component here is the one
 * the signed-in pages render; only the data is made up.
 *
 * 404 on a production deployment.
 */

const SCREENS = ['glance', 'quick', 'person', 'today', 'atlas'] as const
type Screen = (typeof SCREENS)[number]

const TZ = 'America/Toronto'

/** A neutral silhouette, standing in for a found photo in the suggestion card. */
const SILHOUETTE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#d9d2c4"/><circle cx="40" cy="31" r="14" fill="#a99f8c"/><path d="M14 80c2-18 13-27 26-27s24 9 26 27z" fill="#a99f8c"/></svg>',
  )

export default async function VisualPreview({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string }>
}) {
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview') notFound()

  const { screen: raw } = await searchParams
  const screen: Screen = SCREENS.includes(raw as Screen) ? (raw as Screen) : 'glance'
  const now = NOW
  const columbus = PEOPLE[0]!
  const room = PEOPLE.slice(0, 3)
  const cues = listeningCues(BRIEF, {
    openCommitments: [{ description: LOOPS[0]!.description, owner: 'user' }],
  })

  return (
    <div className="bg-bg min-h-dvh">
      <nav
        aria-label="Preview screens"
        className="border-line bg-surface sticky top-0 z-30 border-b"
      >
        <Container size="default" className="flex flex-wrap items-center gap-2 py-2">
          <span className="label mr-2">Preview</span>
          {SCREENS.map((s) => (
            <Link
              key={s}
              href={`/dev/preview?screen=${s}`}
              aria-current={s === screen ? 'page' : undefined}
              className="text-ink-secondary aria-[current=page]:bg-bg-sunken aria-[current=page]:text-ink inline-flex min-h-9 items-center rounded-full px-3 text-xs capitalize"
            >
              {s}
            </Link>
          ))}
          <span className="ml-auto">
            <ThemeToggle />
          </span>
        </Container>
      </nav>

      <main id="main">
        {screen === 'glance' ? (
          <Container size="narrow" className="py-6 sm:py-10">
            <MeetingCockpit
              title="Prototype review with Columbus"
              scheduledAt={MEETING_START}
              people={[columbus]}
              prep="ready"
              openLoops={2}
              owe={1}
              timeZone={TZ}
              now={now}
            />
            <BriefDepthNav meetingId="m-1" current="glance" className="mt-6" />
            <GlanceBrief glance={GLANCE} meetingId="m-1" timeZone={TZ} now={now} className="mt-7" />
          </Container>
        ) : null}

        {screen === 'quick' ? (
          <Container size="narrow" className="py-6 sm:py-10">
            <MeetingCockpit
              title="Halden pilot planning"
              scheduledAt={MEETING_START}
              people={room}
              prep="ready"
              openLoops={3}
              owe={1}
              timeZone={TZ}
              now={now}
            />
            <BriefDepthNav meetingId="m-1" current="quick" className="mt-6" />
            <div className="mt-8">
              <QuickBrief
                brief={BRIEF}
                people={room}
                connections={CONNECTIONS.filter(
                  (c) => room.some((p) => p.id === c.a) && room.some((p) => p.id === c.b),
                )}
                loops={LOOPS}
                lastConversation={LAST_CONVERSATION}
                cues={cues}
                centerLabel="2:00 PM"
                timeZone={TZ}
                now={now}
              />
            </div>
          </Container>
        ) : null}

        {screen === 'person' ? (
          <Container size="default" className="py-8 sm:py-12">
            <PersonHero
              personId={columbus.id}
              name={columbus.name}
              fullName={columbus.fullName}
              src={null}
              title={columbus.title}
              company={columbus.company}
              companyDomain={columbus.companyDomain}
              facts={[{ label: 'Customer' }, { label: 'Importance 5/5', tone: 'outline' }]}
            />
            <PhotoSuggestionCard
              className="mt-4"
              personId={columbus.id}
              personName={columbus.fullName}
              suggestion={{
                id: '00000000-0000-4000-8000-000000000000',
                src: SILHOUETTE,
                sourceUrl: 'https://halden.example/leadership/columbus-brown',
                sourceLabel: 'Halden Telecom — Leadership',
              }}
            />
            <PersonGlance
              className="mt-5"
              firstName="Columbus"
              lastInteractionAt={columbus.lastInteractionAt}
              firstInteractionAt={new Date(NOW.getTime() - 40 * 86_400_000).toISOString()}
              nextMeeting={{
                id: 'm-1',
                title: 'Prototype review with Columbus',
                scheduledAt: MEETING_START,
              }}
              directions={countDirections(LOOP_RECORDS.filter((l) => l.personId === columbus.id))}
              themes={['Relationship map', 'Pilot scope', 'Data residency']}
              timeZone={TZ}
              now={now}
            />
            <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-12">
              <section>
                <Eyebrow>Open loops</Eyebrow>
                <h2 className="font-display text-ink mt-2 text-xl">2 open with Columbus</h2>
                <LoopList
                  className="mt-5"
                  loops={LOOP_RECORDS.filter((l) => l.personId === columbus.id)}
                  timeZone={TZ}
                  now={now}
                  showPerson={false}
                />
              </section>
              <section>
                <Eyebrow>Relationship memory</Eyebrow>
                <h2 className="font-display text-ink mt-2 text-xl">2 conversations on record</h2>
                <RelationshipTimeline
                  className="mt-5"
                  entries={TIMELINE}
                  timeZone={TZ}
                  initial={5}
                />
              </section>
            </div>
          </Container>
        ) : null}

        {screen === 'today' ? (
          <Container size="default" className="py-8 sm:py-12">
            <Eyebrow>Tuesday 13 October</Eyebrow>
            <h1 className="font-display text-ink mt-2 text-3xl">Good afternoon, Amary</h1>
            <section className="mt-10">
              <Eyebrow>Upcoming</Eyebrow>
              <h2 className="font-display text-ink mt-2 text-xl">Next seven days</h2>
              <ul className="border-line bg-line mt-5 grid gap-px overflow-hidden rounded-[var(--radius-lg)] border">
                {MEETINGS.map((m) => (
                  <li key={m.id} className="bg-bg">
                    <MeetingCard
                      id={m.id}
                      title={m.title}
                      scheduledAt={m.scheduledAt}
                      objective={m.objective}
                      people={m.people}
                      prep={m.prep}
                      openLoops={m.openLoops}
                      owe={m.owe}
                      important={m.important}
                      timeZone={TZ}
                      now={now}
                    />
                  </li>
                ))}
              </ul>
            </section>
          </Container>
        ) : null}

        {screen === 'atlas' ? (
          <Container size="default" className="py-8 sm:py-12">
            <h1 className="font-display text-ink text-3xl sm:text-4xl">Relationship Atlas</h1>
            <section className="mt-10">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <Eyebrow>Connections on record</Eyebrow>
                <AtlasLegend />
              </div>
              <AtlasConnections
                className="mt-5"
                connections={CONNECTIONS.filter((c) => c.kind !== 'same_organization')}
                people={new Map(PEOPLE.map((p) => [p.id, p]))}
              />
            </section>
            <section className="mt-12">
              <RoomView
                people={PEOPLE}
                connections={CONNECTIONS}
                centerLabel="2:00 PM"
                centerDetail="Today"
                timeZone={TZ}
                now={now}
              />
            </section>
          </Container>
        ) : null}
      </main>
    </div>
  )
}
