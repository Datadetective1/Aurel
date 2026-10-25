// @vitest-environment jsdom
import * as React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeClient } from '../../../tests/stubs/fake-supabase'

/**
 * A PAST CONVERSATION IN A LIST
 * =============================================================================
 * Found on the preview: Today and Conversations list a conversation as
 * "With Quinn" after Quinn was archived. It stays listed, it is the user's own
 * record, but the name says the person is archived, as the conversation page
 * does.
 * =============================================================================
 */

vi.mock('./avatars', () => ({ resolveFaces: async () => new Map() }))

afterEach(cleanup)

const { listConversations } = await import('./queries')
const { ConversationCard } = await import('@/components/app/conversation-card')
const { CONVERSATION } = await import('@/app/dev/preview/fixtures-conversation')
const { MeetingCockpit } = await import('@/components/visual/meeting-cockpit')

const person = (id: string, name: string, archivedAt: string | null) => ({
  id,
  full_name: name,
  preferred_name: null,
  avatar_url: null,
  avatar_path: null,
  archived_at: archivedAt,
})

describe('a conversation with someone the user has since removed', () => {
  it('lists them, marked archived', async () => {
    const db = fakeClient({
      interactions: [
        {
          id: 'c1',
          title: 'Call about the renewal',
          occurred_at: '2026-10-20T10:00:00Z',
          kind: 'call',
          source_kind: 'typed_notes',
          processing_status: 'ready',
          processing_error: null,
          summary: null,
          outcome: null,
          topics: [],
          duration_seconds: null,
          reviewed_at: null,
          meeting_id: null,
        },
      ],
      interaction_participants: [
        { interaction_id: 'c1', people: person('ava', 'Ava Active', null) },
        {
          interaction_id: 'c1',
          people: person('quinn', 'Quinn Halvorsen', '2026-10-25T01:00:00Z'),
        },
      ],
    })
    const [conversation] = await listConversations(db.client, 'user-1')

    expect(conversation?.participants.map((p) => [p.name, p.archived ?? false])).toEqual([
      ['Ava Active', false],
      ['Quinn Halvorsen', true],
    ])

    render(
      <ConversationCard
        conversation={conversation!}
        timeZone="UTC"
        now={new Date('2026-10-25T12:00:00Z')}
      />,
    )
    // Shortened to first names, as every card is, with the marker kept on.
    expect(screen.getByText(/^With /).textContent).toBe('With Ava and Quinn\u00a0(archived)')
  })

  it('a card for people still active reads as before', () => {
    render(
      <ConversationCard
        conversation={CONVERSATION}
        timeZone="UTC"
        now={new Date('2026-10-25T12:00:00Z')}
      />,
    )
    expect(screen.getByText(/^With /).textContent).not.toContain('archived')
  })
})

describe('the meeting header, with an archived attendee', () => {
  const seat = (id: string, name: string, company: string, archived: boolean) => ({
    id,
    name,
    fullName: name,
    src: null,
    title: null,
    company,
    companyDomain: null,
    context: archived ? 'Archived' : 'Decision maker',
    lastInteractionAt: null,
    openLoops: 0,
    owe: 0,
    ...(archived ? { archived: true } : {}),
  })

  it('shows them, marked archived, without listing their organisation at the table', () => {
    render(
      <MeetingCockpit
        title="Renewal scope"
        scheduledAt={null}
        people={[
          seat('m', 'Marcus Lee', 'Northwind', false),
          seat('q', 'Quinn Halvorsen', 'Halcyon Labs', true),
        ]}
        prep="ready"
        openLoops={0}
        owe={0}
        timeZone="UTC"
        now={new Date('2026-10-25T12:00:00Z')}
      />,
    )
    const room = screen.getByRole('list', { name: 'In the room' })
    expect(room.textContent).toContain('Quinn')
    expect(room.textContent).toContain('Archived')
    expect(screen.queryByText('Halcyon Labs')).toBeNull()
    expect(screen.getByText('Northwind')).toBeTruthy()
  })
})
