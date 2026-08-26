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
  '/people/new',
]

/**
 * Pages that need a real record to exist.
 *
 * These were left out originally because they need an id, which meant the
 * person page and both of its forms -- the most interaction-dense screens in
 * the product, and the ones most likely to carry a violation -- were the only
 * ones never checked. The id is discovered at runtime from /people instead.
 */
const PERSON_PAGES = (id: string) => [`/people/${id}`, `/people/${id}/edit`, `/people/${id}/log`]

/** The first person's id, or null when the account has none. */
async function firstPersonId(page: Page): Promise<string | null> {
  await page.goto('/people')
  // An explicit timeout, because there may be no people at all. Playwright's
  // default action timeout is unbounded, so on an empty account this waited on
  // a locator that would never match until the whole test timed out -- and the
  // catch never fired, because nothing ever rejected. Earlier runs passed only
  // because those accounts happened to have people in them.
  const href = await page
    .locator('a[href^="/people/"]')
    .filter({ hasNotText: /add|new/i })
    .first()
    .getAttribute('href', { timeout: 5_000 })
    .catch(() => null)

  const match = href?.match(/^\/people\/([0-9a-f-]{36})$/)
  return match?.[1] ?? null
}

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
      // Sixteen pages, axe on each, in two themes and two viewports. It is a
      // thorough sweep rather than a unit test, and it outgrew three minutes
      // once the overflow check joined it -- the pages themselves are fast.
      test.setTimeout(360_000)
      await signIn(page)

      await page.evaluate((t) => localStorage.setItem('theme', t), theme)

      const failures: string[] = []

      // A person page and its forms, when the account has anyone recorded.
      const personId = await firstPersonId(page)
      const paths = personId ? [...APP_PAGES, ...PERSON_PAGES(personId)] : APP_PAGES

      // Say so when the person pages were skipped. Without this the sweep
      // passes just as green on an account with nobody in it, and the pages
      // most likely to carry a violation are the ones silently not checked.
      console.log(
        personId
          ? `  sweeping ${paths.length} pages (person pages included)`
          : `  sweeping ${paths.length} pages - PERSON PAGES SKIPPED, the account has nobody recorded`,
      )

      const overflowing: string[] = []
      // Nothing may scroll sideways on a phone. Checked in the same pass as
      // axe rather than a second one: re-navigating every page doubled the
      // sweep and pushed it past its timeout.
      const checkOverflow = test.info().project.name === 'mobile'
      for (const path of paths) {
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

        if (checkOverflow) {
          const overflows = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          )
          if (overflows) overflowing.push(path)
        }
      }

      expect(overflowing.join(', '), 'Pages scrolling sideways on a phone').toBe('')

      expect(failures, `\n${failures.join('\n\n')}`).toEqual([])
    })
  }
})
