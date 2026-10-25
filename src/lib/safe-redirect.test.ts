import { describe, expect, it } from 'vitest'
import { safeRedirectPath, signedInDestination } from './safe-redirect'

describe('safeRedirectPath', () => {
  it('keeps a relative path on this site', () => {
    expect(safeRedirectPath('/settings/billing')).toBe('/settings/billing')
  })

  it('refuses anything that could leave the site', () => {
    for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', 'evil.com']) {
      expect(safeRedirectPath(bad)).toBe('/today')
    }
  })

  it('refuses whitespace and control characters, which the URL parser drops', () => {
    for (const bad of ['/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/ /evil.com', '/\u0000x']) {
      expect(safeRedirectPath(bad)).toBe('/today')
      expect(new URL(signedInDestination(bad), 'https://www.atturel.com').host).toBe(
        'www.atturel.com',
      )
    }
  })
})

describe('a signed-in visitor on the sign-in or sign-up screen', () => {
  it('goes on to Settings › Plan from the pricing page’s trial button', () => {
    expect(signedInDestination('/settings/billing')).toBe('/settings/billing')
  })

  it('goes to Today with no destination, or an unsafe one', () => {
    expect(signedInDestination(null)).toBe('/today')
    expect(signedInDestination('https://evil.com')).toBe('/today')
  })

  it('is never sent back to an auth screen, which would loop', () => {
    for (const loop of ['/sign-up', '/sign-in?next=/sign-in', '/sign-up/', '/sign-in#x']) {
      expect(signedInDestination(loop)).toBe('/today')
    }
    // A page whose name merely starts the same way is not an auth screen.
    expect(signedInDestination('/sign-ups-report')).toBe('/sign-ups-report')
  })
})
