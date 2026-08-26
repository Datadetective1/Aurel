import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeMicrosoftEvent } from './microsoft'
import { normalizeGoogleEvent } from './google'

/**
 * Calendar privacy.
 *
 * A calendar is the most sensitive thing Atturel reads: who someone meets, when,
 * and about what. These tests guard the two places that leak — what we store,
 * and what we emit — by reading the source rather than trusting a review.
 *
 * The source-reading approach is deliberate. A unit test can only check the
 * paths it thinks to call; grepping the call sites catches the one somebody
 * adds next month without reading this file.
 */

function source(...parts: string[]): string {
  return readFileSync(join(process.cwd(), 'src', ...parts), 'utf8')
}

describe('nothing sensitive reaches analytics', () => {
  const files = [
    source('app', '(app)', 'calendar-actions.ts'),
    source('app', 'api', 'calendar', '[provider]', 'connect', 'route.ts'),
    source('app', 'api', 'calendar', '[provider]', 'callback', 'route.ts'),
  ].join('\n')

  it('never puts event content into a track() call', () => {
    // Every calendar track() call must carry counts, providers and reasons.
    // These are the property names that would mean content got through.
    const trackCalls = [...files.matchAll(/track\(\s*'calendar_[a-z_]+'\s*,\s*\{([^}]*)\}/g)].map(
      (m) => m[1] ?? '',
    )

    expect(trackCalls.length).toBeGreaterThan(5)

    for (const props of trackCalls) {
      expect(props).not.toMatch(/\btitle\b/)
      expect(props).not.toMatch(/\bsubject\b/)
      expect(props).not.toMatch(/\bemail\b/)
      expect(props).not.toMatch(/\bdisplayName\b/)
      expect(props).not.toMatch(/\battendees\s*:/)
      expect(props).not.toMatch(/\bdescription\b/)
      expect(props).not.toMatch(/\blocation\b/)
    }
  })

  it('never logs event content either', () => {
    const logCalls = [...files.matchAll(/logger\.[a-z]+\(\s*'[a-z_.]+'\s*,\s*\{([^}]*)\}/g)].map(
      (m) => m[1] ?? '',
    )
    for (const props of logCalls) {
      expect(props).not.toMatch(/\btitle\b|\bsubject\b|\bemail\b|\bdescription\b|\battendees\b/)
    }
  })

  it('never logs a token', () => {
    const calendarSource = [
      files,
      source('lib', 'calendar', 'microsoft.ts'),
      source('lib', 'calendar', 'google.ts'),
      source('lib', 'calendar', 'sync.ts'),
    ].join('\n')

    // Only the props argument. The event NAME may legitimately mention a
    // token -- 'calendar.no_refresh_token' describes a missing one -- and
    // matching on the name is the false positive this originally tripped over.
    const props = [...calendarSource.matchAll(/logger\.[a-z]+\(\s*'[a-z_.]+'\s*,\s*\{([^}]*)\}/g)].map(
      (m) => m[1] ?? '',
    )

    expect(props.length).toBeGreaterThan(4)
    for (const call of props) {
      expect(call).not.toMatch(/accessToken|refreshToken|access_token|refresh_token|client_secret/)
    }
  })
})

describe('private events keep their privacy', () => {
  const microsoftPrivate = {
    id: 'p1',
    subject: 'Occupational health referral',
    bodyPreview: 'Details of the referral',
    location: { displayName: 'HR office' },
    sensitivity: 'private',
    start: { dateTime: '2026-09-01T10:00:00.0000000' },
    attendees: [{ emailAddress: { address: 'hr@northwind.com', name: 'HR' } }],
  }

  it('stores when and who, and nothing about what', () => {
    const event = normalizeMicrosoftEvent(microsoftPrivate)
    expect(event?.title).toBeNull()
    expect(event?.description).toBeNull()
    expect(event?.location).toBeNull()
    expect(event?.meetingUrl).toBeNull()

    // Preparation still works: the time and the room survive.
    expect(event?.startsAt).toBeTruthy()
    expect(event?.attendees).toHaveLength(1)
    expect(event?.isPrivate).toBe(true)
  })

  it('applies the same rule to Google confidential events', () => {
    const event = normalizeGoogleEvent({
      id: 'p2',
      summary: 'Confidential',
      description: 'Body',
      visibility: 'confidential',
      start: { dateTime: '2026-09-01T10:00:00Z' },
    })
    expect(event?.isPrivate).toBe(true)
    expect(event?.title).toBeNull()
    expect(event?.description).toBeNull()
  })

  it('does not invent privacy the provider did not declare', () => {
    // Overriding the provider's semantics in either direction is wrong. A
    // normal meeting keeps its subject.
    const event = normalizeMicrosoftEvent({ ...microsoftPrivate, sensitivity: 'normal' })
    expect(event?.isPrivate).toBe(false)
    expect(event?.title).toBe('Occupational health referral')
  })

  it('truncates a long description rather than storing an entire body', () => {
    const event = normalizeGoogleEvent({
      id: 'p3',
      summary: 'Planning',
      description: 'x'.repeat(5000),
      start: { dateTime: '2026-09-01T10:00:00Z' },
    })
    expect(event?.description?.length).toBeLessThanOrEqual(500)
  })
})

describe('read-only by construction', () => {
  it('the provider interface offers no way to modify a calendar', () => {
    // The safety property is structural: V1 cannot write to someone's calendar
    // because the vocabulary does not exist. Adding it would be a visible
    // change to this interface rather than a quiet one at a call site.
    const contract = source('lib', 'calendar', 'provider.ts')
    const interfaceBlock = contract.slice(
      contract.indexOf('export interface CalendarProvider'),
      contract.indexOf('export const MICROSOFT_SCOPES'),
    )

    for (const forbidden of ['createEvent', 'updateEvent', 'deleteEvent', 'respond', 'accept', 'decline']) {
      expect(interfaceBlock).not.toContain(forbidden)
    }
  })

  it('no calendar module issues a mutating HTTP verb at a provider', () => {
    // The token endpoints are POSTs by specification; a calendar API call is
    // never anything but a GET.
    for (const file of ['microsoft.ts', 'google.ts', 'sync.ts']) {
      const text = source('lib', 'calendar', file)
      expect(text).not.toMatch(/method:\s*'(PUT|PATCH|DELETE)'/)
    }
  })
})
