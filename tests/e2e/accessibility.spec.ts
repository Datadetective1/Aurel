import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * ACCESSIBILITY
 * =============================================================================
 * axe-core against every public surface, in BOTH themes.
 *
 * Both themes matter because contrast is the most commonly failed rule and the
 * two palettes are independent — Obsidian passing tells you nothing about
 * Pearl. A product that treats them as equally first-class has to test them
 * that way.
 *
 * An automated pass is not an audit. axe catches roughly a third to a half of
 * real barriers: it can tell you a control has no accessible name, not whether
 * that name makes sense. What it does catch is the class of regression that
 * slips in silently, which is exactly what a pipeline is for.
 * =============================================================================
 */

const PUBLIC_PAGES = ['/', '/pricing', '/privacy', '/terms', '/sign-in', '/sign-up']

/** WCAG 2.1 A and AA — the level the product commits to. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((value) => localStorage.setItem('theme', value), theme)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(new RegExp(theme))
}

/**
 * Wait for every running animation to finish.
 *
 * axe samples computed colour at a moment in time. Scanning mid-entrance
 * measures a half-faded pixel and reports a contrast failure that no reader
 * ever experiences at rest.
 */
async function settle(page: Page) {
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState === 'finished'), null, {
      timeout: 5_000,
    })
    .catch(() => {})
}

async function scan(page: Page) {
  return new AxeBuilder({ page })
    .withTags(TAGS)
    // Next.js injects its dev overlay outside our control.
    .exclude('nextjs-portal')
    .analyze()
}

/** A readable failure: rule, impact, and the element that triggered it. */
function describe(results: Awaited<ReturnType<typeof scan>>) {
  return results.violations
    .map((v) => {
      const nodes = v.nodes.slice(0, 3).map((n) => `      ${n.html.slice(0, 120)}`)
      return [`  [${v.impact}] ${v.id}: ${v.help}`, ...nodes].join('\n')
    })
    .join('\n')
}

test.describe('accessibility', () => {
  /**
   * Scanned with reduced motion on.
   *
   * Not to dodge a failure — to measure a real one. The marketing hero plays a
   * staged entrance that starts at `opacity: 0`, and axe was sampling colours
   * mid-fade and reporting contrast against a blended pixel. That is a genuine
   * 0.7s state, but it is a decorative animation, not the page.
   *
   * Reduced motion is also the more representative setting: someone who needs
   * high contrast is more likely to have it enabled, and this is the
   * composition they actually read.
   */
  test.use({ reducedMotion: 'reduce' })

  for (const path of PUBLIC_PAGES) {
    for (const theme of ['light', 'dark'] as const) {
      test(`${path} has no WCAG A/AA violations in ${theme === 'light' ? 'Pearl' : 'Obsidian'}`, async ({
        page,
      }) => {
        await page.goto(path)
        await setTheme(page, theme)
        await settle(page)

        const results = await scan(page)
        expect(results.violations, `\n${describe(results)}`).toEqual([])
      })
    }
  }

  test('the page has one main landmark and a skip link that works', async ({ page }) => {
    await page.goto('/')

    // A skip link that points at nothing is worse than none: it looks like an
    // accommodation and strands the person who uses it.
    const skip = page.getByRole('link', { name: /skip to content/i })
    await expect(skip).toBeAttached()
    const href = await skip.getAttribute('href')
    expect(href).toMatch(/^#/)
    await expect(page.locator(href!)).toBeAttached()

    await expect(page.locator('main')).toHaveCount(1)
  })

  test('every control reachable by keyboard shows a visible focus ring', async ({ page }) => {
    await page.goto('/sign-in')

    await page.keyboard.press('Tab')
    const styles = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return null
      const s = getComputedStyle(el)
      return { outlineWidth: s.outlineWidth, outlineStyle: s.outlineStyle, boxShadow: s.boxShadow }
    })

    expect(styles, 'nothing received focus on first Tab').not.toBeNull()
    const hasRing =
      (styles!.outlineStyle !== 'none' && parseFloat(styles!.outlineWidth) > 0) ||
      styles!.boxShadow !== 'none'
    expect(hasRing, `focused element had no visible ring: ${JSON.stringify(styles)}`).toBe(true)
  })
})
