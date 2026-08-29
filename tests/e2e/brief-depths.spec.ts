import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * THE GRADUATED BRIEF
 * =============================================================================
 * One brief, three depths: what you need, sixty seconds, everything.
 *
 * The thing worth testing is not that each page renders — it is that a person
 * with seven minutes can get from Today to the shortest useful view and back
 * out again, in either theme, on a phone, without the page scrolling sideways
 * or the heading outline collapsing.
 *
 * Needs a signed-in account that already has a meeting with a brief on it:
 *
 *   E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e -- brief-depths
 *
 * Without them it skips, and where the account has no prepared meeting it says
 * so out loud rather than passing green on nothing — see the note in
 * accessibility-app.spec about tests that never ran.
 * =============================================================================
 */

const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function signIn(page: Page) {
  await page.goto('/sign-in')
  await page.getByLabel(/email/i).fill(EMAIL!)
  await page.getByLabel(/password/i).fill(PASSWORD!)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/today|onboarding/, { timeout: 30_000 })
}

/**
 * A meeting id that actually has a brief behind it.
 *
 * Discovered by asking for the glance: it redirects to /brief when no artifact
 * exists, which is the same check the page itself makes and so cannot drift
 * away from it.
 */
async function meetingWithBrief(page: Page): Promise<string | null> {
  await page.goto('/meetings')
  const hrefs = await page.locator('a[href^="/meetings/"]').evaluateAll((links) =>
    links.map((l) => l.getAttribute('href') ?? ''),
  )
  const ids = [
    ...new Set(
      hrefs.flatMap((href) => href.match(/^\/meetings\/([0-9a-f-]{36})(?:\/|$)/)?.[1] ?? []),
    ),
  ]

  for (const id of ids) {
    await page.goto(`/meetings/${id}/glance`)
    if (new URL(page.url()).pathname === `/meetings/${id}/glance`) return id
  }
  return null
}

async function settle(page: Page) {
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState === 'finished'), null, {
      timeout: 5_000,
    })
    .catch(() => {})
}

function describeViolations(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) {
  return violations
    .map((v) => {
      const nodes = v.nodes.slice(0, 3).map((n) => `      ${n.html.slice(0, 120)}`)
      return [`  [${v.impact}] ${v.id}: ${v.help}`, ...nodes].join('\n')
    })
    .join('\n')
}

