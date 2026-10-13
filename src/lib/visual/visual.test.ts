import { describe, expect, it } from 'vitest'
import { actionDirection, countDirections, groupByDirection } from './relationship-actions'
import { buildTimeline } from './timeline'
import { composeRemember, prepState } from './glance'
import { connectionsFor, describeConnection, findConnections } from './commonality'
import { logoPath, monogram, normaliseDomain } from './logo'
import { normalizeBrief } from '@/lib/brief'

describe('actionDirection', () => {
  it('reads each loop by who it runs toward', () => {
    expect(actionDirection({ kind: 'commitment', owner: 'user', status: 'open' })).toBe('owe')
    expect(actionDirection({ kind: 'commitment', owner: 'person', status: 'open' })).toBe('waiting')
    expect(actionDirection({ kind: 'commitment', owner: 'shared', status: 'open' })).toBe('revisit')
    expect(actionDirection({ kind: 'question', owner: 'user', status: 'open' })).toBe('revisit')
    expect(actionDirection({ kind: 'follow_up', owner: 'user', status: 'open' })).toBe('personal')
    expect(actionDirection({ kind: 'commitment', owner: 'person', status: 'done' })).toBe('completed')
  })

  it('a deferred loop keeps its direction rather than becoming a new state', () => {
    expect(actionDirection({ kind: 'commitment', owner: 'user', status: 'later' })).toBe('owe')
  })

  it('counts and groups in display order, dropping empty groups', () => {
    const loops = [
      { kind: 'commitment', owner: 'person', status: 'open' },
      { kind: 'commitment', owner: 'user', status: 'open' },
      { kind: 'commitment', owner: 'user', status: 'open' },
    ] as const
    expect(countDirections([...loops]).owe).toBe(2)
    expect(groupByDirection([...loops]).map((g) => g.direction)).toEqual(['owe', 'waiting'])
  })
})

describe('buildTimeline', () => {
  const now = new Date('2026-10-13T12:00:00Z')

  it('orders upcoming first, then newest past, and never invents a title', () => {
    const entries = buildTimeline(
      {
        personFirstName: 'Columbus',
        interactions: [
          {
            id: 'i1',
            title: 'Prototype walkthrough',
            occurredAt: '2026-10-01T15:00:00Z',
            kind: 'meeting',
            summary: null,
            outcome: 'Liked the map',
            meetingId: 'm-past',
          },
        ],
        meetings: [
          { id: 'm-next', title: 'Follow-up', scheduledAt: '2026-10-20T15:00:00Z', status: 'upcoming' },
          { id: 'm-past', title: 'Walkthrough', scheduledAt: '2026-10-01T15:00:00Z', status: 'completed' },
        ],
        loops: [
          {
            id: 'l1',
            description: 'Send the prototype',
            kind: 'commitment',
            owner: 'user',
            status: 'done',
            createdAt: '2026-10-01T16:00:00Z',
            completedAt: '2026-10-05T09:00:00Z',
            interactionId: 'i1',
          },
          {
            id: 'l2',
            description: 'Proposed, never confirmed',
            kind: 'commitment',
            owner: 'user',
            status: 'open',
            reviewStatus: 'proposed',
            createdAt: '2026-10-02T16:00:00Z',
            completedAt: null,
            interactionId: 'i1',
          },
        ],
      },
      now,
    )

    expect(entries.map((e) => e.kind)).toEqual([
      'upcoming',
      'commitment_completed',
      'commitment',
      'conversation',
    ])
    // The meeting a conversation was kept for is not shown twice.
    expect(entries.find((e) => e.id === 'meeting:m-past')).toBeUndefined()
    // An unreviewed proposal is not memory.
    expect(entries.find((e) => e.id === 'loop:l2')).toBeUndefined()
    expect(entries[2]!.context).toBe('You promised')
    expect(entries[3]!.detail).toBe('Liked the map')
  })

  it('keeps provenance on memory entries', () => {
    const [entry] = buildTimeline({
      personFirstName: 'Ravi',
      memories: [
        {
          id: 'o1',
          content: 'Prefers numbers before narrative',
          createdAt: '2026-09-01T00:00:00Z',
          evidenceLevel: 'inferred',
          sourceKind: 'ai_inference',
        },
      ],
    })
    expect(entry!.evidence).toBe('inferred')
    expect(entry!.source).toBe('inference')
  })
})

