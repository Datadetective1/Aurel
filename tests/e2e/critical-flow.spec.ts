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
 * Requires a Supabase project with email confirmation OFF. Where that is not
 * true the suite SKIPS rather than failing, because a red pipeline that means
 * "not configured" trains people to ignore red pipelines. It still fails
 * loudly on a real product bug — the two are told apart explicitly below.
 *
 * The flow itself has been walked end to end by hand against a confirmed
 * account; what is gated here is automating it, not whether it works.
 * =============================================================================
 */

const CONFIRMATION_REQUIRED = /check your (email|inbox)/i
// Supabase rejects the reserved .invalid TLD outright, so a syntactically
// ordinary domain is required even though nothing is ever delivered to it.
const TEST_DOMAIN = process.env.E2E_EMAIL_DOMAIN ?? 'atturel-e2e.example.com'

/**
 * Provider-level refusals, as distinct from a form validation error.
 * Matched against the product's own copy, not the provider's: Atturel
 * translates a 429 into "Too many attempts", which is right for a user and
 * meant this pattern missed it the first time.
 */
const PROVIDER_REFUSED =
  /could not create that account|too many attempts|rate limit|already registered/i

function throwawayCredentials() {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return { email: `e2e-${id}@${TEST_DOMAIN}`, password: `Test-${id}-Aa1!` }
}

/** Returns false when the deployment requires email confirmation. */
async function signUp(page: Page): Promise<boolean> {
  const { email, password } = throwawayCredentials()

  await page.goto('/sign-up')
  // Every required field, not just the credentials. Omitting the name left the
  // form in an invalid state that never submitted, and the wait below then ate
  // the entire test budget waiting for a navigation that could not happen.
  await page.getByLabel(/your name/i).fill('E2E Tester')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).first().fill(password)
  await page.getByRole('button', { name: /create account/i }).first().click()

  // Comfortably under the test timeout, so a failure here reports the real
  // reason rather than surfacing as "test timed out".
  await page
    .waitForURL(/onboarding|check-email|today/, { timeout: 15_000 })
    .catch(() => {})

  const body = await page.locator('body').innerText()

  if (CONFIRMATION_REQUIRED.test(body) || page.url().includes('check-email')) return false

  // Distinguish two very different failures. A provider refusal — confirmation
  // required, send rate limit, address rejected — is an environment condition
  // and must not turn the pipeline red. A form validation error is a real
  // product bug and must.
  if (page.url().includes('/sign-up')) {
    if (PROVIDER_REFUSED.test(body)) return false
    throw new Error(`Sign-up was rejected by the form: ${body.slice(0, 300)}`)
  }

  return true
}

test.describe('critical flow', () => {
  // Serial: each step depends on the account the previous one created.
  test.describe.configure({ mode: 'serial' })

  test('a new user can get from sign-up to a meeting brief', async ({ page }) => {
    // Sign-up, onboarding, a person and a meeting is a lot of round trips for
    // the default 30s.
    test.setTimeout(120_000)

    const signedUp = await signUp(page)
    test.skip(
      !signedUp,
      'Unattended sign-up is unavailable here — the project requires email ' +
        'confirmation. See docs/HUMAN_ACTIONS.md; this needs a deliberate ' +
        'decision about the auth settings for this project, not a test change.',
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

    // The unprepared brief, on a phone. This is a pilot's FIRST session: the
    // meeting exists, no brief has been generated, and the participant picker
    // is on screen. Its <select> takes its width from the longest person in the
    // account -- "Name — Job Title · Organisation" -- and the row holding it is
    // a grid item, so without min-w-0 it refused to shrink and took the whole
    // page sideways. Measured at 375px: scrollWidth 515 against a 375 viewport.
    //
    // Checked here rather than in a signed-in sweep because this is the only
    // place in the suite that reliably HAS an unprepared meeting.
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 800 })
      await page.waitForTimeout(250)
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      )
      expect(overflows, `the unprepared brief scrolls sideways at ${width}px`).toBe(false)
    }
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
