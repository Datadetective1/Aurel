import { describe, expect, it } from 'vitest'
import { arrangeOwed, nudgeDayFor, readFreshness, STALE_AFTER_DAYS } from './owed'
import { COLD_AFTER_DAYS, goingCold, quietFor, reasonFor, type ColdFact } from './going-cold'
import { warmPaths } from './warm-path'
import { findConnections } from './commonality'
import { selectFollowThrough, type DigestLoop } from '@/lib/follow-through/select'
import { weekdayOf } from '@/lib/tz'

/**
 * The relationship tools added after the first testers: what is owed and
 * going stale, who is going cold and why to write, and who could make an
 * introduction. Each is a reading of what the record already holds.
 */

const TZ = 'America/Chicago'
const NOW = new Date('2026-10-30T17:00:00Z') // 30 Oct, midday in Chicago

describe('owed: how fresh a promise still is', () => {
  it('reads a dated promise as overdue, due soon, or fine', () => {
    expect(
      readFreshness({ dueOn: '2026-10-28', createdAt: '2026-10-01', status: 'open' }, TZ, NOW),
    ).toEqual({ freshness: 'overdue', note: 'Overdue by 2 days' })
    expect(
      readFreshness({ dueOn: '2026-10-30', createdAt: '2026-10-01', status: 'open' }, TZ, NOW).note,
    ).toBe('Due today')
    expect(
      readFreshness({ dueOn: '2026-10-31', createdAt: '2026-10-01', status: 'open' }, TZ, NOW),
    ).toEqual({ freshness: 'nudge', note: 'Due tomorrow' })
    expect(
      readFreshness({ dueOn: '2026-11-20', createdAt: '2026-10-01', status: 'open' }, TZ, NOW)
        .freshness,
    ).toBe('fresh')
  })

  it('nudges an undated promise before it goes stale, then calls it stale', () => {
    const at = (days: number) =>
      readFreshness(
        {
          dueOn: null,
          createdAt: new Date(NOW.getTime() - days * 86_400_000).toISOString(),
          status: 'open',
        },
        TZ,
        NOW,
      )
    expect(at(3).freshness).toBe('fresh')
    expect(at(STALE_AFTER_DAYS - 3).freshness).toBe('nudge')
    expect(at(STALE_AFTER_DAYS).freshness).toBe('stale')
    expect(at(STALE_AFTER_DAYS).note).toBe(`Open ${STALE_AFTER_DAYS} days, no date`)
  })

  it('splits by who owes whom, nearest to stale first', () => {
    const out = arrangeOwed([
      { id: 'a', direction: 'owe' as const, freshness: 'fresh' as const },
      { id: 'b', direction: 'owe' as const, freshness: 'overdue' as const },
      { id: 'c', direction: 'waiting' as const, freshness: 'nudge' as const },
      { id: 'd', direction: 'revisit' as const, freshness: 'fresh' as const },
      { id: 'e', direction: 'completed' as const, freshness: 'fresh' as const },
      { id: 'f', direction: 'personal' as const, freshness: 'stale' as const },
    ])
    expect(out.mine.map((l) => l.id)).toEqual(['b', 'f', 'a'])
    expect(out.theirs.map((l) => l.id)).toEqual(['c'])
    expect(out.shared.map((l) => l.id)).toEqual(['d'])
  })

  it('the morning email raises an undated loop the day it enters the nudge window', () => {
    const created = '2026-10-02'
    const nudgeDay = nudgeDayFor(created)
    const loop: DigestLoop = {
      id: 'x',
      description: 'send the deck',
      kind: 'commitment',
      owner: 'user',
      status: 'open',
      reviewStatus: 'confirmed',
      dueOn: null,
      deferredUntil: null,
      createdAt: `${created}T12:00:00Z`,
      personId: 'p',
      personName: 'Ravi',
      interactionId: null,
      interactionTitle: null,
      interactionDay: null,
    }
    const weekday = weekdayOf(nudgeDay)
    expect(weekday).not.toBe(1)
    const on = selectFollowThrough([loop], { today: nudgeDay, weekday, formatDay: (d) => d })
    expect(on.items).toHaveLength(1)
    // Once, not every morning after: the next weekday leaves it out again.
    const dayAfter = selectFollowThrough([loop], {
      today: '2026-10-14',
      weekday: 3,
      formatDay: (d) => d,
    })
    expect(nudgeDay).toBe('2026-10-13')
    expect(dayAfter.items).toHaveLength(0)
  })
})

