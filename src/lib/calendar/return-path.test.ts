import { describe, expect, it } from 'vitest'
import { calendarOutcome, calendarReturnUrl, parseCalendarReturn } from './return-path'

/**
 * Calendar onboarding redirect. Connecting from Getting Started used to drop a
 * first-time user on the full Capabilities page; the activation path now
 * returns to Today, and nothing else is accepted as a destination.
 */
describe('calendar OAuth return path', () => {
  it('returns the activation path to Today with the outcome', () => {
    expect(calendarReturnUrl('https://www.atturel.com', 'today', 'connected')).toBe(
      'https://www.atturel.com/today?calendar=connected',
    )
  })

  it('keeps Settings as the default destination', () => {
    expect(parseCalendarReturn(null)).toBe('settings')
    expect(calendarReturnUrl('https://www.atturel.com', 'settings', 'denied')).toBe(
      'https://www.atturel.com/settings/capabilities?calendar=denied',
    )
  })

  it('accepts only a closed list, so it cannot become an open redirect', () => {
    expect(parseCalendarReturn('today')).toBe('today')
    for (const hostile of ['https://evil.example', '//evil.example', '/admin', 'TODAY', '']) {
      expect(parseCalendarReturn(hostile)).toBe('settings')
    }
  })

  it('encodes the reason rather than trusting it', () => {
    expect(calendarReturnUrl('https://x.test', 'today', 'a&b=c')).toBe(
      'https://x.test/today?calendar=a%26b%3Dc',
    )
  })
})

describe('what Today says after the consent screen', () => {
  it('says nothing when there is nothing to report', () => {
    expect(calendarOutcome(null, 'Atturel')).toBeNull()
  })

  it('confirms a connection plainly', () => {
    expect(calendarOutcome('connected', 'Atturel')).toMatchObject({
      tone: 'positive',
      title: 'Calendar connected',
    })
  })

  it('never claims success for any other reason, and always offers the manual path', () => {
    for (const reason of ['denied', 'failed', 'invalid', 'admin_consent_required', 'anything']) {
      const outcome = calendarOutcome(reason, 'Atturel')!
      expect(outcome.tone).toBe('caution')
      expect(outcome.title).not.toBe('Calendar connected')
      expect(outcome.body).toMatch(/by hand|try again/i)
    }
  })
})
