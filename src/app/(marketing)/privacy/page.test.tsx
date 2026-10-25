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

  it('names the operator, and presents no company or registration as complete', () => {
    const text = render(<PrivacyPage />).container.textContent ?? ''
    expect(text).toContain(`${brand.name} is operated by ${brand.legalEntity}`)
    expect(text).not.toMatch(/\b(Labs|LLC|Inc\.?|DBA)\b/)
  })

  it('states what Apple 5.1.1(i) and CalOPPA ask for: retention, provider terms, changes', () => {
    const text = render(<PrivacyPage />).container.textContent ?? ''
    expect(text).toContain('kept for as long as your account exists')
    expect(text).toContain('If a change is material, we tell account holders by email')
    expect(text).toContain('under its own terms, which are not the same as this policy')
    expect(text).not.toContain('at least as well as this policy')
  })

  it('scopes the 7 days to Supabase’s automatic database backups, and lists providers separately', () => {
    const text = render(<PrivacyPage />).container.textContent ?? ''
    expect(text).toContain(
      'remains in Supabase’s automatic database backups until they age out, within 7 days',
    )
    expect(text).toContain('separately from the backups above')
    expect(text).toContain('OpenAI may keep text sent to its language model for up to 30 days')
    expect(text).toContain(
      'Resend keeps a copy of each email we send you, including its content, for 30 days',
    )
    expect(text).toContain('Exa’s terms let it store and use the search terms we send it')
    expect(text).toContain('including network addresses, for 7 days')
    expect(text).toContain('for up to 30 days, depending on plan')
  })

  it('separates permanent deletion from archiving, and names what is kept after deletion', () => {
    const text = render(<PrivacyPage />).container.textContent ?? ''
    expect(text).toContain('Deleting is permanent.')
    expect(text).toContain(
      'it archives them, which hides them but keeps their record so you can restore it',
    )
    expect(text).toContain('merging two records archives one of them')
    expect(text).toContain('shared items such as meetings, conversations and commitments stay')
    expect(text).toContain('What we keep after you delete your account.')
    expect(text).toContain('the log of billing notifications Stripe sent us')
    expect(text).toContain(
      'a one-way hash of the network address it came from, no longer linked to you',
    )
    expect(text).toContain('the reference to its Stripe customer record')
  })

  it('makes no training claim for Exa, and says what Exa receives', () => {
    const text = render(<PrivacyPage />).container.textContent ?? ''
    expect(text).toContain('Neither we nor OpenAI use your content to train models')
    expect(text).not.toContain('Your content is not used to train a shared model')
    expect(text).toContain('the person’s name and, where known, their organization and job title')
  })

  it('is in effect from a stated date, and does not claim a lawyer reviewed it', () => {
    const text = render(<PrivacyPage />).container.textContent ?? ''
    expect(text).toContain(`Effective ${brand.legal.policiesEffective}.`)
    expect(text).toContain('Not yet reviewed by a lawyer.')
    expect(text).not.toContain('Draft.')
  })

  it('gives contact by email, and publishes no postal address', () => {
    const text = render(<PrivacyPage />).container.textContent ?? ''
    expect(text).toContain(brand.email.privacy)
    expect(text).toContain(brand.email.support)
    expect(text).toContain(`${brand.name} is operated by ${brand.legalEntity}. Effective`)
  })
})
