// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { brand } from '@/lib/brand'
import TermsPage from './page'

/**
 * THE TERMS MATCH THE PRODUCT
 * =============================================================================
 * The 14-day trial as it works (once, no card, back to Free, first charge no
 * sooner than two days after subscribing), and sharing limited to the
 * providers the Privacy policy names.
 * =============================================================================
 */

afterEach(cleanup)

describe('the terms', () => {
  it('state the trial as it works', () => {
    const text = render(<TermsPage />).container.textContent ?? ''
    expect(text).toContain('14-day trial, once per account, with no card')
    expect(text).toContain('returns to Free unless you subscribe, and nothing is deleted')
    expect(text).toContain('or two days after you subscribe if that is later')
  })

  it('say content is shared only with the providers the Privacy policy names', () => {
    const text = render(<TermsPage />).container.textContent ?? ''
    expect(text).toContain('it is never sold, and it is shared only with the service providers')
    expect(text).not.toContain('is not sold or shared')
  })

  it('name the operator, and present no company or registration as complete', () => {
    const text = render(<TermsPage />).container.textContent ?? ''
    expect(text).toContain(`between you and ${brand.legalEntity}, who operates ${brand.name}`)
    expect(text).toContain(`${brand.name} is operated by ${brand.legalEntity}`)
    expect(text).not.toMatch(/\b(Labs|LLC|Inc\.?|DBA)\b/)
  })

  it('give contact by email, and publish no postal address', () => {
    const text = render(<TermsPage />).container.textContent ?? ''
    expect(text).toContain(brand.email.support)
    expect(text).toContain(brand.email.privacy)
    expect(text).toContain(`${brand.name} is operated by ${brand.legalEntity}. Last`)
  })
})
