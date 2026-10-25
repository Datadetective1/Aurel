import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeClient, type Row } from '../../../tests/stubs/fake-supabase'

/**
 * SOMEONE THE USER REMOVED, IN A MEETING OR CONVERSATION
 * =============================================================================
 * The owner's rule (25 Oct 2026): an archived person stays visible where they
 * took part, clearly marked archived; a brief for an upcoming meeting does not
 * treat them as a participant or carry their relationship intelligence.
 *
 * Each loader runs against an in-memory client (tests/stubs/fake-supabase) that
 * applies the filters the database would, so a query that still asks for an
 * archived person's loops, conversations or facts gets them back here too.
 * =============================================================================
 */

const loops = vi.hoisted(() => ({ list: [] as unknown[] }))
vi.mock('@/lib/conversations/avatars', () => ({
  resolveFaces: async () => new Map(),
}))
vi.mock('@/lib/conversations/queries', () => ({
  listLoops: async () => loops.list,
  listConversations: async () => [],
}))

const { getMeetingContext } = await import('@/lib/ai/context')
const { loadMeetingVisual } = await import('./meeting.server')
const { loadTodayVisual } = await import('./today.server')
const { loadConversationRoom } = await import('@/lib/conversations/room')
const { getUpcomingMeetings } = await import('@/lib/ai/tools')

const USER = 'user-1'
const SOON = new Date(Date.now() + 2 * 60 * 60_000).toISOString()
const ARCHIVED_AT = '2026-10-20T09:00:00Z'

const person = (id: string, name: string, archivedAt: string | null) => ({
  id,
  full_name: name,
  preferred_name: null,
  avatar_url: null,
  avatar_path: null,
  job_title: 'VP Finance',
  email: null,
  relationship_type: 'customer',
  relevance: 4,
  notes: `${name} prefers the numbers first.`,
  first_interaction_at: '2026-01-10T00:00:00Z',
  last_interaction_at: '2026-10-10T00:00:00Z',
  last_researched_at: null,
  is_demo: false,
  archived_at: archivedAt,
  organization_id: 'org-1',
  organizations: { name: 'Northwind', domain: 'northwind.com' },
})
const AVA = person('ava', 'Ava Active', null)
const BEN = person('ben', 'Ben Archived', ARCHIVED_AT)

const loop = (id: string, personId: string) => ({
  id,
  description: `Send ${personId} the pricing`,
  owner: 'user',
  ownerPersonId: null,
  personId,
  person: { name: personId },
  dueOn: null,
  status: 'open',
  interactionId: null,
})

function meetingTables(): Record<string, Row[]> {
  return {
    profiles: [{ id: USER, timezone: 'UTC' }],
    meetings: [
      {
        id: 'm1',
        title: 'Pricing review',
        kind: 'external',
        scheduled_at: SOON,
        duration_minutes: 30,
        objective: 'Agree the pricing',
        stakes: null,
        extra_context: null,
        importance: 4,
        status: 'upcoming',
        is_demo: false,
      },
    ],
    meeting_attendees: [
      { meeting_id: 'm1', person_id: 'ben', role: 'decision_maker', people: BEN },
      { meeting_id: 'm1', person_id: 'ava', role: 'influencer', people: AVA },
    ],
    people: [AVA, BEN],
    interaction_participants: [
      {
        interaction_id: 'c-ben',
        person_id: 'ben',
        interactions: {
          id: 'c-ben',
          title: 'Call with Ben',
          occurred_at: '2026-10-12T00:00:00Z',
          outcome: null,
          summary: 'Ben wants a discount',
        },
      },
      {
        interaction_id: 'c-ava',
        person_id: 'ava',
        interactions: {
          id: 'c-ava',
          title: 'Call with Ava',
          occurred_at: '2026-09-01T00:00:00Z',
          outcome: null,
          summary: null,
        },
      },
    ],
    professional_facts: [
      { person_id: 'ava', kind: 'prior_role', value: 'Acme', evidence_level: 'confirmed' },
      { person_id: 'ben', kind: 'prior_role', value: 'Acme', evidence_level: 'confirmed' },
    ],
  }
}

beforeEach(() => {
  loops.list = [loop('l-ava', 'ava'), loop('l-ben', 'ben')]
})

describe('a new brief for an upcoming meeting', () => {
  it('prepares only for the people still in the user’s relationships', async () => {
    const db = fakeClient(meetingTables())
    const meeting = await getMeetingContext(db.client, USER, 'm1')

    expect(meeting?.participants.map((p) => p.id)).toEqual(['ava'])
    // Nothing about the archived person is even read for the prompt.
    expect(db.asked('people', 'id')).toEqual(['ava'])
    expect(db.asked('observations', 'person_id')).not.toContain('ben')
    expect(db.asked('commitments', 'person_id')).not.toContain('ben')
    expect(JSON.stringify(meeting)).not.toContain('Ben')
  })
})

