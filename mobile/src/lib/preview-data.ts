import type {
  AccountResponse,
  ArchivedPeopleResponse,
  AtlasResponse,
  AskResponse,
  CalendarConnection,
  CalendarSyncResponse,
  CaptureResponse,
  DeletionPreviewResponse,
  GoingColdResponse,
  HandoffResponse,
  OwedLoop,
  OwedResponse,
  WarmPathResponse,
  MeResponse,
  MeetingResponse,
  PeopleResponse,
  PersonResponse,
  PreferencesResponse,
  ResearchResponse,
  ResearchSource,
  ReviewResponse,
  RunResearchResponse,
  SourceDecisionResponse,
  TodayResponse,
} from '@atturel/web/lib/mobile/contracts'
import {
  BRIEF,
  CONNECTIONS,
  GLANCE,
  LAST_CONVERSATION,
  LOOPS,
  MEETINGS,
  NOW,
  PEOPLE,
  TIMELINE,
} from '@atturel/web/app/dev/preview/fixtures'

/**
 * PREVIEW DATA
 * =============================================================================
 * The same invented people the web's /dev/preview uses -- one set of fiction
 * for both platforms -- shaped as the real API responses. Used only when
 * EXPO_PUBLIC_PREVIEW_DATA=1, and every screen says so in a banner. Nothing
 * here is anyone's record and nothing is sent anywhere.
 * =============================================================================
 */

const TZ = 'America/Toronto'
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Research in preview: nothing found until the button is pressed, then two invented pages to check. */
const previewResearch: { searched: boolean; decisions: Record<string, 'confirm' | 'reject'> } = { searched: false, decisions: {} }

function previewReview(personId: string): ResearchResponse {
  const person = PEOPLE.find((x) => x.id === personId) ?? PEOPLE[0]!
  const found: ResearchSource[] = [
    {
      id: 'src-team',
      title: `Leadership team | ${person.company ?? 'Northwind'}`,
      url: 'https://example.com/about/leadership',
      host: 'example.com',
      publisher: person.company ?? 'Northwind',
      publishedAt: null,
      state: 'waiting',
      match: 'strong',
      why: `Matched because their name is in the page title and it is published by ${person.company ?? 'Northwind'}.`,
      nameExcerpt: `…our leadership team. ${person.fullName} leads partnerships across North America, having joined from…`,
      reviewed: false,
      facts: [
        { id: 'src-team:0', kind: 'current_role', label: 'Role', value: person.title ?? 'Head of Partnerships', detail: null, evidence: 'observed', excerpt: `${person.fullName} leads partnerships`, current: true },
        { id: 'src-team:1', kind: 'prior_role', label: 'Previously', value: 'Partnerships at Halcyon', detail: null, evidence: 'inferred', excerpt: 'having joined from Halcyon', current: false },
      ],
      proposals: 0,
    },
    {
      id: 'src-talk',
      title: 'Panel: building partner programmes',
      url: 'https://example.org/events/panel',
      host: 'example.org',
      publisher: null,
      publishedAt: '2026-03-12T00:00:00.000Z',
      state: 'waiting',
      match: 'possible',
      why: `This might be ${person.fullName}, but there is not enough to be sure. Matched because their name appears in the page.`,
      nameExcerpt: `…speakers include ${person.fullName} and two others from…`,
      reviewed: false,
      facts: [{ id: 'src-talk:0', kind: 'appearance', label: 'Public appearance', value: 'Panel on partner programmes, March 2026', detail: null, evidence: 'observed', excerpt: null, current: true }],
      proposals: 1,
    },
  ]
  const sources = previewResearch.searched
    ? found.map((s): ResearchSource => {
        const decision = previewResearch.decisions[s.id]
        if (decision === 'reject') return { ...s, state: 'rejected', match: null, why: 'You said this is someone else.', nameExcerpt: null, reviewed: true, facts: [], proposals: 0 }
        if (decision === 'confirm') return { ...s, state: 'kept', match: null, why: 'You confirmed this is them.', nameExcerpt: null, reviewed: true }
        return s
      })
    : []
  return {
    person: { id: person.id, name: person.name, fullName: person.fullName, organization: person.company ?? null, jobTitle: person.title ?? null, hasProfileUrl: false },
    canDiscover: true,
    hint: null,
    lastResearchedAt: previewResearch.searched ? NOW.toISOString() : null,
    sources,
    notUsed: previewResearch.searched ? 4 : 0,
  }
}

