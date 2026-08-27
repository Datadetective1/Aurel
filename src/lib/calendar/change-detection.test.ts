import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Change detection in the sync.
 *
 * Two defects lived here together, and the second is the reason the first was
 * never noticed: the timestamp comparison could not fire, so every sync
 * rewrote every event, so attendee matches always looked fresh.
 *
 * Repairing only the timestamp would have shipped the worse bug. A user adds
 * somebody to Atturel, presses Sync now, and the attendee still reads as
 * unknown -- because the event has not changed on Microsoft's side, and never
 * will merely because our end learned who someone is.
 */

const source = readFileSync(join(process.cwd(), 'src', 'lib', 'calendar', 'sync.ts'), 'utf8')

describe('provider timestamps compare as instants', () => {
  it('treats Postgres and Graph spellings of one moment as equal', () => {
    // The exact pair observed in production on the same event.
    const stored = '2026-08-27 02:00:53.016446+00'
    const fromGraph = '2026-08-27T02:00:53.0164460Z'

    expect(stored).not.toBe(fromGraph)
    expect(new Date(stored).getTime()).toBe(new Date(fromGraph).getTime())
  })

  it('does not compare the marker as a string', () => {
    // A string comparison is the original bug. Guarding the shape rather than
    // only the behaviour, because this is the line that regressed.
    expect(source).not.toMatch(/provider_updated_at === event\.providerUpdatedAt/)
    expect(source).toContain('sameInstant(')
  })
})

describe('skipping an unchanged event', () => {
  it('also requires the attendee matches to be unchanged', () => {
    // Without this the optimisation goes stale the moment a user adds a person.
    const skip = source.slice(source.indexOf('sameInstant(existing.provider_updated_at'))
    expect(skip.slice(0, 200)).toContain('sameMatches(')
  })
})
