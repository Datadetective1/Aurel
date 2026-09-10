import { describe, expect, it } from 'vitest'
import {
  compareLoops,
  confidenceLabel,
  displayStatus,
  loopGroup,
  loopIsActive,
  transitionLoop,
} from './loops'

/**
 * Open loop state.
 *
 * Four states, four actions, and a deferral that has to come back on its own.
 * A loop that stays hidden after "Later" is a promise the product helped the
 * user forget, which is the exact opposite of its job.
 */

const chicago = { now: new Date('2026-09-10T20:00:00Z'), timeZone: 'America/Chicago' }

describe('transitionLoop', () => {
  it('marks done with a completion time and clears deferral', () => {
    const t = transitionLoop('done', chicago)
    expect(t.status).toBe('done')
    expect(t.completed_at).toBe(chicago.now.toISOString())
    expect(t.deferred_until).toBeNull()
    expect(t.cancelled_at).toBeNull()
  })

  it('cancels with a cancellation time, never the legacy "dropped"', () => {
    const t = transitionLoop('cancel', chicago)
    expect(t.status).toBe('cancelled')
    expect(t.cancelled_at).toBe(chicago.now.toISOString())
    expect(t.completed_at).toBeNull()
  })

  it("defers a week from today where the user is, not from the server's day", () => {
    // 20:00Z on the 10th is still the 10th in Chicago.
    const t = transitionLoop('later', chicago)
    expect(t.status).toBe('later')
    expect(t.deferred_until).toBe('2026-09-17')
  })

  it('reopens cleanly', () => {
    const t = transitionLoop('reopen', chicago)
    expect(t).toEqual({ status: 'open', completed_at: null, cancelled_at: null, deferred_until: null })
  })
})

describe('loopIsActive', () => {
  it('shows an open, confirmed loop', () => {
    expect(
      loopIsActive({ status: 'open', deferred_until: null, review_status: 'confirmed' }, 'UTC'),
    ).toBe(true)
  })

  it('hides a proposal the user has not confirmed', () => {
    expect(
      loopIsActive({ status: 'open', deferred_until: null, review_status: 'proposed' }, 'UTC'),
    ).toBe(false)
  })

  it('hides a deferred loop until its date, then brings it back', () => {
    const loop = { status: 'later' as const, deferred_until: '2026-09-17', review_status: 'confirmed' as const }
    expect(loopIsActive(loop, 'UTC', new Date('2026-09-16T12:00:00Z'))).toBe(false)
    expect(loopIsActive(loop, 'UTC', new Date('2026-09-17T00:00:00Z'))).toBe(true)
  })

  it('never shows a done or cancelled loop', () => {
    expect(loopIsActive({ status: 'done', deferred_until: null, review_status: 'confirmed' }, 'UTC')).toBe(false)
    expect(loopIsActive({ status: 'cancelled', deferred_until: null, review_status: 'confirmed' }, 'UTC')).toBe(false)
    expect(loopIsActive({ status: 'dropped', deferred_until: null, review_status: 'confirmed' }, 'UTC')).toBe(false)
  })
})

describe('grouping and ordering', () => {
  it('reads the legacy dropped state as cancelled', () => {
    expect(displayStatus('dropped')).toBe('cancelled')
    expect(displayStatus('later')).toBe('later')
  })

  it('files loops by who owes them', () => {
    expect(loopGroup({ kind: 'commitment', owner: 'user' })).toBe('you_promised')
    expect(loopGroup({ kind: 'follow_up', owner: 'person' })).toBe('waiting_on_them')
    expect(loopGroup({ kind: 'question', owner: 'person' })).toBe('unanswered')
    expect(loopGroup({ kind: 'commitment', owner: 'shared' })).toBe('shared')
  })

  it('puts overdue first, then soonest, then undated newest first', () => {
    const now = new Date('2026-09-10T12:00:00Z')
    const rows = [
      { id: 'undated-old', due_on: null, created_at: '2026-09-01T00:00:00Z' },
      { id: 'soon', due_on: '2026-09-12', created_at: '2026-09-02T00:00:00Z' },
      { id: 'overdue', due_on: '2026-09-01', created_at: '2026-09-03T00:00:00Z' },
      { id: 'undated-new', due_on: null, created_at: '2026-09-09T00:00:00Z' },
    ]
    const sorted = [...rows].sort((a, b) => compareLoops(a, b, 'UTC', now)).map((r) => r.id)
    expect(sorted).toEqual(['overdue', 'soon', 'undated-new', 'undated-old'])
  })

  it('labels confidence in two words or none', () => {
    expect(confidenceLabel(null)).toBeNull()
    expect(confidenceLabel(0.9)).toBe('Likely')
    expect(confidenceLabel(0.5)).toBe('Possible')
  })
})
