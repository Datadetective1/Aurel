// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { brand } from '@/lib/brand'

vi.mock('@/components/theme-provider', () => ({ ThemeToggle: () => null }))
vi.mock('@/components/marketing/compact-header', () => ({ CompactHeader: () => null }))

const { default: MarketingLayout } = await import('./layout')

/**
 * THE SITE FOOTER CARRIES THE BRAND
 * =============================================================================
 * The copyright line names the brand, not the person who operates it. The
 * operator is identified where it matters legally: inside Terms and Privacy.
 * =============================================================================
 */

afterEach(cleanup)

describe('the marketing footer', () => {
  it('reads "© 2026 <brand>. All rights reserved." and does not name the operator', () => {
    const footer = render(<MarketingLayout>page</MarketingLayout>).container.querySelector('footer')
    const text = footer?.textContent ?? ''
    expect(text).toContain(`© 2026 ${brand.name}. All rights reserved.`)
    expect(text).not.toContain(brand.legalEntity)
  })
})
