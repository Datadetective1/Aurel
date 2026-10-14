import type { ConversationSummary, DecisionRecord, LoopRecord } from '@/lib/conversations/queries'
import type { RoomPerson } from '@/components/app/room-strip'
import type { PersonCardData } from '@/components/app/people-cards'
import { NOW, PEOPLE } from './fixtures'

/**
 * Invented records for the conversation, People and Conversations previews.
 * Shaped like the screens reviewed on a phone: a pilot decision, two things
 * the user owes, an unresolved ownership question, and the "next time" list
 * a reading produces. Nobody here is real.
 */

const day = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString()

const columbus = { id: 'p-columbus', name: 'Columbus', src: null }
const maureen = { id: 'p-maureen', name: 'Maureen', src: null }

export const CONVERSATION: ConversationSummary = {
  id: 'c-1',
  title: 'Pilot scoping with Columbus',
  occurredAt: day(-2),
  kind: 'meeting',
  sourceKind: 'meeting_recording',
  processingStatus: 'ready',
  processingError: null,
  summary:
    'Columbus walked through the three pilot options his team had shortlisted and explained why Option B, the account-team pilot, fits their procurement calendar better than a broader rollout. He asked for a revised proposal reflecting the narrower scope and for updated requirements covering in-region storage. Maureen raised the question of who would own the migration plan once the pilot ends, which was not settled. They also discussed reviewing the dashboard together before the board meeting in November.',
  outcome: 'Option B chosen for the pilot; revised proposal and requirements owed.',
  topics: ['Pilot scope', 'Data residency', 'Dashboard'],
  durationSeconds: 34 * 60,
  reviewedAt: day(-2),
  meetingId: 'm-old',
  participants: [columbus, maureen],
  openLoops: 3,
  decisions: 1,
  pendingReview: 0,
}

const loop = (
  id: string,
  description: string,
  owner: LoopRecord['owner'],
  kind: LoopRecord['kind'],
  person: { id: string; name: string; src: null },
  dueOn: string | null,
): LoopRecord => ({
  id,
  description,
  kind,
  owner,
  ownerPersonId: owner === 'person' ? person.id : null,
  personId: person.id,
  person,
  dueOn,
  status: 'open',
  reviewStatus: 'confirmed',
  confidence: 0.9,
  excerpt: null,
  deferredUntil: null,
  interactionId: 'c-1',
  interactionTitle: CONVERSATION.title,
  meetingId: null,
  createdAt: day(-2),
  completedAt: null,
})

export const CONVERSATION_LOOPS: LoopRecord[] = [
  loop('cl-1', 'Send the revised proposal for the Option B pilot', 'user', 'commitment', columbus, day(3).slice(0, 10)),
  loop('cl-2', 'Send updated requirements covering in-region storage', 'user', 'commitment', columbus, null),
  loop('cl-3', 'Confirm the pilot start date with procurement', 'person', 'commitment', columbus, null),
  loop('cl-4', 'Who owns the migration plan after the pilot?', 'shared', 'question', maureen, null),
]

export const CONVERSATION_DECISIONS: DecisionRecord[] = [
  {
    id: 'cd-1',
    description: 'Option B for the pilot: the account team only',
    context: 'It fits their procurement calendar and keeps the first two weeks small.',
    decidedOn: day(-2).slice(0, 10),
    reviewStatus: 'confirmed',
    confidence: 0.9,
    excerpt: null,
    interactionId: 'c-1',
    interactionTitle: CONVERSATION.title,
    people: [columbus, maureen],
  },
]

export const NEXT_TIME = [
  'Confirm with Columbus that the revised proposal arrived and reflects the Option B scope before discussing timelines.',
  'Ask Maureen who will own the migration plan once the pilot ends, since this was left unresolved.',
  'Propose a date to review the dashboard together ahead of the November board meeting.',
  'Check whether in-region storage satisfies their legal team or needs a written commitment.',
]

export const OBJECTIONS = ['A broader rollout would collide with their procurement freeze']

export const CONVERSATION_ROOM: RoomPerson[] = [PEOPLE[0]!, PEOPLE[1]!].map((p) => ({
  id: p.id,
  name: p.name,
  fullName: p.fullName,
  src: null,
  title: p.title,
  company: p.company,
  context: p.context,
}))

export const PICKABLE = PEOPLE.map((p) => ({
  id: p.id,
  fullName: p.fullName,
  preferredName: null,
  src: null,
}))

export const TRANSCRIPT = `Columbus: We looked at all three options and B makes the most sense for us.
Me: Great — I will send a revised proposal for Option B by Friday.
Columbus: And the requirements, updated for in-region storage.
Me: Yes, I will send those too.
Maureen: Who owns the migration plan once the pilot is over?
Columbus: Let's come back to that.`

export const PEOPLE_CARDS: PersonCardData[] = [
  { id: 'p-columbus', name: 'Columbus Brown', fullName: 'Columbus Brown', src: null, title: 'VP, Network Strategy', company: 'Halden Telecom', relationship: 'Customer', lastSpokeLabel: '2 days ago', nextLabel: 'Next today', openLoops: 3, toReview: 0, learned: 2, isDemo: false },
  { id: 'p-maureen', name: 'Maureen Okafor', fullName: 'Maureen Okafor', src: null, title: 'Director of Operations', company: 'Halden Telecom', relationship: 'Customer', lastSpokeLabel: '2 days ago', nextLabel: null, openLoops: 1, toReview: 1, learned: 0, isDemo: false },
  { id: 'p-jonathan', name: 'Jonathan Reyes', fullName: 'Jonathan Reyes', src: null, title: 'Principal Engineer', company: 'Northwind Labs', relationship: 'External contact', lastSpokeLabel: null, nextLabel: 'Next tomorrow', openLoops: 0, toReview: 0, learned: 0, isDemo: false },
  { id: 'p-adama', name: 'Adama Diallo', fullName: 'Adama Diallo', src: null, title: 'Product Lead', company: 'Halden Telecom', relationship: 'Peer', lastSpokeLabel: '3 weeks ago', nextLabel: null, openLoops: 0, toReview: 0, learned: 4, isDemo: false },
]

export const CONVERSATIONS: ConversationSummary[] = [
  CONVERSATION,
  {
    ...CONVERSATION,
    id: 'c-2',
    title: 'Hallway catch-up with Adama',
    occurredAt: day(-6),
    sourceKind: 'voice_note',
    summary: 'Adama mentioned the roadmap review moved to next quarter and suggested looping in design earlier.',
    outcome: 'Roadmap review moved to next quarter.',
    participants: [{ id: 'p-adama', name: 'Adama', src: null }],
    openLoops: 0,
    decisions: 0,
    pendingReview: 2,
    reviewedAt: null,
    durationSeconds: 90,
  },
  {
    ...CONVERSATION,
    id: 'c-3',
    title: 'Intro call',
    occurredAt: day(-40),
    sourceKind: 'typed_notes',
    summary: 'First conversation. Interested in relationship context for his account team; asked about security.',
    outcome: null,
    participants: [columbus],
    openLoops: 0,
    decisions: 1,
    durationSeconds: null,
  },
]
