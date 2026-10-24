import type {
  AccountResponse,
  AtlasResponse,
  AskResponse,
  CaptureResponse,
  MeetingResponse,
  PeopleResponse,
  PersonResponse,
  ReviewResponse,
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
    }
    return body as T
  }

  if (p === '/me') return { id: 'preview', name: 'Amary', timeZone: TZ, onboarded: true } as T
  if (p === '/sample-data') return { ok: true, message: 'Preview data is already invented.' } as T
  if (p === '/onboarding') return { ok: true } as T
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

  if (p === '/people') {
    const body: PeopleResponse = {
      timeZone: TZ,
      people: PEOPLE.map((x) => ({ ...x, relationshipLabel: x.context ?? 'Colleague' })),
    }
    return body as T
  }

  const personMatch = p.match(/^\/people\/([^/]+)$/)
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

  throw new Error(`No preview data for ${path}`)
}
