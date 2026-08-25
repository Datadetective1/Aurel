import { expect, test } from '@playwright/test'

/**
 * PUBLIC SURFACE
 * =============================================================================
 * Everything reachable without an account. These need no credentials, so they
 * run everywhere — including on a fork with no Supabase project of its own.
 *
 * The assertions are about behaviour that has actually broken: prerendering a
 * page that reads search params, redirect guards on private routes, and theme
 * switching in a product where both themes are first-class.
 * =============================================================================
 */

test.describe('marketing', () => {
  test('the landing page states what the product does', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Atturel/)
    // The former codename must never reach a rendered page.
    await expect(page.locator('body')).not.toContainText(/\bAurel\b/i)
  })

  test('pricing is reachable and names every plan', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page.getByText('Free', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('Pro', { exact: false }).first()).toBeVisible()
  })

  test('the policies say plainly that they await legal review', async ({ page }) => {
    for (const path of ['/privacy', '/terms']) {
      await page.goto(path)
      // The exact wording may change; the disclosure must not disappear.
      await expect(page.locator('body')).toContainText(
        /not (yet )?(been )?reviewed by a lawyer|awaiting legal review/i,
      )
    }
  })
})

test.describe('auth', () => {
  test('sign-up prerenders even though it reads search params', async ({ page }) => {
    // A missing Suspense boundary here broke the production build once; a dev
    // server will not catch it.
    const response = await page.goto('/sign-up?plan=pro')
    expect(response?.status()).toBeLessThan(400)
    await expect(page.getByRole('button', { name: /create|sign up/i }).first()).toBeVisible()
  })

  test('password recovery is reachable from sign-in', async ({ page }) => {
    await page.goto('/sign-in')
    await page.getByRole('link', { name: /forgot/i }).click()
    await expect(page).toHaveURL(/forgot-password/)
  })
})

test.describe('route protection', () => {
  // Every private surface, not a representative sample: a guard is easy to add
  // to a new route and easy to forget.
  const privateRoutes = [
    '/today',
    '/people',
    '/meetings',
    '/atlas',
    '/coach',
    '/prepare',
    '/settings',
    '/settings/billing',
    '/settings/data',
  ]

  for (const route of privateRoutes) {
    test(`${route} redirects a signed-out visitor to sign-in`, async ({ page }) => {
      await page.goto(route)
      await expect(page).toHaveURL(/sign-in/)
    })
  }
})

test.describe('development-only surfaces', () => {
  test('the email preview is not reachable on a production build', async ({ page }) => {
    // Asserts the property that matters — the preview is not served — rather
    // than a particular status code. It is blocked twice over: middleware
    // redirects an unauthenticated visitor to sign-in, and the handler itself
    // returns 404 when NODE_ENV is production. Pinning one specific mechanism
    // would make this test fail the next time the other one does the work.
    await page.goto('/dev/emails')
    await expect(page.locator('body')).not.toContainText('Email preview')
    await expect(page.locator('body')).not.toContainText('meeting-reminder')
  })
})

test.describe('themes', () => {
  test('both Pearl and Obsidian render, neither is a degraded fallback', async ({ page }) => {
    // Driven through the stored preference and a reload rather than by poking
    // the class directly: next-themes reapplies its own class on hydration, so
    // a direct DOM edit races the framework and reports a false failure.
    const backgroundFor = async (theme: 'light' | 'dark') => {
      await page.goto('/')
      await page.evaluate((value) => localStorage.setItem('theme', value), theme)
      await page.reload()
      await expect(page.locator('html')).toHaveClass(new RegExp(theme))
      return page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    }

    const pearl = await backgroundFor('light')
    const obsidian = await backgroundFor('dark')

    expect(pearl).not.toBe(obsidian)
    // Neither may be transparent: a page with no painted ground borrows
    // whatever is behind it, which is how a theme ends up half-applied.
    expect(pearl).not.toMatch(/rgba\(0, 0, 0, 0\)/)
    expect(obsidian).not.toMatch(/rgba\(0, 0, 0, 0\)/)
  })
})

test.describe('responsive', () => {
  test('no page scrolls horizontally on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })

    for (const path of ['/', '/pricing', '/sign-in', '/privacy']) {
      await page.goto(path)
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      )
      expect(overflows, `${path} overflows horizontally at 360px`).toBe(false)
    }
  })
})
