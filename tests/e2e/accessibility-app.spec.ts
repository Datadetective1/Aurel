import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * ACCESSIBILITY — SIGNED IN
 * =============================================================================
 * The public pages are the easy half. Everything interaction-dense lives behind
 * the session: the assessment's paired radio groups, the evidence lists, the
 * settings rail, the command palette.
 *
 * Signing in needs an account, so this runs only when one is supplied:
 *
 *   E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e
 *
 * Without them it skips. A test that silently passes because it never ran is
 * worse than one that says why it did not.
 *
 * Use a throwaway account on a non-production database. This creates and
 * deletes demo data.
 * =============================================================================
 */

const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD

const APP_PAGES = [
  '/today',
  '/people',
  '/meetings',
  '/atlas',
  '/coach',
  '/prepare',
  '/settings',
  '/settings/appearance',
  '/settings/profile',
  '/settings/capabilities',
  '/settings/billing',
  '/settings/data',
]

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function signIn(page: Page) {
  await page.goto('/sign-in')
  await page.getByLabel(/email/i).fill(EMAIL!)
  await page.getByLabel(/password/i).fill(PASSWORD!)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/today|onboarding/, { timeout: 30_000 })
}

async function settle(page: Page) {
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState === 'finished'), null, {
      timeout: 5_000,
    })
    .catch(() => {})
}

function describe(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) {
  return violations
    .map((v) => {
      const nodes = v.nodes.slice(0, 3).map((n) => `      ${n.html.slice(0, 120)}`)
      return [`  [${v.impact}] ${v.id}: ${v.help}`, ...nodes].join('\n')
    })
    .join('\n')
}

test.describe('accessibility (signed in)', () => {
  test.skip(!EMAIL || !PASSWORD, 'Set E2E_EMAIL and E2E_PASSWORD to run these.')
  test.use({ reducedMotion: 'reduce' })
  // Serial: one sign-in, reused across the sweep.
  test.describe.configure({ mode: 'serial' })

  for (const theme of ['light', 'dark'] as const) {
    test(`the signed-in app has no WCAG A/AA violations in ${theme === 'light' ? 'Pearl' : 'Obsidian'}`, async ({
      page,
    }) => {
      test.setTimeout(180_000)
      await signIn(page)

      await page.evaluate((t) => localStorage.setItem('theme', t), theme)

      const failures: string[] = []

      for (const path of APP_PAGES) {
        await page.goto(path)
        await expect(page.locator('html')).toHaveClass(new RegExp(theme))
        await settle(page)

        const results = await new AxeBuilder({ page })
          .withTags(TAGS)
          .exclude('nextjs-portal')
          .analyze()

        if (results.violations.length > 0) {
          failures.push(`${path}\n${describe(results.violations)}`)
        }
      }

      expect(failures, `\n${failures.join('\n\n')}`).toEqual([])
    })
  }
})