test.describe('graduated brief', () => {
  test.skip(!EMAIL || !PASSWORD, 'Set E2E_EMAIL and E2E_PASSWORD to run these.')
  test.use({ reducedMotion: 'reduce' })
  test.describe.configure({ mode: 'serial' })

  test('the three depths are reachable from one another', async ({ page }) => {
    test.setTimeout(120_000)
    await signIn(page)

    const id = await meetingWithBrief(page)
    test.skip(!id, 'This account has no meeting with a brief on it.')

    const rail = page.getByRole('navigation', { name: /how much of the brief/i })

    // Glance: the rail knows where it is.
    await page.goto(`/meetings/${id}/glance`)
    await expect(rail.getByRole('link', { name: 'What you need' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    // Glance -> sixty seconds, by the primary action rather than the rail, so
    // the forward path a thumb takes is the one under test.
    await page.getByRole('link', { name: /sixty seconds/i }).first().click()
    await page.waitForURL(`**/meetings/${id}/quick`)
    await expect(rail.getByRole('link', { name: 'Sixty seconds' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    // Sixty seconds -> everything.
    await page.getByRole('link', { name: /^everything$/i }).first().click()
    await page.waitForURL(`**/meetings/${id}/brief`)
    await expect(rail.getByRole('link', { name: 'Everything' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    // And back to the shortest view from the deepest one.
    await rail.getByRole('link', { name: 'What you need' }).click()
    await page.waitForURL(`**/meetings/${id}/glance`)
  })

  test('the glance answers who, why and what to say first', async ({ page }) => {
    await signIn(page)
    const id = await meetingWithBrief(page)
    test.skip(!id, 'This account has no meeting with a brief on it.')

    await page.goto(`/meetings/${id}/glance`)

    // The success criterion, as far as a machine can check it: the three
    // things a person must be able to name are on the screen and labelled.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const labels = page.locator('h2')
    await expect(labels.filter({ hasText: /in the room|you want|open with/i })).not.toHaveCount(0)

    // And the depth rail is above the fold, not at the end of a scroll.
    await expect(
      page.getByRole('navigation', { name: /how much of the brief/i }),
    ).toBeInViewport()
  })

  test('the glance hydrates without React throwing the markup away', async ({ page }) => {
    // The countdown is the only label on these pages that differs between the
    // server's clock and the reader's, so it is the only place a hydration
    // mismatch can come from. #418 lands in the console, never under a cursor.
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })

    await signIn(page)
    const id = await meetingWithBrief(page)
    test.skip(!id, 'This account has no meeting with a brief on it.')

    await page.goto(`/meetings/${id}/glance`)
    await settle(page)
    await page.waitForTimeout(1_000)

    const hydration = errors.filter((e) => /hydrat|#418|#423|did not match/i.test(e))
    expect(hydration, hydration.join('\n')).toEqual([])
  })

  test('the deep brief has a heading outline that does not skip a level', async ({ page }) => {
    await signIn(page)
    const id = await meetingWithBrief(page)
    test.skip(!id, 'This account has no meeting with a brief on it.')

    await page.goto(`/meetings/${id}/brief`)

    const levels = await page
      .locator('h1, h2, h3, h4')
      .evaluateAll((nodes) => nodes.map((n) => Number(n.tagName.slice(1))))

    expect(levels[0], 'the page should open on its h1').toBe(1)

    const skips: string[] = []
    for (let i = 1; i < levels.length; i += 1) {
      if (levels[i]! - levels[i - 1]! > 1) skips.push(`h${levels[i - 1]} -> h${levels[i]}`)
    }
    expect(skips, `Skipped heading levels: ${skips.join(', ')}`).toEqual([])
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`every depth is clean in ${theme === 'light' ? 'Pearl' : 'Obsidian'}`, async ({ page }) => {
      test.setTimeout(180_000)
      await signIn(page)

      const id = await meetingWithBrief(page)
      test.skip(!id, 'This account has no meeting with a brief on it.')

      await page.evaluate((t) => localStorage.setItem('theme', t), theme)

      const failures: string[] = []
      const overflowing: string[] = []
      const checkOverflow = test.info().project.name === 'mobile'

      for (const path of [
        `/meetings/${id}/glance`,
        `/meetings/${id}/quick`,
        `/meetings/${id}/brief`,
      ]) {
        await page.goto(path)
        await expect(page.locator('html')).toHaveClass(new RegExp(theme))
        await settle(page)

        const results = await new AxeBuilder({ page })
          .withTags(TAGS)
          .exclude('nextjs-portal')
          .analyze()
        if (results.violations.length > 0) {
          failures.push(`${path}\n${describeViolations(results.violations)}`)
        }

        if (checkOverflow) {
          // Every width the product is actually read at, not just the one the
          // device profile happens to set.
          for (const width of [320, 375, 768, 1280]) {
            await page.setViewportSize({ width, height: 800 })
            await settle(page)
            const overflows = await page.evaluate(
              () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            )
            if (overflows) overflowing.push(`${path} @ ${width}`)
          }
          await page.setViewportSize({ width: 375, height: 800 })
        }
      }

      expect(overflowing.join(', '), 'Scrolling sideways').toBe('')
      expect(failures, `\n${failures.join('\n\n')}`).toEqual([])
    })
  }

  test('Today points at the shortest view when a meeting is close', async ({ page }) => {
    await signIn(page)
    await page.goto('/today')

    const card = page.getByRole('region', { name: /.+/ }).filter({
      has: page.getByRole('link', { name: /what you need|prepare/i }),
    })

    // Nothing imminent is the normal state of an account, so this reports
    // rather than fails. A red result here would mean "no meeting today",
    // which is not a defect.
    if ((await card.count()) === 0) {
      console.log('  no meeting within the countdown window - card not asserted')
      return
    }

    const action = card.first().getByRole('link', { name: /what you need|prepare/i })
    await expect(action).toBeVisible()
    // 44px, so it is usable with a thumb.
    const box = await action.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })
})
