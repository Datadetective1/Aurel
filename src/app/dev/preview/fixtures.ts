import { normalizeBrief } from '@/lib/brief'
import { buildTimeline } from '@/lib/visual/timeline'
import { composeRemember } from '@/lib/visual/glance'
import { describeConnection, findConnections } from '@/lib/visual/commonality'
import type { VisualConnection, VisualLoop, VisualPerson } from '@/lib/visual/types'
import type { LoopRecord } from '@/lib/conversations/queries'

/**
 * Invented people for the visual preview. None of them is a real person and
 * none has a photo: the preview shows the initials fallback, which is what
 * most records look like. Organisation domains are reserved example domains,
 * so no logo request can reach a real company.
 */

export const NOW = new Date('2026-10-13T14:52:00Z')
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString()
const day = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString()

export const PEOPLE: VisualPerson[] = [
  {
    id: 'p-columbus',
    name: 'Columbus Brown',
    fullName: 'Columbus Brown',
    src: null,
    title: 'VP, Network Strategy',
    company: 'Halden Telecom',
    companyDomain: 'halden.example',
    context: 'Decision maker',
    lastInteractionAt: day(-12),
    openLoops: 2,
    owe: 1,
  },
  {
    id: 'p-maureen',
    name: 'Maureen Okafor',
    fullName: 'Maureen Okafor',
    src: null,
    title: 'Director of Operations',
    company: 'Halden Telecom',
    companyDomain: 'halden.example',
    context: 'Influencer',
    lastInteractionAt: day(-30),
    openLoops: 1,
    owe: 0,
  },
  {
    id: 'p-jonathan',
    name: 'Jonathan Reyes',
    fullName: 'Jonathan Reyes',
    src: null,
    title: 'Principal Engineer',
    company: 'Northwind Labs',
    companyDomain: 'northwind.example',
    context: 'Contributor',
    lastInteractionAt: null,
    openLoops: 0,
    owe: 0,
  },
  {
    id: 'p-adama',
    name: 'Adama Diallo',
    fullName: 'Adama Diallo',
    src: null,
    title: 'Product Lead',
    company: 'Halden Telecom',
    companyDomain: 'halden.example',
    context: 'Peer',
    lastInteractionAt: day(-3),
    openLoops: 0,
    owe: 0,
  },
]

export const BRIEF = normalizeBrief({
  sixtySecond:
    'Columbus wants to see the prototype working end to end before he commits his team. Show the relationship map first, then the follow-through loop.',
  objective: 'Show the prototype and get his reaction to the relationship map',
  recommendedApproach: [
    'Open with the map he asked about last time',
    'Keep the demo under eight minutes',
    'Ask directly who else needs to see it',
  ],
  howToOpen: '“Last time you asked whether we could show who knows whom. Here it is.”',
  outcomeToLeaveWith: 'A yes or no on a two-week pilot with his team',
  participants: [
    {
      personId: 'p-columbus',
      name: 'Columbus Brown',
      relevance: 'Decides whether his team pilots',
      whatMatters: ['Values visual relationship context over long reports', 'Speed to first value'],
      guidance: ['Lead with the picture, then the evidence behind it'],
      knownConcerns: ['Where call recordings are stored'],
      publicContext: [],
    },
    {
      personId: 'p-maureen',
      name: 'Maureen Okafor',
      whatMatters: ['Operational load on her team'],
      guidance: ['Show what it removes from her week, not what it adds'],
      knownConcerns: [],
      publicContext: [],
    },
    {
      personId: 'p-jonathan',
      name: 'Jonathan Reyes',
      whatMatters: ['Published on graph databases'],
      guidance: [],
      knownConcerns: [],
      publicOnly: true,
      publicContext: [
        { statement: 'Principal Engineer at Northwind Labs', sourceLabel: 'northwind.example' },
      ],
    },
  ],
  likelyObjections: [
    {
      objection: 'We already have a CRM for this',
      response:
        'Atturel does not ask anyone to maintain records; it remembers conversations they already have.',
      basis: 'Raised by Maureen in the September call',
    },
  ],
  roomDynamics: {
    decisionOwner: 'Columbus Brown',
    unresolvedIssues: ['Whether recordings can stay in-region'],
    informationNeeds: [],
    knownDisagreements: [],
    sequencing: [],
  },
  uncertainties: ['How Jonathan works — nothing is recorded yet beyond public sources'],
})

export const LAST_CONVERSATION = {
  id: 'c-1',
  title: 'Prototype walkthrough',
  occurredAt: day(-12),
  outcome: 'He asked for a view of who knows whom before committing a pilot.',
  summary: null,
}

export const LOOPS: VisualLoop[] = [
  {
    id: 'l-1',
    description: 'Send the prototype link and the two-page overview',
    direction: 'owe',
    dueOn: day(-1).slice(0, 10),
    overdue: true,
    personId: 'p-columbus',
    personName: 'Columbus',
    interactionId: 'c-1',
  },
  {
    id: 'l-2',
    description: 'Share the in-region storage requirements',
    direction: 'waiting',
    dueOn: null,
    overdue: false,
    personId: 'p-columbus',
    personName: 'Columbus',
    interactionId: 'c-1',
  },
  {
    id: 'l-3',
    description: 'Who signs off on a pilot budget?',
    direction: 'revisit',
    dueOn: null,
    overdue: false,
    personId: 'p-maureen',
    personName: 'Maureen',
    interactionId: 'c-1',
  },
]

