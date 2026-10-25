// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import PricingPage from './page'

/**
 * THE PRICING PAGE
 * =============================================================================
 * Free and Pro at $29 a month, the 14-day trial with no card, and the actual
 * allowances -- read from the plans the paywall enforces. Only shipped
 * capabilities; no Teams offer and no annual price (owner decisions,
 * 25 Oct 2026).
 * =============================================================================
 */

afterEach(cleanup)

describe('the pricing page', () => {
  it('shows Free and Pro at $29 a month, and nothing else to buy', () => {
    const { container } = render(<PricingPage />)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(
      expect.arrayContaining(['Free', 'Pro']),
    )
    expect(screen.getByText('$29')).toBeTruthy()
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/Teams|Talk to us|per seat/)
    expect(text).not.toMatch(/\$290|annual|yearly|per year/i)
  })

  it('states the trial: 14 days, no card, back to Free unless you subscribe, nothing deleted', () => {
    render(<PricingPage />)
    expect(
      screen.getByText(
        /Try Pro free for 14 days, no card: it returns to Free unless you subscribe, and nothing is deleted\./,
      ),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: /Start your 14-day trial/ }).getAttribute('href')).toBe(
      '/sign-up',
    )
    expect(screen.getByText('How does the Pro trial work?')).toBeTruthy()
    expect(
      screen.getByText('If I subscribe during the trial, do I lose the rest of it?'),
    ).toBeTruthy()
  })

  it('leads Pro with preparation, relationship memory and follow-through', () => {
    render(<PricingPage />)
    expect(
      screen.getByText(
        'Preparation, relationship memory and follow-through for everyone you work with.',
      ),
    ).toBeTruthy()
  })

  it('lists the actual allowances, as enforced', () => {
    render(<PricingPage />)
    const table = within(screen.getByRole('table'))
    const cells = (label: string) =>
      Array.from(
        table.getByRole('rowheader', { name: label }).parentElement!.querySelectorAll('td'),
      ).map((td) => td.textContent)
    expect(cells('Active people')).toEqual(['5', 'Unlimited'])
    expect(cells('AI meeting briefs a month')).toEqual(['3', '150'])
    expect(cells('Voice transcription a month')).toEqual(['60 min', '600 min'])
    expect(cells('Relationship Atlas')).toEqual(['—', 'Included'])
  })

  it('advertises nothing that has not shipped', () => {
    const { container } = render(<PricingPage />)
    expect(container.textContent).not.toMatch(/deep research|weekly intelligence|advanced memory/i)
  })

  it('says privacy, evidence, corrections and export are on every plan', () => {
    render(<PricingPage />)
    expect(screen.getByText(/On every plan: your record is private to your account/)).toBeTruthy()
  })
})
