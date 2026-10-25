// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
 * Two sentences follow configuration instead of describing a setup that may
 * not be live: how long recordings sent in parts are kept, and the Google
 * Limited Use statement, shown only when Google Calendar can be connected.
 * =============================================================================
 */

afterEach(() => {
  cleanup()
  h.storage = false
  h.google = false
})

describe('the privacy page', () => {
  it('without part storage, says parts are transcribed as they arrive and not stored', () => {
    const text = render(<PrivacyPage />).container.textContent ?? ''
    expect(text).toContain('each part is transcribed as it arrives and is not stored')
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
