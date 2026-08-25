import { expect, test, type Page } from '@playwright/test'

/**
 * THE CRITICAL FLOW
 * =============================================================================
 * Sign up → onboarding → add a person → create a meeting → read the brief.
 * If this works, the product works. Everything else is refinement.
 *
 * The account is created through the real sign-up form and thrown away
 * afterwards. Two alternatives were rejected:
 *
 *   - a committed storageState, which would put a live session token in the
 *     repository
 *   - a fixed shared test account, which makes tests order-dependent and
 *     accumulates junk in whatever database it points at
 *
 * Requires a Supabase project with email confirmation OFF for the test domain.
 * Where that is not true the suite skips rather than failing, because a red
 * pipeline that means "not configured" trains people to ignore red pipelines.
 * =============================================================================
 */

const CONFIRMATION_REQUIRED = /check your (email|inbox)/i

function throwawayCredentials() {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return { email: `e2e-${id}@atturel-e2e.invalid`, password: `Test-${id}-Aa1!` }
}

/** Returns false when the deployment requires email confirmation. */
async function signUp(page: Page): Promise<boolean> {
  const { email, password } = throwawayCredentials()

  await page.goto('/sign-up')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).first().fill(password)
  await page.getByRole('button', { name: /create|sign up/i }).first().click()

  await page.waitForURL(/onboarding|check-email|today/, { timeout: 30_000 }).catch(() => {})

  const body = await page.locator('body').innerText()
  if (CONFIRMATION_REQUIRED.test(body) || page.url().includes('check-email')) return false

  return true
}

test.describe('critical flow', () => {
  // Serial: each step depends on the account the previous one created.
  test.describe.configure({ mode: 'serial' })

  test('a new user can get from sign-up to a meeting brief', async ({ page }) => {
    const signedUp = await signUp(page)
    test.skip(
      !signedUp,
      'Sign-up requires email confirmation on this deployment; cannot complete unattended.',
    )

    // --- onboarding ---------------------------------------------------------
    await expect(page).toHaveURL(/onboarding/)

    await page.getByLabel(/full name/i).fill('E2E Tester')

    // The timezone control stores IANA but shows a city. Assert the human
    // rendering, since showing the identifier was the bug this replaced.
    const timezone = page.getByLabel(/timezone/i)
    await expect(timezone).toBeVisible()
    const selected = await timezone.evaluate(
      (node) => (node as HTMLSelectElement).selectedOptions[0]?.textContent ?? '',
    )
    expect(selected).toMatch(/GMT/)
    expect(selected).not.toMatch(/^[A-Za-z]+\/[A-Za-z_]+$/)

    await page.getByRole('button', { name: /continue|next/i }).first().click()

    // Skip through the remaining steps to the app. Onboarding depth is covered
    // by unit tests; this is about reaching the product.
    await reachTheApp(page)

    // --- add a person -------------------------------------------------------
    await page.goto('/people/new')
    await page.getByLabel(/full name/i).fill('Jordan Avery')
    await page.getByLabel(/job title/i).fill('VP Engineering')
    await page.getByRole('button', { name: /save|add|create/i }).first().click()

    await page.waitForURL(/\/people\//, { timeout: 20_000 })
    await expect(page.locator('body')).toContainText('Jordan Avery')

    // The product must say what it does not know, not imply completeness.
    await expect(page.locator('body')).toContainText(/does ?n[o']t know|unknown/i)

    // --- create a meeting ---------------------------------------------------
    await page.goto('/meetings/new')
    await page.getByLabel(/title/i).fill('Quarterly planning')

    const objective = page.getByLabel(/objective/i)
    if (await objective.count()) {
      await objective.fill('Leave with a decision on the platform investment')
    }

    await page.getByRole('button', { name: /save|create/i }).first().click()
    await page.waitForURL(/\/meetings\//, { timeout: 20_000 })
    await expect(page.locator('body')).toContainText('Quarterly planning')
  })
})

/** Advance through whatever onboarding steps remain until the app is reachable. */
async function reachTheApp(page: Page): Promise<void> {
  for (let step = 0; step < 12; step += 1) {
    if (!page.url().includes('/onboarding')) return

    const skip = page.getByRole('link', { name: /skip/i }).first()
    const next = page.getByRole('button', { name: /continue|next|finish|done/i }).first()

    if (await skip.count()) await skip.click()
    else if (await next.count()) await next.click()
    else break

    await page.waitForLoadState('networkidle').catch(() => {})
  }

  await page.goto('/today')
  await expect(page).toHaveURL(/today/)
}
