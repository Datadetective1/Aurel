import { describe, expect, it } from 'vitest'
import { normalizeMicrosoftEvent } from './microsoft'
import { normalizeGoogleEvent } from './google'
import { candidateAttendees } from './sync'
import { extractMeetingUrl, looksLikeResource } from './provider'

/**
 * Normalization.
 *
 * The provider adapters are the only place that knows what Graph or Google
 * returns, so these are where a provider quirk gets caught. Several exist
 * because the quirk is genuinely surprising: Graph returns wall-clock time
 * rather than an instant, Google splits all-day events into a different field
 * entirely, and both express "cancelled" differently.
 */

describe('microsoft normalization', () => {
  const base = {
    id: 'AAMkAG',
    subject: 'Q3 capacity review',
    start: { dateTime: '2026-09-01T14:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-09-01T15:00:00.0000000', timeZone: 'UTC' },
    organizer: { emailAddress: { address: 'Maya@Northwind.com' } },
    attendees: [
      { emailAddress: { address: 'Maya@Northwind.com', name: 'Maya Chen' }, type: 'required' },
      { emailAddress: { address: 'room3@northwind.com', name: 'Meeting Room 3' }, type: 'resource' },
    ],
    lastModifiedDateTime: '2026-08-20T09:00:00Z',
  }

  it('turns wall-clock plus zone into a real instant', () => {
    // Graph does not return a suffixed instant. Treating the raw string as UTC
    // without the Prefer header would shift every meeting by the user's offset.
    const event = normalizeMicrosoftEvent(base)
    expect(event?.startsAt).toBe('2026-09-01T14:00:00.000Z')
    expect(event?.endsAt).toBe('2026-09-01T15:00:00.000Z')
  })

  it('lowercases emails so they join against Person records', () => {
    const event = normalizeMicrosoftEvent(base)
    expect(event?.organizerEmail).toBe('maya@northwind.com')
    expect(event?.attendees[0]?.email).toBe('maya@northwind.com')
  })

  it('marks rooms as resources rather than people', () => {
    const event = normalizeMicrosoftEvent(base)
    expect(event?.attendees[1]?.isResource).toBe(true)
  })

  it('treats a cancelled event as cancelled, not missing', () => {
    expect(normalizeMicrosoftEvent({ ...base, isCancelled: true })?.status).toBe('cancelled')
    // The delta feed uses @removed instead of a status field.
    expect(normalizeMicrosoftEvent({ ...base, '@removed': { reason: 'deleted' } })?.status).toBe(
      'cancelled',
    )
  })

  it('stores nothing about what a private event says', () => {
    // The provider marked it private. We keep when it is and who is in it,
    // because that is what preparation needs, and drop the rest.
    const event = normalizeMicrosoftEvent({
      ...base,
      sensitivity: 'private',
      bodyPreview: 'Discussing the redundancy list',
      location: { displayName: 'HR office' },
    })

    expect(event?.isPrivate).toBe(true)
    expect(event?.title).toBeNull()
    expect(event?.description).toBeNull()
    expect(event?.location).toBeNull()
    expect(event?.startsAt).toBe('2026-09-01T14:00:00.000Z')
    expect(event?.attendees).toHaveLength(2)
  })

  it('keeps series identity so a moved occurrence is not a duplicate', () => {
    const event = normalizeMicrosoftEvent({ ...base, seriesMasterId: 'series-1' })
    expect(event?.recurrenceId).toBe('series-1')
    expect(event?.isRecurring).toBe(true)
    // Its own id is what makes it a distinct row.
    expect(event?.externalId).toBe('AAMkAG')
  })

  it('drops an event with no usable start rather than inventing one', () => {
    expect(normalizeMicrosoftEvent({ ...base, start: undefined })).toBeNull()
    expect(normalizeMicrosoftEvent({ ...base, start: { dateTime: 'not a date' } })).toBeNull()
  })

  it('survives an event with no attendees at all', () => {
    const event = normalizeMicrosoftEvent({ ...base, attendees: undefined })
    expect(event?.attendees).toEqual([])
  })
})