export const GLANCE = {
  objective: BRIEF.objective,
  howToOpen: BRIEF.howToOpen,
  remember: composeRemember({
    brief: BRIEF,
    lastConversation: LAST_CONVERSATION,
    openLoopCount: LOOPS.length,
  }),
  openLoop: LOOPS[0]!,
}

export const CONNECTIONS: VisualConnection[] = findConnections({
  people: PEOPLE.map((p) => ({
    id: p.id,
    organizationId: p.company === 'Halden Telecom' ? 'o-halden' : 'o-northwind',
    organizationName: p.company,
  })),
  facts: [
    {
      personId: 'p-columbus',
      kind: 'education',
      value: 'University of Toronto',
      evidence: 'observed',
    },
    {
      personId: 'p-jonathan',
      kind: 'education',
      value: 'University of Toronto',
      evidence: 'observed',
    },
  ],
  meetings: [{ id: 'm-old', personIds: ['p-columbus', 'p-maureen'] }],
  conversations: [{ id: 'c-1', personIds: ['p-columbus', 'p-maureen'] }],
}).map((c) => ({ ...c, description: describeConnection(c) }))

export const TIMELINE = buildTimeline(
  {
    personFirstName: 'Columbus',
    interactions: [
      {
        id: 'c-1',
        title: 'Prototype walkthrough',
        occurredAt: day(-12),
        kind: 'meeting',
        summary: null,
        outcome: 'He asked for a view of who knows whom before committing a pilot.',
        meetingId: 'm-old',
      },
      {
        id: 'c-0',
        title: 'Intro call',
        occurredAt: day(-40),
        kind: 'call',
        summary: 'First conversation. Interested in relationship context for his account team.',
        outcome: null,
      },
    ],
    meetings: [
      {
        id: 'm-1',
        title: 'Prototype review with Columbus',
        scheduledAt: at(8),
        status: 'upcoming',
      },
      { id: 'm-old', title: 'Prototype walkthrough', scheduledAt: day(-12), status: 'completed' },
    ],
    loops: [
      {
        id: 'l-1',
        description: 'Send the prototype link and the two-page overview',
        kind: 'commitment',
        owner: 'user',
        status: 'open',
        reviewStatus: 'confirmed',
        createdAt: day(-12),
        completedAt: null,
        interactionId: 'c-1',
        excerpt: '“I’ll send you the link and a short overview by Monday.”',
      },
      {
        id: 'l-0',
        description: 'Send the security one-pager',
        kind: 'commitment',
        owner: 'user',
        status: 'done',
        reviewStatus: 'confirmed',
        createdAt: day(-40),
        completedAt: day(-35),
        interactionId: 'c-0',
      },
    ],
    decisions: [
      {
        id: 'd-1',
        description: 'Pilot scope is his account team only',
        context: 'Keeps procurement out of it for the first two weeks.',
        decidedOn: day(-12).slice(0, 10),
        reviewStatus: 'confirmed',
        interactionId: 'c-1',
      },
    ],
    notes: [
      {
        id: 'n-1',
        body: 'Prefers morning meetings. Mentioned a board review in November.',
        createdAt: day(-20),
      },
    ],
    memories: [
      {
        id: 'o-1',
        content: 'Asks for the picture before the numbers',
        createdAt: day(-12),
        evidenceLevel: 'observed',
        sourceKind: 'debrief',
      },
    ],
  },
  NOW,
)

export const LOOP_RECORDS: LoopRecord[] = LOOPS.map((l, i) => ({
  id: l.id,
  description: l.description,
  kind: l.direction === 'revisit' ? 'question' : 'commitment',
  owner: l.direction === 'owe' ? 'user' : 'person',
  ownerPersonId: null,
  personId: l.personId,
  person: l.personId ? { id: l.personId, name: l.personName ?? '', src: null } : null,
  dueOn: l.dueOn,
  status: 'open',
  reviewStatus: 'confirmed',
  confidence: null,
  excerpt: null,
  deferredUntil: null,
  interactionId: l.interactionId,
  interactionTitle: 'Prototype walkthrough',
  meetingId: null,
  createdAt: day(-12 - i),
  completedAt: null,
}))

export const MEETING_START = at(8)
export const MEETINGS = [
  {
    id: 'm-1',
    title: 'Prototype review with Columbus',
    scheduledAt: at(8),
    objective: BRIEF.objective,
    people: [PEOPLE[0]!],
    prep: 'ready' as const,
    openLoops: 2,
    owe: 1,
    important: true,
  },
  {
    id: 'm-2',
    title: 'Halden pilot planning',
    scheduledAt: at(60 * 26),
    objective: 'Agree the pilot scope and who joins it',
    people: [PEOPLE[1]!, PEOPLE[3]!, PEOPLE[0]!],
    prep: 'not_prepared' as const,
    openLoops: 1,
    owe: 0,
    important: false,
  },
  {
    id: 'm-3',
    title: 'Architecture chat',
    scheduledAt: at(60 * 50),
    objective: null,
    people: [],
    prep: 'needs_people' as const,
    openLoops: 0,
    owe: 0,
    important: false,
  },
]
