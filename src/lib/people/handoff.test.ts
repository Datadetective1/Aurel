import { describe, expect, it } from 'vitest'
import { composeHandoff } from './handoff'
import type { PersonContext } from '@/lib/ai/types'

const person: PersonContext = {
  id: 'p1',
  fullName: 'Maya Chen',
  preferredName: 'Maya',
  displayName: 'Maya',
  jobTitle: 'VP Operations',
  organization: 'Northwind',
  relationshipType: 'client',
  relevance: 5,
  notes: 'Prefers mornings. Kid starts college soon.',
  topics: ['Budget', 'Hiring'],
  firstInteractionAt: '2026-03-03T15:00:00Z',
  lastInteractionAt: '2026-10-12T15:00:00Z',
  interactionCount: 6,
  observations: {
    confirmed: [
      {
        id: 'o1',
        content: 'Wants numbers before opinions',
        category: 'communication',
        evidenceLevel: 'confirmed',
        reinforcementCount: 1,
        lastReinforcedAt: null,
        sources: [],
      },
    ],
    observed: [],
    inferred: [
      {
        id: 'o2',
        content: 'May be under budget pressure',
        category: 'priority',
        evidenceLevel: 'inferred',
        reinforcementCount: 1,
        lastReinforcedAt: null,
        sources: [],
      },
    ],
  },
  recentInteractions: [
    {
      id: 'i1',
      title: 'Budget sync',
      occurredAt: '2026-10-12T15:00:00Z',
      kind: 'meeting',
      summary: 'Agreed a smaller pilot',
      outcome: null,
      wentWell: null,
    },
  ],
  openCommitments: [
    {
      id: 'c1',
      description: 'Send the revised proposal',
      owner: 'user',
      ownerName: null,
      dueOn: '2026-10-20',
      isOverdue: true,
    },
    {
      id: 'c2',
      description: 'Share the vendor list',
      owner: 'person',
      ownerName: 'Maya',
      dueOn: null,
      isOverdue: false,
    },
  ],
  decisions: [],
  professionalFacts: [
    {
      id: 'f1',
      kind: 'current_role',
      value: 'VP Operations',
      detail: 'Northwind',
      evidenceLevel: 'observed',
      asOf: null,
      hasConflict: false,
      sourceTitles: [],
    },
  ],
  publicSources: [],
  lastResearchedAt: null,
} as unknown as PersonContext

describe('handoff pack', () => {
  const pack = composeHandoff(person, {
    timeZone: 'America/Chicago',
    now: new Date('2026-10-30T17:00:00Z'),
    productName: 'Atturel',
    relationship: 'Client',
  })

  it('reads as a brief someone else can pick up', () => {
    expect(pack.title).toBe('Handoff: Maya Chen')
    expect(pack.text).toMatch(/Maya Chen, VP Operations at Northwind\. Relationship: Client\./)
    expect(pack.text).toMatch(
      /6 conversations on record since 3 Mar 2026\. Last spoke 12 Oct 2026\./,
    )
    expect(pack.text).toMatch(/Promised to Maya: Send the revised proposal \(overdue\)/)
    expect(pack.text).toMatch(/Maya promised: Share the vendor list/)
  })

  it('keeps every evidence label', () => {
    expect(pack.text).toMatch(/Wants numbers before opinions \(Confirmed\)/)
    expect(pack.text).toMatch(/May be under budget pressure \(Inferred, worth checking\)/)
    expect(pack.text).toMatch(/VP Operations, Northwind \(Observed\)/)
  })

  it('leaves private notes out unless asked', () => {
    expect(pack.text).not.toMatch(/Prefers mornings/)
    const withNotes = composeHandoff(person, {
      timeZone: 'UTC',
      productName: 'Atturel',
      includeNotes: true,
    })
    expect(withNotes.text).toMatch(/NOTES\nPrefers mornings/)
  })

  it('has no dashes standing in for punctuation', () => {
    expect(pack.text).not.toMatch(/—|–|--/)
  })
})
