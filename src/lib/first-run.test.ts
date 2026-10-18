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
    meetingCount: 0,
    ...overrides,
  }
}

describe('firstRunComplete', () => {
  it('is not complete on a brand new account', () => {
    expect(firstRunComplete(state())).toBe(false)
  })

  it('needs all three, not two', () => {
    expect(firstRunComplete(state({ calendarConnected: true, peopleCount: 1 }))).toBe(false)
    expect(firstRunComplete(state({ calendarConnected: true, preparedCount: 1 }))).toBe(false)
    expect(firstRunComplete(state({ peopleCount: 1, preparedCount: 1 }))).toBe(false)
  })

  it('is complete once there is a meeting, a person and a brief', () => {
    expect(
      firstRunComplete(state({ calendarConnected: true, peopleCount: 1, preparedCount: 1 })),
    ).toBe(true)
  })

  it('treats a manual meeting as step one done: the calendar is one route, not the only one', () => {
    // The canonical journey is "connect your calendar OR create a meeting".
    // Demanding the calendar would leave a manual user with a checklist that
    // never finishes, which is also what an install with no OAuth app saw.
    expect(firstRunComplete(state({ meetingCount: 1, peopleCount: 1, preparedCount: 1 }))).toBe(
      true,
    )
    expect(
      firstRunComplete(
        state({ calendarAvailable: false, meetingCount: 1, peopleCount: 1, preparedCount: 1 }),
      ),
    ).toBe(true)
  })

  it('does not count research as its own step', () => {
    // Research is part of choosing the person, so an account with a person, a
    // meeting and a brief is done whether or not a source was accepted.
    expect(
      firstRunComplete(
        state({ meetingCount: 1, peopleCount: 1, preparedCount: 1, researchedCount: 0 }),
      ),
    ).toBe(true)
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

  it('returns a calendar connection to Today, not Settings', () => {
    expect(source).toContain("'/api/calendar/microsoft/connect?return=today'")
  })

  it('teaches the same sequence as the welcome email', () => {
    const email = readFileSync(join(process.cwd(), 'src', 'lib', 'email', 'templates.ts'), 'utf8')
    for (const step of ['Find the meeting', 'Choose who it', 'Prepare the meeting']) {
      expect(source).toContain(step)
      expect(email).toContain(step)
    }
  })
})
