// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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
})