describe('going cold', () => {
  const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()
  const people = [
    {
      id: 'maya',
      name: 'Maya Chen',
      relevance: 5,
      lastInteractionAt: days(40),
      createdAt: days(300),
    },
    {
      id: 'dan',
      name: 'Daniel Ruiz',
      relevance: 4,
      lastInteractionAt: days(5),
      createdAt: days(300),
    },
    {
      id: 'lee',
      name: 'Lee Park',
      relevance: 3,
      lastInteractionAt: days(90),
      createdAt: days(300),
    },
    { id: 'new', name: 'Ana Silva', relevance: 4, lastInteractionAt: null, createdAt: days(2) },
  ]
  const fact = (over: Partial<ColdFact>): ColdFact => ({
    personId: 'maya',
    kind: 'publication',
    value: 'Ops at scale',
    detail: null,
    evidence: 'observed',
    firstSeenAt: days(10),
    asOf: null,
    source: { title: 'Northwind blog', url: 'https://example.com/a', publishedAt: days(12) },
    ...over,
  })

  it('flags only important people untouched for weeks', () => {
    const out = goingCold(people, [], TZ, NOW)
    expect(out.map((c) => c.personId)).toEqual(['maya'])
    expect(out[0]!.daysQuiet).toBeGreaterThanOrEqual(COLD_AFTER_DAYS)
  })

  it('gives a reason from public news since the last conversation, labelled inferred', () => {
    const reason = reasonFor(people[0]!, [fact({})], TZ, NOW)
    expect(reason?.evidence).toBe('inferred')
    expect(reason?.text).toMatch(/^Maya published "Ops at scale"/)
    expect(reason?.sourceTitle).toBe('Northwind blog')
  })

  it('never rests a reason on an inferred fact, or on news older than the last talk', () => {
    expect(reasonFor(people[0]!, [fact({ evidence: 'inferred' })], TZ, NOW)).toBeNull()
    expect(
      reasonFor(
        people[0]!,
        [fact({ source: { title: null, url: null, publishedAt: days(60) } })],
        TZ,
        NOW,
      ),
    ).toBeNull()
  })

  it('says how long in the units a person uses', () => {
    expect(quietFor(10)).toBe('10 days')
    expect(quietFor(35)).toBe('5 weeks')
    expect(quietFor(95)).toBe('3 months')
  })
})

describe('warm path', () => {
  const people = [
    { id: 'target', organizationId: 'o1', organizationName: 'Northwind' },
    { id: 'colleague', organizationId: 'o1', organizationName: 'Northwind' },
    { id: 'friend', organizationId: 'o2', organizationName: 'Globex' },
    { id: 'stranger', organizationId: 'o1', organizationName: 'Northwind' },
  ]
  const connections = findConnections({
    people,
    facts: [
      { personId: 'target', kind: 'education', value: 'Rice University', evidence: 'observed' },
      { personId: 'friend', kind: 'education', value: 'Rice University', evidence: 'confirmed' },
    ],
    meetings: [{ id: 'm1', personIds: ['target', 'friend'] }],
  })

  it('names people the user knows who share something on record with the target', () => {
    const paths = warmPaths(
      'target',
      connections,
      [
        { id: 'colleague', relevance: 3, lastInteractionAt: '2026-06-01T00:00:00Z' },
        { id: 'friend', relevance: 5, lastInteractionAt: '2026-10-20T00:00:00Z' },
        { id: 'stranger', relevance: 3, lastInteractionAt: null },
      ],
      NOW,
    )
    expect(paths.map((p) => p.introducerId)).toEqual(['friend', 'colleague'])
    expect(paths[0]!.ties).toEqual(['Met together', 'Both studied at Rice University'])
    expect(paths[1]!.ties).toEqual(['Both at Northwind'])
  })

  it('finds no path when nothing is on record', () => {
    expect(
      warmPaths(
        'target',
        [],
        [{ id: 'friend', relevance: 5, lastInteractionAt: '2026-10-20T00:00:00Z' }],
        NOW,
      ),
    ).toEqual([])
  })
})