describe('the meeting itself, as Prepare shows it', () => {
  it('keeps the archived person in the room, marked archived, after everyone else', async () => {
    const db = fakeClient(meetingTables())
    const visual = await loadMeetingVisual(db.client, USER, 'm1', { timeZone: 'UTC' })

    expect(visual?.people.map((p) => [p.name, p.context, p.archived ?? false])).toEqual([
      ['Ava Active', 'Influencer', false],
      ['Ben Archived', 'Archived', true],
    ])
  })

  it('carries none of their relationship intelligence', async () => {
    const db = fakeClient(meetingTables())
    const visual = await loadMeetingVisual(db.client, USER, 'm1', { timeZone: 'UTC' })
    const ben = visual!.people.find((p) => p.id === 'ben')!

    expect(ben).toMatchObject({ openLoops: 0, owe: 0, lastInteractionAt: null })
    expect(visual!.visualLoops.map((l) => l.id)).toEqual(['l-ava'])
    // Ben's call is more recent, but it is not this room's last conversation.
    expect(visual!.lastConversation?.title).toBe('Call with Ava')
    // Ben and Ava both worked at Acme; with Ben archived there is nothing to connect.
    expect(visual!.connections).toEqual([])
    expect(db.asked('interaction_participants', 'person_id')).not.toContain('ben')
  })

  it('a meeting whose only attendee is archived has nobody to prepare for', async () => {
    const tables = meetingTables()
    tables.meeting_attendees = tables.meeting_attendees!.filter((a) => a.person_id === 'ben')
    const visual = await loadMeetingVisual(fakeClient(tables).client, USER, 'm1', {
      timeZone: 'UTC',
    })
    const meeting = await getMeetingContext(fakeClient(tables).client, USER, 'm1')

    expect(visual?.people.map((p) => p.archived)).toEqual([true])
    expect(visual?.prep).toBe(
      (await import('./glance')).prepState({ hasBrief: false, attendeeCount: 0 }),
    )
    expect(meeting?.participants).toEqual([])
  })

  it('restoring them brings everything back', async () => {
    const tables = meetingTables()
    const restored = { ...BEN, archived_at: null }
    tables.meeting_attendees = tables.meeting_attendees!.map((a) =>
      a.person_id === 'ben' ? { ...a, people: restored } : a,
    )
    tables.people = [AVA, restored]
    const visual = await loadMeetingVisual(fakeClient(tables).client, USER, 'm1', {
      timeZone: 'UTC',
    })
    const meeting = await getMeetingContext(fakeClient(tables).client, USER, 'm1')

    expect(visual?.people.find((p) => p.id === 'ben')).toMatchObject({
      context: 'Decision maker',
      openLoops: 1,
    })
    expect(meeting?.participants.map((p) => p.id).sort()).toEqual(['ava', 'ben'])
  })
})

describe('a past conversation', () => {
  it('still shows the archived person, marked archived', async () => {
    const db = fakeClient({
      interaction_participants: [
        { interaction_id: 'c1', people: AVA },
        { interaction_id: 'c1', people: BEN },
      ],
    })
    const room = await loadConversationRoom(db.client, USER, 'c1')
    expect(room.map((p) => [p.name, p.context, p.archived ?? false])).toEqual([
      ['Ava Active', 'Customer', false],
      ['Ben Archived', 'Archived', true],
    ])
  })
})

describe('what is coming up', () => {
  it('Today on the phone leaves the archived person out of the next meeting', async () => {
    const db = fakeClient(meetingTables())
    const today = await loadTodayVisual(db.client, USER, { timeZone: 'UTC' })
    expect(today.meetings[0]?.people.map((p) => p.id)).toEqual(['ava'])
  })

  it('Ask’s upcoming meetings do not name them as someone to prepare for', async () => {
    const db = fakeClient({
      meetings: [
        {
          id: 'm1',
          title: 'Pricing review',
          scheduled_at: SOON,
          objective: null,
          importance: 4,
          status: 'upcoming',
          meeting_attendees: [
            { person_id: 'ava', people: { archived_at: null } },
            { person_id: 'ben', people: { archived_at: ARCHIVED_AT } },
          ],
        },
      ],
    })
    const upcoming = await getUpcomingMeetings(db.client, USER)
    expect(upcoming.data[0]?.personIds).toEqual(['ava'])
  })
})