describe('composeRemember', () => {
  const brief = normalizeBrief({
    participants: [
      {
        personId: 'p1',
        name: 'Columbus',
        whatMatters: ['Visual relationship context', 'Speed'],
        knownConcerns: ['Data privacy'],
        guidance: [],
        publicContext: [],
      },
      {
        personId: 'p2',
        name: 'Stranger',
        whatMatters: ['Something read on a website'],
        publicOnly: true,
        knownConcerns: [],
        guidance: [],
        publicContext: [],
      },
    ],
  })

  it('selects at most three lines, recorded evidence before public context', () => {
    const items = composeRemember({ brief, openLoopCount: 1 })
    expect(items).toHaveLength(3)
    expect(items.map((i) => i.text)).toEqual([
      'Visual relationship context',
      'Data privacy',
      'Speed',
    ])
    expect(items.some((i) => i.text.includes('website'))).toBe(false)
  })

  it('falls back to the last conversation and the open count, never to invention', () => {
    const items = composeRemember({
      brief: null,
      lastConversation: { title: 'Kickoff', outcome: 'Agreed a pilot', summary: null },
      openLoopCount: 2,
    })
    expect(items.map((i) => i.text)).toEqual(['Agreed a pilot', '2 loops are still open between you'])
    expect(composeRemember({ brief: null })).toEqual([])
  })

  it('prep state is a fact about the record', () => {
    expect(prepState({ hasBrief: true, attendeeCount: 0 })).toBe('ready')
    expect(prepState({ hasBrief: false, attendeeCount: 0 })).toBe('needs_people')
    expect(prepState({ hasBrief: false, attendeeCount: 2 })).toBe('not_prepared')
  })
})

describe('findConnections', () => {
  const people = [
    { id: 'a', organizationId: 'o1', organizationName: 'Bell' },
    { id: 'b', organizationId: 'o1', organizationName: 'Bell' },
    { id: 'c', organizationId: null, organizationName: null },
  ]

  it('joins people only on what the record holds at both ends', () => {
    const connections = findConnections({
      people,
      facts: [
        { personId: 'a', kind: 'education', value: 'Stanford University', evidence: 'observed' },
        { personId: 'c', kind: 'education', value: 'stanford university', evidence: 'confirmed' },
        // Inferred facts never hold up a line.
        { personId: 'b', kind: 'prior_role', value: 'Google', evidence: 'inferred' },
        { personId: 'c', kind: 'prior_role', value: 'Google', evidence: 'observed' },
        // Near-misses are not joined.
        { personId: 'b', kind: 'education', value: 'Stanford', evidence: 'confirmed' },
      ],
      meetings: [{ id: 'm1', personIds: ['a', 'c'] }, { id: 'm2', personIds: ['a', 'c'] }],
    })

    const kinds = connections.map((c) => `${c.a}-${c.b}:${c.kind}`).sort()
    expect(kinds).toEqual(['a-b:same_organization', 'a-c:education', 'a-c:shared_meeting'])
    const education = connections.find((c) => c.kind === 'education')!
    expect(education.evidence).toBe('observed')
    const met = connections.find((c) => c.kind === 'shared_meeting')!
    expect(describeConnection(met)).toBe('Met together · 2 times')
    expect(connectionsFor('a', connections)[0]!.kind).toBe('shared_meeting')
  })

  it('ignores people outside the record', () => {
    expect(
      findConnections({ people, meetings: [{ id: 'm', personIds: ['a', 'stranger'] }] }).filter(
        (c) => c.kind === 'shared_meeting',
      ),
    ).toEqual([])
  })
})

describe('logos', () => {
  it('accepts only a public hostname', () => {
    expect(normaliseDomain('https://www.Bell.ca/about')).toBe('bell.ca')
    expect(normaliseDomain('bell.ca:443')).toBe('bell.ca')
    expect(normaliseDomain('localhost')).toBeNull()
    expect(normaliseDomain('10.0.0.1')).toBeNull()
    expect(normaliseDomain('user@bell.ca')).toBeNull()
    expect(normaliseDomain('')).toBeNull()
    expect(logoPath('bell.ca')).toBe('/api/logo?domain=bell.ca')
    expect(logoPath(null)).toBeNull()
  })

  it('monograms skip legal suffixes', () => {
    expect(monogram('Acme Corp')).toBe('A')
    expect(monogram('Bell Canada')).toBe('BC')
    expect(monogram('The Atlantic')).toBe('A')
  })
})

describe('declaredIcons', () => {
  it('prefers touch icons and refuses SVG and data URLs', async () => {
    const { declaredIcons } = await import('./logo')
    const html = `
      <link rel="icon" href="/favicon-32.png" sizes="32x32">
      <link rel="icon" type="image/svg+xml" href="/logo.svg">
      <link rel="apple-touch-icon" href="https://cdn.bell.ca/touch.png">
      <link rel="icon" href="data:image/png;base64,AAAA">
      <link rel="stylesheet" href="/x.css">`
    expect(declaredIcons(html, 'https://bell.ca/')).toEqual([
      'https://cdn.bell.ca/touch.png',
      'https://bell.ca/favicon-32.png',
    ])
  })
})
