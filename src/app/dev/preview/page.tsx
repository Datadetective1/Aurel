import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { VisualPerson } from '@/lib/visual/types'
import { BriefDepthNav } from '@/components/app/brief-depth-nav'
import { LoopList } from '@/components/app/loop-list'
import { TodayShortcuts } from '@/components/app/today-shortcuts'
import { ConversationCard } from '@/components/app/conversation-card'
import { MeetingCockpit } from '@/components/visual/meeting-cockpit'
import { GlanceBrief } from '@/components/visual/glance-brief'
import { QuickBrief } from '@/components/visual/quick-brief'
import { RoomView } from '@/components/visual/room-view'
import { RelationshipMap } from '@/components/visual/relationship-map'
import { MeetingCard } from '@/components/visual/meeting-card'
import { AtlasConnections, AtlasLegend } from '@/components/visual/atlas-connections'
import { PhotoSuggestionCard } from '@/components/visual/photo-suggestion'
import { Container, Eyebrow, SectionHeader } from '@/components/ui/primitives'
import { AppShell } from '@/components/app/app-shell'
import { ConversationDetailView } from '@/components/app/conversation-detail'
import { PersonRelationshipSections } from '@/components/app/person-sections'
import { IdentityRecovery, ResearchPanel } from '@/components/app/research-panel'
import { AboutForm } from '@/components/onboarding/about-form'
import { FirstRun } from '@/components/app/first-run'
import { CalendarReturnNotice } from '@/components/app/calendar-return-notice'
import { ProfileInvite } from '@/components/app/profile-invite'
import { MeetingForm } from '@/components/app/meeting-form'
import { GenerateBriefPanel } from '@/components/app/generate-brief'
import { PersonForm } from '@/components/app/person-form'
import { ScenarioRunner } from '@/components/onboarding/scenario-runner'
import { RevealView } from '@/components/onboarding/reveal-view'
import { CORE_SCENARIOS } from '@/lib/assessment/scenarios'
import { scoreScenarios } from '@/lib/assessment/scenario-scoring'
import { firstRead } from '@/lib/assessment/first-read'
import { brand } from '@/lib/brand'
import { describeZone } from '@/lib/tz'
import { PeopleList } from './preview-people'
import { ConversationsListView } from './preview-conversations'
import { PersonHeroView } from './preview-person'
import { researchCapability } from '@/lib/research/providers'
import { ELENA, NADIA, THEO, type DemoPerson } from '@/components/marketing/home/fixtures'
import {
  CONVERSATION,
  CONVERSATION_DECISIONS,
  CONVERSATION_LOOPS,
  CONVERSATION_ROOM,
  CONVERSATIONS,
  NEXT_TIME,
  OBJECTIONS,
  PEOPLE_CARDS,
  PICKABLE,
  TRANSCRIPT,
} from './fixtures-conversation'
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

const SCREENS = [
  'today',
  'glance',
  'quick',
  'conversation',
  'people',
  'person',
  'person-empty',
  'conversations',
  'atlas',
  // The new-user activation path. Fictional people only.
  'onboarding',
  'activate',
  'meeting-new',
  'brief-prepare',
  'add-person',
  'research-recovery',
  'profile-question',
  'profile-result',
  // Photos and their fallbacks: the homepage's fictional people, plus one
  // person with no photo and one whose photo URL is broken.
  'faces',
] as const
type Screen = (typeof SCREENS)[number]

const TZ = 'America/Toronto'

/** A neutral silhouette, standing in for a found photo in the suggestion card. */
const SILHOUETTE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#d9d2c4"/><circle cx="40" cy="31" r="14" fill="#a99f8c"/><path d="M14 80c2-18 13-27 26-27s24 9 26 27z" fill="#a99f8c"/></svg>',
  )

