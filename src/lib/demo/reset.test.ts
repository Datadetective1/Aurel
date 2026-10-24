import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const { removeSampleRecord } = await import('./reset')

/**
 * REMOVING THE SAMPLE RECORD
 * A demonstration captures a conversation "with Daniel" and prepares the
 * sample meeting. Removing the sample must take those with it -- and must
 * never take a conversation that involved a real person.
 */

type Row = Record<string, unknown>

function fakeDb(tables: Record<string, Row[]>) {
  const calls: { op: string; table: string }[] = []
  const rpc = vi.fn(async () => ({ error: null }))

  function query(table: string) {
    const filters: ((r: Row) => boolean)[] = []
    let op: 'select' | 'delete' = 'select'
    const run = () => {
      const rows = tables[table] ?? []
      const hit = rows.filter((r) => filters.every((f) => f(r)))
      if (op === 'delete') {
        tables[table] = rows.filter((r) => !hit.includes(r))
        calls.push({ op: 'delete', table })
        return { data: null, error: null }
      }
      return { data: hit, error: null }
    }
    const builder = {
      select: () => builder,
      delete: () => {
        op = 'delete'
        return builder
      },
      eq: (col: string, value: unknown) => {
        filters.push((r) => r[col] === value)
        return builder
      },
      in: (col: string, values: unknown[]) => {
        filters.push((r) => values.includes(r[col]))
        return builder
      },
      then: (resolve: (v: unknown) => unknown) => resolve(run()),
    }
    return builder
  }

  return { client: { from: query, rpc } as never, tables, calls, rpc }
}

const U = 'user-1'

function record() {
  return {
    people: [
      { id: 'maya', user_id: U, is_demo: true },
      { id: 'daniel', user_id: U, is_demo: true },
      { id: 'real-sam', user_id: U, is_demo: false },
    ],
    meetings: [
      { id: 'sample-meeting', user_id: U, is_demo: true },
      { id: 'real-meeting', user_id: U, is_demo: false },
    ],
    interactions: [
      // seeded by the sample: clear_demo_data's to remove
      { id: 'seeded', user_id: U, is_demo: true, meeting_id: null },
      // captured during the demo, with Daniel only
      { id: 'demo-capture', user_id: U, is_demo: false, meeting_id: null },
      // captured from the sample meeting's screen, nobody attached
      { id: 'meeting-capture', user_id: U, is_demo: false, meeting_id: 'sample-meeting' },
      // a real conversation that happened to include Maya
      { id: 'mixed', user_id: U, is_demo: false, meeting_id: null },
      // unrelated and real
      { id: 'real', user_id: U, is_demo: false, meeting_id: 'real-meeting' },
    ],
    interaction_participants: [
      { user_id: U, interaction_id: 'seeded', person_id: 'maya' },
      { user_id: U, interaction_id: 'demo-capture', person_id: 'daniel' },
      { user_id: U, interaction_id: 'mixed', person_id: 'maya' },
      { user_id: U, interaction_id: 'mixed', person_id: 'real-sam' },
      { user_id: U, interaction_id: 'real', person_id: 'real-sam' },
    ],
    commitments: [
      { id: 'c1', user_id: U, interaction_id: 'demo-capture' },
      { id: 'c2', user_id: U, interaction_id: 'mixed' },
      { id: 'c3', user_id: U, interaction_id: 'real' },
    ],
    ai_artifacts: [
      { id: 'brief-sample', user_id: U, subject_kind: 'meeting', subject_id: 'sample-meeting' },
      { id: 'brief-real', user_id: U, subject_kind: 'meeting', subject_id: 'real-meeting' },
    ],
  }
}

describe('removeSampleRecord', () => {
  it('removes conversations captured only with sample people, and their loops', async () => {
    const db = fakeDb(record())
    const result = await removeSampleRecord(db.client, U)

    expect(result).toEqual({ ok: true, conversationsRemoved: 2 })
    const left = db.tables.interactions!.map((r) => r.id)
    expect(left).not.toContain('demo-capture')
    expect(left).not.toContain('meeting-capture')
    expect(db.tables.commitments!.map((r) => r.id)).toEqual(['c2', 'c3'])
  })

  it('never removes a conversation that involved a real person', async () => {
    const db = fakeDb(record())
    await removeSampleRecord(db.client, U)
    const left = db.tables.interactions!.map((r) => r.id)
    expect(left).toContain('mixed')
    expect(left).toContain('real')
  })

  it('leaves the seeded rows to clear_demo_data, and calls it last', async () => {
    const db = fakeDb(record())
    await removeSampleRecord(db.client, U)
    expect(db.tables.interactions!.map((r) => r.id)).toContain('seeded')
    expect(db.rpc).toHaveBeenCalledWith('clear_demo_data')
  })

  it('removes a brief prepared for the sample meeting, not for a real one', async () => {
    const db = fakeDb(record())
    await removeSampleRecord(db.client, U)
    expect(db.tables.ai_artifacts!.map((r) => r.id)).toEqual(['brief-real'])
  })

  it('touches nothing but the RPC when there is no sample record', async () => {
    const db = fakeDb({ people: [], meetings: [] })
    expect(await removeSampleRecord(db.client, U)).toEqual({ ok: true, conversationsRemoved: 0 })
    expect(db.calls).toEqual([])
    expect(db.rpc).toHaveBeenCalledOnce()
  })
})