function meeting(id: string): MeetingResponse {
  const m = MEETINGS.find((x) => x.id === id) ?? MEETINGS[0]!
  const people = m.id === 'm-1' ? [PEOPLE[0]!] : m.people
  const ready = m.prep === 'ready'
  return {
    meeting: { id: m.id, title: m.title, scheduledAt: m.scheduledAt, objective: m.objective },
    timeZone: TZ,
    prep: m.prep,
    people,
    glance: ready ? GLANCE : { objective: m.objective, howToOpen: null, remember: [], openLoop: null },
    quick: ready
      ? {
          objective: BRIEF.objective,
          outcomeToLeaveWith: BRIEF.outcomeToLeaveWith,
          howToOpen: BRIEF.howToOpen,
          recommendedApproach: BRIEF.recommendedApproach,
          participants: BRIEF.participants.map((p) => ({
            personId: p.personId,
            name: p.name,
            guidance: p.guidance,
            knownConcerns: p.knownConcerns,
            publicOnly: p.publicOnly,
          })),
          cues: [
            { text: 'Whether recordings can stay in-region', note: 'Unresolved in your record' },
            { text: LOOPS[0]!.description, note: 'Still open — you owe this' },
          ],
          likelyObjections: BRIEF.likelyObjections,
          uncertainties: BRIEF.uncertainties,
        }
      : null,
    deep: ready ? BRIEF : null,
    loops: ready ? LOOPS : [],
    lastConversation: ready ? LAST_CONVERSATION : null,
    connections: CONNECTIONS.filter(
      (c) => people.some((p) => p.id === c.a) && people.some((p) => p.id === c.b),
    ),
    grounded: ready ? false : null,
    preparedAt: ready ? NOW.toISOString() : null,
  }
}

const PREVIEW_CALENDAR: CalendarConnection = {
  provider: 'google',
  status: 'connected',
  accountEmail: 'amary@example.com',
  lastSyncedAt: NOW.toISOString(),
  view: {
    label: 'Connected',
    tone: 'positive',
    detail: '',
    synced: 'Last synced just now',
    stale: false,
    note: null,
    sync: 'Sync now',
    reconnect: false,
  },
}

