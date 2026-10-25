// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { brand } from '@/lib/brand'

const h = vi.hoisted(() => ({ storage: false, google: false }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({
  features: {
    get captureStorage() {
      return h.storage
    },
  },
}))
vi.mock('@/lib/calendar/provider', () => ({ providerConfigured: () => h.google }))

const { default: PrivacyPage } = await import('./page')

/**
 * THE PRIVACY PAGE SAYS WHAT PRODUCTION DOES
 * =============================================================================
 * Recordings are described in three places -- on the device, on our
 * servers, at the provider -- and two sentences follow configuration instead
 * of describing a setup that may not be live: whether parts of a long
 * recording are stored, and the Google Limited Use statement, shown only when
 * Google Calendar can be connected.
 * =============================================================================
 */

afterEach(() => {
  cleanup()
  h.storage = false
  h.google = false
})

describe('the privacy page', () => {
  it('separates the phone, the servers and the provider', () => {
    const text = render(<PrivacyPage />).container.textContent ?? ''
    expect(text).toContain('On your device.')
    expect(text).toContain(
      'It stays there until the conversation has been kept, or until you discard it',
    )
    expect(text).toContain('it can be part of your phone’s own backup')
    expect(text).toContain('held in your browser tab until it is sent')
    expect(text).toContain(`On ${brand.name}’s servers.`)
    expect(text).toContain('never written to your record or our database')
    expect(text).toContain('At our service provider.')
    expect(text).toContain('not retained once transcribed')
    expect(text).toContain(
      'for abuse monitoring, and because our requests store the model’s response',
    )
  })

  it('without part storage, says each part is transcribed as it arrives and none is stored', () => {
    const text = render(<PrivacyPage />).container.textContent ?? ''
    expect(text).toContain('each part is transcribed as it arrives; no part is stored')
    expect(text).not.toContain('temporary storage')
  })

  it('with part storage on, describes the temporary storage and its clean-up', () => {
    h.storage = true
    const text = render(<PrivacyPage />).container.textContent ?? ''
    expect(text).toContain('waits in private, temporary storage')
    expect(text).toContain('removed within about a day')
  })

  it('states Google Limited Use only when Google Calendar can be connected', () => {
    expect(render(<PrivacyPage />).container.textContent).not.toContain('Limited Use')
    cleanup()
    h.google = true
    expect(render(<PrivacyPage />).container.textContent).toContain(
      'Google API Services User Data Policy, including the Limited Use requirements',
    )
  })
})
