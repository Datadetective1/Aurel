import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { firstRunComplete } from '@/components/app/first-run'
import type { FirstRunState } from '@/components/app/first-run'

/**
 * First run.
 *
 * The checklist has one job beyond listing three steps: disappear on its own.
 * A getting-started panel that outstays its welcome is worse than none, and it
 * has no dismiss state to remember, so "done" has to be computed correctly from
 * the account every time.
 */

function state(overrides: Partial<FirstRunState> = {}): FirstRunState {
  return {
    calendarConnected: false,
    calendarAvailable: true,
    upcomingCount: 0,
    unknownAttendees: 0,
    researchedCount: 0,
    peopleCount: 0,
    preparedCount: 0,
    ...overrides,
  }
}

describe('firstRunComplete', () => {
  it('is not complete on a brand new account', () => {
    expect(firstRunComplete(state())).toBe(false)
  })

  it('needs all three, not two', () => {
    expect(firstRunComplete(state({ calendarConnected: true, researchedCount: 1 }))).toBe(false)
    expect(firstRunComplete(state({ calendarConnected: true, preparedCount: 1 }))).toBe(false)
    expect(firstRunComplete(state({ researchedCount: 1, preparedCount: 1 }))).toBe(false)
  })

  it('is complete once the calendar, research and a brief exist', () => {
    expect(
      firstRunComplete(state({ calendarConnected: true, researchedCount: 1, preparedCount: 1 })),
    ).toBe(true)
  })

  it('does not demand a calendar the deployment cannot offer', () => {
    // Otherwise an install with no OAuth app shows a checklist that can never
    // be finished, on every visit, forever.
    expect(
      firstRunComplete(state({ calendarAvailable: false, researchedCount: 1, preparedCount: 1 })),
    ).toBe(true)
  })

  it('counts people as researched only when evidence was accepted', () => {
    // A run that legitimately found nothing has not researched anybody, and
    // saying otherwise would tick a step the user did not complete.
    expect(firstRunComplete(state({ calendarConnected: true, peopleCount: 5, preparedCount: 1 }))).toBe(
      false,
    )
  })
})

describe('what the panel is allowed to say', () => {
  const source = readFileSync(
    join(process.cwd(), 'src', 'components', 'app', 'first-run.tsx'),
    'utf8',
  )

  it('never overclaims what research reaches', () => {
    // The wording that keeps this honest, pinned so a future edit has to be
    // deliberate about it.
    expect(source).toContain('legitimate public professional sources')
    expect(source).not.toMatch(/social|LinkedIn|private database|profile lookup/i)
  })

  it('states the calendar is read-only where the user decides to connect', () => {
    expect(source).toMatch(/never creates, edits or answers/)
  })
})