describe('google normalization', () => {
  const base = {
    id: 'gcal-1',
    summary: 'Platform sync',
    start: { dateTime: '2026-09-01T14:00:00Z' },
    end: { dateTime: '2026-09-01T15:00:00Z' },
    organizer: { email: 'Daniel@Northwind.com' },
    attendees: [{ email: 'Daniel@Northwind.com', displayName: 'Daniel Brooks', organizer: true }],
    updated: '2026-08-20T09:00:00Z',
  }

  it('reads a timed event as an instant', () => {
    expect(normalizeGoogleEvent(base)?.startsAt).toBe('2026-09-01T14:00:00.000Z')
    expect(normalizeGoogleEvent(base)?.isAllDay).toBe(false)
  })

  it('reads an all-day event from the date field', () => {
    // Google puts all-day events in `date`, not `dateTime`. Reading only
    // dateTime would drop them entirely.
    const event = normalizeGoogleEvent({ ...base, start: { date: '2026-09-01' }, end: { date: '2026-09-02' } })
    expect(event?.isAllDay).toBe(true)
    expect(event?.startsAt).toBe('2026-09-01T00:00:00.000Z')
  })

  it('honours Google’s own privacy semantics', () => {
    const event = normalizeGoogleEvent({
      ...base,
      visibility: 'private',
      description: 'Sensitive',
      location: 'Room A',
    })
    expect(event?.isPrivate).toBe(true)
    expect(event?.title).toBeNull()
    expect(event?.description).toBeNull()
  })

  it('treats a cancelled status as cancelled', () => {
    expect(normalizeGoogleEvent({ ...base, status: 'cancelled' })?.status).toBe('cancelled')
  })

  it('marks a declared resource as a resource', () => {
    const event = normalizeGoogleEvent({
      ...base,
      attendees: [{ email: 'room@northwind.com', resource: true }],
    })
    expect(event?.attendees[0]?.isResource).toBe(true)
  })

  it('produces the same shape as Microsoft for the same meeting', () => {
    // The whole point of the abstraction: nothing downstream should be able to
    // tell which provider a meeting came from.
    const ms = normalizeMicrosoftEvent({
      id: 'x',
      subject: 'Same meeting',
      start: { dateTime: '2026-09-01T14:00:00.0000000', timeZone: 'UTC' },
    })
    const g = normalizeGoogleEvent({ id: 'x', summary: 'Same meeting', start: { dateTime: '2026-09-01T14:00:00Z' } })

    expect(Object.keys(ms!).sort()).toEqual(Object.keys(g!).sort())
    expect(ms?.startsAt).toBe(g?.startsAt)
  })
})

describe('resource detection', () => {
  it('recognises rooms and equipment by name', () => {
    expect(looksLikeResource({ email: 'boardroom@x.com', displayName: null })).toBe(true)
    expect(looksLikeResource({ email: null, displayName: 'Conference Room B' })).toBe(true)
    expect(looksLikeResource({ email: 'noreply@x.com', displayName: null })).toBe(true)
  })

  it('does not mistake a person for furniture', () => {
    // A false positive here silently drops a real attendee from the room.
    expect(looksLikeResource({ email: 'maya@northwind.com', displayName: 'Maya Chen' })).toBe(false)
    expect(looksLikeResource({ email: 'daniel.rooming@x.com', displayName: 'Daniel Rooming' })).toBe(
      false,
    )
  })
})

describe('candidateAttendees', () => {
  const people = [
    { email: 'maya@northwind.com', displayName: 'Maya', isOrganizer: false, isResource: false, response: 'accepted' },
    { email: 'room@northwind.com', displayName: 'Room', isOrganizer: false, isResource: true, response: 'none' },
    { email: 'me@mine.com', displayName: 'Me', isOrganizer: true, isResource: false, response: 'accepted' },
    { email: null, displayName: 'No address', isOrganizer: false, isResource: false, response: 'none' },
  ]

  it('excludes resources, the account owner, and anyone with no address', () => {
    // The owner is excluded because "who is in the room" means the other
    // people; matching yourself into your own relationship graph is nonsense.
    const result = candidateAttendees(people, 'ME@mine.com'.toLowerCase())
    expect(result.map((a) => a.email)).toEqual(['maya@northwind.com'])
  })

  it('keeps everyone when the owner is unknown', () => {
    expect(candidateAttendees(people, null).map((a) => a.email)).toEqual([
      'maya@northwind.com',
      'me@mine.com',
    ])
  })
})

describe('meeting links', () => {
  it('finds a join link wherever the provider hid it', () => {
    expect(extractMeetingUrl(null, 'https://teams.microsoft.com/l/meetup-join/abc')).toContain(
      'teams.microsoft.com',
    )
    expect(extractMeetingUrl('Join at https://meet.google.com/abc-defg-hij today')).toContain(
      'meet.google.com',
    )
    expect(extractMeetingUrl(null, null, 'https://northwind.zoom.us/j/123')).toContain('zoom.us')
  })

  it('returns null rather than a random URL from the body', () => {
    expect(extractMeetingUrl('See https://northwind.com/agenda for the agenda')).toBeNull()
    expect(extractMeetingUrl(null, undefined)).toBeNull()
  })
})