/** The homepage's fictional people, with their generated portraits. */
const demoFace = (p: DemoPerson, src: string | null = p.photo): VisualPerson => ({
  id: `demo-${p.id}`,
  name: p.name,
  fullName: p.name,
  src,
  title: p.role,
  company: p.org,
  companyDomain: null,
  context: p.context,
  lastInteractionAt: new Date(NOW.getTime() - 9 * 86_400_000).toISOString(),
  openLoops: 1,
  owe: 0,
})
const FACES: VisualPerson[] = [
  demoFace(ELENA),
  demoFace(THEO),
  demoFace(NADIA),
  // No photo on record: initials, as most people will have.
  {
    ...demoFace({ ...NADIA, id: 'ines', name: 'Ines Carvalho', role: 'Procurement Lead' }),
    src: null,
  },
  // A photo URL that fails to load: falls back to initials, not a broken image.
  demoFace(
    { ...THEO, id: 'rafael', name: 'Rafael Ortiz', role: 'IT Director' },
    '/people/missing.webp',
  ),
]

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
    <AppShell
      user={{ name: 'Amary', email: 'preview@example.invalid', avatarUrl: null, plan: 'free' }}
    >
      <nav aria-label="Preview screens" className="border-line bg-surface border-b">
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

      <div>
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
            <PersonHeroView
              personId={columbus.id}
              name={columbus.name}
              fullName={columbus.fullName}
              src={null}
              title={columbus.title}
              company={columbus.company}
              companyDomain={columbus.companyDomain}
              relevance={5}
              relationship="Customer"
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
            <RelationshipMap
              className="mt-5"
              you={{ name: 'Amary', src: null }}
              person={{ name: columbus.name, fullName: columbus.fullName, src: null }}
              organization={{
                name: columbus.company ?? 'Halden Telecom',
                domain: columbus.companyDomain,
                title: columbus.title,
                colleagues: [
                  { id: 'p-maureen', name: 'Maureen Okafor', src: null },
                  { id: 'p-adama', name: 'Adama Diallo', src: null },
                ],
              }}
              meetings={{
                held: 2,
                next: {
                  id: 'm-1',
                  title: 'Prototype review with Columbus',
                  scheduledAt: MEETING_START,
                },
              }}
              conversations={{
                count: 2,
                lastAt: columbus.lastInteractionAt,
                firstAt: new Date(NOW.getTime() - 40 * 86_400_000).toISOString(),
                lastId: 'c-1',
              }}
              directions={countDirections(LOOP_RECORDS.filter((l) => l.personId === columbus.id))}
              background={[{ label: "Queen's University", kind: 'education' }]}
              themes={['Relationship map', 'Pilot scope', 'Data residency']}
              timeZone={TZ}
              now={now}
            />
            <PersonRelationshipSections
              personId={columbus.id}
              name={columbus.name}
              firstName="Columbus"
              loops={LOOP_RECORDS.filter((l) => l.personId === columbus.id)}
              closedCount={1}
              learned={[]}
              interactionCount={2}
              timeline={TIMELINE}
              timeZone={TZ}
              now={now}
            />
          </Container>
        ) : null}

        {screen === 'faces' ? (
          <Container size="default" className="py-8 sm:py-12">
            <MeetingCockpit
              title="Platform renewal review"
              scheduledAt={MEETING_START}
              people={FACES}
              prep="ready"
              openLoops={2}
              owe={1}
              timeZone={TZ}
              now={now}
            />
            <RoomView
              className="mt-8"
              people={FACES}
              centerLabel="2:00 PM"
              centerDetail="Today"
              timeZone={TZ}
              now={now}
            />
            <div className="mt-10">
              <PersonHeroView
                personId={FACES[0]!.id}
                name={FACES[0]!.name}
                fullName={FACES[0]!.fullName}
                src={FACES[0]!.src}
                title={FACES[0]!.title}
                company={FACES[0]!.company}
                companyDomain={null}
                relevance={5}
                relationship="Customer"
              />
            </div>
            <RelationshipMap
              className="mt-5"
              you={{ name: 'You', src: null }}
              person={{ name: FACES[0]!.name, fullName: FACES[0]!.fullName, src: FACES[0]!.src }}
              organization={{
                name: ELENA.org,
                domain: null,
                title: ELENA.role,
                colleagues: FACES.slice(1, 5).map((p) => ({ id: p.id, name: p.name, src: p.src })),
              }}
              meetings={{ held: 4, next: null }}
              conversations={{
                count: 2,
                lastAt: FACES[0]!.lastInteractionAt,
                firstAt: null,
                lastId: null,
              }}
              directions={{ owe: 1, waiting: 0, revisit: 0, personal: 0, completed: 0 }}
              background={[]}
              themes={['Adoption by team', 'Renewal scope']}
              timeZone={TZ}
              now={now}
            />
            <div className="mt-10">
              <PersonHeroView
                personId={FACES[3]!.id}
                name={FACES[3]!.name}
                fullName={FACES[3]!.fullName}
                src={null}
                title={FACES[3]!.title}
                company={FACES[3]!.company}
                companyDomain={null}
                relevance={3}
                relationship="Prospect"
              />
            </div>
            <div className="mt-10">
              <MeetingForm
                people={FACES.map((p) => ({
                  id: p.id,
                  name: p.name,
                  subtitle: [p.title, p.company].join(' · '),
                  photo: p.src,
                }))}
                preselectedPersonId={FACES[0]!.id}
                timeZoneLabel={describeZone(TZ)}
              />
            </div>
          </Container>
        ) : null}

        {screen === 'today' ? (
          <Container size="default" className="py-6 sm:py-12">
            <Eyebrow>Tuesday 13 October</Eyebrow>
            <h1 className="font-display text-ink mt-2 text-[1.75rem] sm:text-4xl">
              Good afternoon, Amary
            </h1>
            <TodayShortcuts className="mt-4" />
            <section className="mt-9">
              <Eyebrow>Upcoming</Eyebrow>
              <h2 className="font-display text-ink mt-2 text-xl">Next seven days</h2>
              <ul className="border-line bg-line mt-5 grid grid-cols-[minmax(0,1fr)] gap-px overflow-hidden rounded-[var(--radius-lg)] border">
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
            <section className="mt-9">
              <Eyebrow>Open loops</Eyebrow>
              <h2 className="font-display text-ink mt-2 text-xl">1 past due</h2>
              <LoopList
                className="mt-5"
                loops={LOOP_RECORDS.slice(0, 3)}
                timeZone={TZ}
                now={now}
                grouped={false}
              />
            </section>
            <section className="mt-9">
              <Eyebrow className="text-accent">Waiting on you</Eyebrow>
              <ul className="mt-4 grid gap-3">
                <ConversationCard conversation={CONVERSATIONS[1]!} timeZone={TZ} now={now} />
              </ul>
            </section>
            <section className="mt-9">
              <Eyebrow>Remember</Eyebrow>
              <h2 className="font-display text-ink mt-2 text-xl">Recent conversations</h2>
              <ul className="mt-5 grid gap-3 sm:grid-cols-3">
                {CONVERSATIONS.map((c) => (
                  <ConversationCard key={c.id} conversation={c} timeZone={TZ} now={now} compact />
                ))}
              </ul>
            </section>
          </Container>
        ) : null}

        {screen === 'conversation' ? (
          <ConversationDetailView
            id="c-1"
            justCreated={false}
            conversation={CONVERSATION}
            meeting={{ id: 'm-old', title: 'Pilot scoping' }}
            wentWell={4}
            timeZone={TZ}
            now={now}
            roomPeople={CONVERSATION_ROOM}
            participantPeople={PICKABLE.slice(0, 2)}
            pickable={PICKABLE}
            speakerSuggestions={[]}
            proposedLoops={[]}
            proposedDecisions={[]}
            confirmedDecisions={CONVERSATION_DECISIONS}
            openKept={CONVERSATION_LOOPS}
            closedKept={[]}
            keptCount={CONVERSATION_LOOPS.length}
            pending={0}
            showReview={false}
            loopPeople={[
              { id: 'p-columbus', name: 'Columbus' },
              { id: 'p-maureen', name: 'Maureen' },
            ]}
            memoryByPerson={new Map()}
            nextTime={NEXT_TIME}
            objections={OBJECTIONS}
            text={TRANSCRIPT}
            grounded={false}
          />
        ) : null}

        {screen === 'people' ? (
          <Container size="default" className="py-8 sm:py-12">
            <h1 className="font-display text-ink text-3xl sm:text-4xl">People</h1>
            <PeopleList people={PEOPLE_CARDS} className="mt-8" />
          </Container>
        ) : null}

        {screen === 'conversations' ? (
          <Container size="default" className="py-8 sm:py-12">
            <h1 className="font-display text-ink text-3xl sm:text-4xl">Conversations</h1>
            <ConversationsListView conversations={CONVERSATIONS} timeZone={TZ} now={now} />
          </Container>
        ) : null}

        {screen === 'person-empty' ? (
          <Container size="default" className="py-8 sm:py-12">
            <PersonHeroView
              personId="p-jonathan"
              name="Jonathan Reyes"
              fullName="Jonathan Reyes"
              src={null}
              title="Principal Engineer"
              company="Northwind Labs"
              companyDomain="northwind.example"
              relevance={4}
              relationship="External contact"
            />
            <PersonRelationshipSections
              personId="p-jonathan"
              name="Jonathan Reyes"
              firstName="Jonathan"
              loops={[]}
              closedCount={0}
              learned={[]}
              interactionCount={0}
              timeline={[]}
              timeZone={TZ}
              now={now}
            />
            <div className="mt-10">
              <ResearchPanel
                personId="p-jonathan"
                personName="Jonathan"
                canDiscover={false}
                discoveryHint={researchCapability().discoveryHint}
                hasProfileUrl={false}
                lastResearchedAt={null}
                sourceCount={0}
                timeZone={TZ}
              />
            </div>
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

        {screen === 'onboarding' ? (
          <Container size="narrow" className="py-6 sm:py-10">
            <AboutForm
              defaults={{
                fullName: '',
                preferredName: '',
                jobTitle: '',
                company: '',
                jobFunction: '',
                seniority: '',
                pronouns: '',
                timezone: 'America/Chicago',
              }}
            />
          </Container>
        ) : null}

        {screen === 'activate' ? (
          <Container size="default" className="py-6 sm:py-12">
            <h1 className="font-display text-ink text-[1.75rem] sm:text-4xl">
              Good morning, Dana.
            </h1>
            <CalendarReturnNotice reason="connected" upcomingCount={0} className="mt-6" />
            <CalendarReturnNotice reason="denied" upcomingCount={0} className="mt-4" />
            <FirstRun
              className="mt-9"
              state={{
                calendarConnected: true,
                calendarAvailable: true,
                upcomingCount: 0,
                unknownAttendees: 0,
                researchedCount: 0,
                peopleCount: 0,
                preparedCount: 0,
                meetingCount: 0,
              }}
            />
            <FirstRun
              className="mt-9"
              state={{
                calendarConnected: false,
                calendarAvailable: true,
                upcomingCount: 0,
                unknownAttendees: 0,
                researchedCount: 0,
                peopleCount: 0,
                preparedCount: 0,
                meetingCount: 0,
              }}
            />
            <ProfileInvite className="mt-9" />
          </Container>
        ) : null}

        {screen === 'meeting-new' ? (
          <Container size="narrow" className="py-8 sm:py-12">
            <SectionHeader
              as="h1"
              eyebrow="Prepare"
              title="What are you preparing for?"
              description="What you need from it, and who is in the room. Then a brief, straight away."
            />
            <div className="mt-8">
              <MeetingForm
                people={[
                  { id: 'p-1', name: 'Maya Chen', subtitle: 'VP Engineering · Northwind' },
                  { id: 'p-2', name: 'Theo Lindqvist', subtitle: 'Finance Director · Northwind' },
                ]}
                preselectedPersonId="p-1"
                timeZoneLabel={describeZone('America/Chicago')}
              />
            </div>
          </Container>
        ) : null}

        {screen === 'brief-prepare' ? (
          <Container size="narrow" className="py-8 sm:py-12">
            <h1 className="font-display text-ink text-3xl">Northwind renewal</h1>
            <GenerateBriefPanel
              meetingId="00000000-0000-4000-8000-000000000000"
              objective="Get approval to move two engineers onto the migration before the quarter closes."
              attendeeCount={1}
              addablePeople={[]}
            />
          </Container>
        ) : null}

        {screen === 'add-person' ? (
          <Container size="narrow" className="py-8 sm:py-12">
            <SectionHeader
              as="h1"
              eyebrow="New relationship"
              title="Add a person"
              description="Start with who they are. Add depth over time."
            />
            <div className="mt-8">
              <PersonForm canResearch discoveryHint={null} />
            </div>
          </Container>
        ) : null}

        {screen === 'research-recovery' ? (
          <Container size="narrow" className="py-8 sm:py-12">
            <h1 className="font-display text-ink text-3xl">Maya Chen</h1>
            <div className="mt-6">
              <IdentityRecovery
                message="I couldn't confidently identify Maya Chen. I reviewed 6 sources and could not confirm any of them were about this person, so none were used."
                missing={['organization', 'jobTitle', 'profileUrl']}
                onRetry={async () => {
                  'use server'
                }}
              />
            </div>
          </Container>
        ) : null}

        {screen === 'profile-question' ? (
          <Container size="narrow" className="py-6 sm:py-10">
            <ScenarioRunner
              assessmentId="00000000-0000-4000-8000-000000000000"
              scenarios={CORE_SCENARIOS}
              initialAnswers={[]}
              finishHref="/dev/preview?screen=profile-result"
              finishLabel={`See my ${brand.assessmentName}`}
            />
          </Container>
        ) : null}

        {screen === 'profile-result' ? (
          <Container size="narrow" className="py-6 sm:py-10">
            {(() => {
              const scored = scoreScenarios(
                CORE_SCENARIOS.map((scenario, i) => ({
                  scenarioId: scenario.id,
                  optionId: scenario.options[[1, 0, 0, 1, 2, 1][i]!]!.id,
                })),
              )
              const read = firstRead(scored, brand.name)
              return (
                <RevealView
                  assessmentId="00000000-0000-4000-8000-000000000000"
                  archetype={scored.archetype}
                  confidence={scored.confidence}
                  tendencies={read.tendencies}
                  explanation={read.explanation}
                />
              )
            })()}
          </Container>
        ) : null}
      </div>
    </AppShell>
  )
}