export async function previewResponse<T>(path: string, init: RequestInit): Promise<T> {
  await delay(250)
  const p = path.replace(/^\/api\/mobile/, '')

  if (p === '/account') {
    const body: AccountResponse = {
      email: 'amary@example.com',
      name: 'Amary',
      planLabel: 'Pro',
      billing: 'web',
      legal: {
        privacyUrl: 'https://www.atturel.com/privacy',
        termsUrl: 'https://www.atturel.com/terms',
        supportEmail: 'support@atturel.com',
      },
      capture: { maxSeconds: 2 * 3600, segmentSeconds: 600, partTransport: 'direct' },
      sampleData: { loaded: false },
      calendar: { connections: [PREVIEW_CALENDAR], manageUrl: 'https://www.atturel.com/settings/capabilities' },
    }
    return body as T
  }

  if (/^\/calendar\/[^/]+\/sync$/.test(p) && init.method === 'POST') {
    const body: CalendarSyncResponse = {
      outcome: { ok: true, code: 'synced', message: 'Preview data does not sync a calendar.' },
      connection: PREVIEW_CALENDAR,
    }
    return body as T
  }

  if (p === '/me' && init.method === 'PATCH') return { ok: true } as T
  if (p === '/me') {
    const body: MeResponse = {
      id: 'preview',
      name: 'Amary',
      timeZone: TZ,
      onboarded: true,
      profile: { fullName: 'Amary Coulibaly', preferredName: 'Amary', jobTitle: 'Head of Partnerships', company: 'Atturel', pronouns: null, timezone: TZ, photo: null },
    }
    return body as T
  }
  if (p === '/me/photo' || /^\/people\/[^/]+\/photo$/.test(p)) return { ok: true, photo: null } as T
  if (p === '/preferences') {
    const body: PreferencesResponse = { emailNotifications: true, followThroughEmail: true }
    return (init.method === 'PATCH' ? { ...body, ...(JSON.parse(String(init.body ?? '{}')) as object) } : body) as T
  }
  if (p === '/export') return { ok: true, json: JSON.stringify({ preview: true, note: 'Invented people only.' }, null, 2) } as T
  if (/^\/people\/[^/]+\/(archive|restore)$/.test(p)) return { ok: true } as T
  if (p === '/people?archived=1') {
    const body: ArchivedPeopleResponse = {
      people: [{ id: 'p-archived', name: 'Rhea Okafor', company: 'Northwind Labs', archivedAt: NOW.toISOString(), isDemo: true }],
    }
    return body as T
  }
  const deletionMatch = p.match(/^\/people\/([^/]+)\/deletion$/)
  if (deletionMatch) {
    const body: DeletionPreviewResponse = {
      person: { id: deletionMatch[1]!, name: 'Rhea Okafor', archivedAt: NOW.toISOString() },
      deleted: ["Rhea Okafor's record: name, role, contact details and notes", '2 things you noted about them'],
      unlinked: ['1 loop', '1 meeting'],
      retainedLoops: [{ id: 'l-rhea', description: 'Send Rhea the pilot summary', status: 'open', mentionsPerson: true }],
    }
    return body as T
  }
  if (p === '/sample-data') return { ok: true, message: 'Preview data is already invented.' } as T
  if (p === '/onboarding') return { ok: true } as T
  if (p === '/access') return { ok: true, message: 'Preview: nothing was redeemed.' } as T
  if (p === '/meetings' && init.method === 'POST') return { ok: true, meetingId: 'm-2' } as T
  if (/^\/meetings\/[^/]+\/prepare$/.test(p)) return { ok: true, grounded: false } as T
  if (/^\/meetings\/[^/]+\/attendees$/.test(p)) return { ok: true } as T
  if (/^\/loops\/[^/]+$/.test(p)) return { ok: true } as T
  if (p === '/people' && init.method === 'POST') return { ok: true, personId: PEOPLE[0]!.id } as T

  if (p === '/today') {
    const body: TodayResponse = {
      name: 'Amary',
      timeZone: TZ,
      now: NOW.toISOString(),
      meetings: MEETINGS.map((m) => ({
        id: m.id,
        title: m.title,
        scheduledAt: m.scheduledAt,
        objective: m.objective,
        prep: m.prep,
        people: m.people,
        openLoops: m.openLoops,
      })),
      loops: LOOPS,
      awaitingReview: [{ id: 'c-2', title: 'Hallway catch-up with Adama', occurredAt: NOW.toISOString(), pending: 3 }],
    }
    return body as T
  }

  const meetingMatch = p.match(/^\/meetings\/([^/]+)$/)
  if (meetingMatch) return meeting(meetingMatch[1]!) as T

  if (p.startsWith('/people?q=')) {
    const q = decodeURIComponent(p.slice('/people?q='.length)).toLowerCase()
    const body: PeopleResponse = {
      timeZone: TZ,
      people: PEOPLE.filter((x) => [x.name, x.fullName, x.title, x.company].some((v) => v?.toLowerCase().includes(q))).map((x) => ({
        ...x,
        relationshipLabel: x.context ?? 'Colleague',
      })),
    }
    return body as T
  }

  const researchMatch = p.match(/^\/people\/([^/]+)\/research$/)
  if (researchMatch) {
    if (init.method === 'POST') previewResearch.searched = true
    const review = previewReview(researchMatch[1]!)
    return (init.method === 'POST'
      ? ({
          ...review,
          outcome: { ok: true, message: 'Reviewed 6 sources. 2 may be about them. Nothing is in their record until you check each one.', missing: null },
        } satisfies RunResearchResponse)
      : review) as T
  }
  const sourceMatch = p.match(/^\/people\/([^/]+)\/sources\/([^/]+)$/)
  if (sourceMatch) {
    const decision = (JSON.parse(String(init.body ?? '{}')) as { decision?: 'confirm' | 'reject' }).decision ?? 'confirm'
    previewResearch.decisions[sourceMatch[2]!] = decision
    const body: SourceDecisionResponse = {
      ok: true,
      factsAdded: decision === 'confirm' ? 2 : 0,
      research: previewReview(sourceMatch[1]!),
    }
    return body as T
  }

  if (p === '/people') {
    const body: PeopleResponse = {
      timeZone: TZ,
      people: PEOPLE.map((x) => ({ ...x, relationshipLabel: x.context ?? 'Colleague' })),
    }
    return body as T
  }

  const personMatch = p.match(/^\/people\/([^/]+)$/)
  if (personMatch && init.method === 'PATCH') return { ok: true } as T
  if (personMatch && init.method === 'DELETE') return { ok: true, keptLoops: 1 } as T
  if (personMatch) {
    const x = PEOPLE.find((q) => q.id === personMatch[1]) ?? PEOPLE[0]!
    const body: PersonResponse = {
      timeZone: TZ,
      person: {
        ...x,
        relationshipLabel: x.context ?? 'Colleague',
        email: null,
        nextMeeting: x.id === 'p-columbus' ? { id: 'm-1', title: MEETINGS[0]!.title, scheduledAt: MEETINGS[0]!.scheduledAt } : null,
      },
      loops: LOOPS.filter((l) => l.personId === x.id),
      timeline: x.id === 'p-columbus' ? TIMELINE : [],
      themes: x.id === 'p-columbus' ? ['Relationship map', 'Pilot scope', 'Data residency'] : [],
      edit: {
        fullName: x.fullName,
        preferredName: x.name !== x.fullName ? x.name : null,
        jobTitle: x.title,
        organizationName: x.company,
        email: null,
        profileUrl: null,
        relationshipType: 'customer',
        relevance: 4,
        pronouns: null,
        timezone: null,
        notes: null,
      },
    }
    return body as T
  }

  if (p === '/atlas') {
    const body: AtlasResponse = {
      timeZone: TZ,
      organizations: [
        { name: 'Halden Telecom', domain: 'halden.example', people: PEOPLE.filter((x) => x.company === 'Halden Telecom') },
        { name: 'Northwind Labs', domain: 'northwind.example', people: PEOPLE.filter((x) => x.company === 'Northwind Labs') },
      ],
      unaffiliated: [],
      connections: CONNECTIONS.filter((x) => x.kind !== 'same_organization'),
      goingQuiet: [PEOPLE[1]!],
    }
    return body as T
  }

  if (p === '/ask') {
    const question = (JSON.parse(String(init.body ?? '{}')) as { question?: string }).question ?? ''
    const body: AskResponse = {
      answer: /owe|promise/i.test(question)
        ? 'You owe Columbus one thing: the prototype link and the two-page overview. It was due yesterday. You are also waiting on him for the in-region storage requirements.'
        : 'Your record on that is thin. Columbus last spoke with you twelve days ago, in the prototype walkthrough, and asked for a view of who knows whom before committing a pilot.',
      grounded: true,
      followUps: ['What did Columbus think of the prototype?', 'What commitments are still open?'],
      citations: [
        { label: 'Open loop: Send the prototype link and the two-page overview', evidenceLevel: 'confirmed', personId: 'p-columbus' },
        { label: 'Conversation: Prototype walkthrough', evidenceLevel: 'observed', personId: 'p-columbus' },
      ],
      people: [{ id: 'p-columbus', name: 'Columbus Brown', src: null }],
    }
    return body as T
  }

  if (p === '/transcribe') {
    return {
      text: 'Me: Thanks for making time. I will send you the pilot plan by Friday.\nColumbus: Good. I will check with legal about in-region storage.\nMe: Do we know who signs off on the budget?\nColumbus: Not yet.',
    } as T
  }

  if (p === '/conversations') {
    const body: CaptureResponse = { interactionId: 'c-preview' }
    return body as T
  }

  const reviewMatch = p.match(/^\/conversations\/([^/]+)\/review$/)
  if (reviewMatch) {
    if (init.method === 'POST') return { message: 'Kept 2 loops and 1 decision.' } as T
    const body: ReviewResponse = {
      conversation: {
        id: reviewMatch[1]!,
        title: 'Pilot check-in with Columbus',
        occurredAt: NOW.toISOString(),
        summary: 'Agreed next steps for the pilot.',
        outcome: 'Pilot plan due Friday; storage question with legal.',
      },
      processing: 'ready',
      loops: [
        { id: 'r-1', description: 'Send the pilot plan by Friday', direction: 'owe', owner: 'user', kind: 'commitment', dueOn: null, personName: 'Columbus', excerpt: '“I will send you the pilot plan by Friday.”', likely: true },
        { id: 'r-2', description: 'Check with legal about in-region storage', direction: 'waiting', owner: 'person', kind: 'commitment', dueOn: null, personName: 'Columbus', excerpt: '“I will check with legal about in-region storage.”', likely: true },
        { id: 'r-3', description: 'Who signs off on the budget?', direction: 'revisit', owner: 'shared', kind: 'question', dueOn: null, personName: 'Columbus', excerpt: '“Do we know who signs off on the budget?”', likely: false },
      ],
      decisions: [{ id: 'r-4', description: 'Pilot starts with his account team only', excerpt: null, likely: true }],
      memoryProposals: 1,
    }
    return body as T
  }

  if (p === '/owed') {
    const loop = (l: (typeof LOOPS)[number], extra: Pick<OwedLoop, 'freshness' | 'note' | 'createdAt'>): OwedLoop => ({
      ...l,
      from: 'Prototype walkthrough',
      ...extra,
    })
    const body: OwedResponse = {
      timeZone: TZ,
      now: NOW.toISOString(),
      mine: [loop(LOOPS[0]!, { freshness: 'overdue', note: 'Overdue by 1 day', createdAt: new Date(NOW.getTime() - 12 * 86_400_000).toISOString() })],
      theirs: [loop(LOOPS[1]!, { freshness: 'nudge', note: 'Open 12 days, no date', createdAt: new Date(NOW.getTime() - 12 * 86_400_000).toISOString() })],
      shared: [loop(LOOPS[2]!, { freshness: 'fresh', note: 'Open 4 days, no date', createdAt: new Date(NOW.getTime() - 4 * 86_400_000).toISOString() })],
      nudges: 2,
    }
    return body as T
  }

  if (p === '/going-cold') {
    const body: GoingColdResponse = {
      timeZone: TZ,
      people: [
        {
          personId: PEOPLE[1]!.id,
          person: PEOPLE[1]!,
          daysQuiet: 30,
          neverSpoke: false,
          reason: {
            text: 'Maureen appeared at the Regional Operators Forum. Asking how it went is an easy way back in.',
            evidence: 'inferred',
            sourceTitle: 'Regional Operators Forum speakers',
            sourceUrl: 'https://example.com/forum',
            datedOn: NOW.toISOString().slice(0, 10),
          },
        },
      ],
    }
    return body as T
  }

  const warmMatch = p.match(/^\/people\/([^/]+)\/warm-path$/)
  if (warmMatch) {
    const target = PEOPLE.find((q) => q.id === warmMatch[1]) ?? PEOPLE[2]!
    const ties = CONNECTIONS.filter((c) => c.a === target.id || c.b === target.id)
    const paths = ties.flatMap((c) => {
      const other = PEOPLE.find((q) => q.id === (c.a === target.id ? c.b : c.a))
      return other?.lastInteractionAt ? [{ introducerId: other.id, ties: [c.description], evidence: c.evidence, person: other }] : []
    })
    const body: WarmPathResponse = { target: { id: target.id, name: target.name }, paths: paths.slice(0, 3) }
    return body as T
  }

  const handoffMatch = p.match(/^\/people\/([^/?]+)\/handoff(\?.*)?$/)
  if (handoffMatch) {
    const x = PEOPLE.find((q) => q.id === handoffMatch[1]) ?? PEOPLE[0]!
    const notes = handoffMatch[2]?.includes('notes=1')
    const body: HandoffResponse = {
      title: `Handoff: ${x.fullName}`,
      text: [
        `HANDOFF: ${x.fullName.toUpperCase()}`,
        `${x.fullName}, ${x.title} at ${x.company}. Relationship: ${x.context}. Invented sample person.`,
        'STILL OPEN\n- Promised to Columbus: Send the prototype link and the two-page overview (overdue)\n- Columbus promised: Share the in-region storage requirements',
        ...(notes ? ['NOTES\nPrefers a short agenda sent the day before.'] : []),
        'Prepared with Atturel. Confirmed means they said it or it was confirmed; Observed means it is on record; Inferred is a reading worth checking.',
      ].join('\n\n'),
    }
    return body as T
  }

  throw new Error(`No preview data for ${path}`)
}
