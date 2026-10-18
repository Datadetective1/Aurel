import { expect, test } from '@playwright/test'

/**
 * FRESH-ACCOUNT ACTIVATION
 * =============================================================================
 * The walkthrough that found the activation bugs, as a test:
 *
 *   sign in (confirmed, never onboarded) → one identity screen → Today →
 *   add a person → research resolves or offers recovery → create a meeting at a
 *   known local time with an objective → "Create and prepare" builds the brief
 *   → reload → title, participant, objective and 8:53 AM all unchanged.
 *
 * Needs an account that has confirmed its email and has NOT been onboarded:
 *   E2E_ACTIVATION_EMAIL, E2E_ACTIVATION_PASSWORD
 * and, usually, E2E_BASE_URL pointing at a preview deployment. Without them it
 * skips: production has email confirmation on, so an account cannot be minted
 * from inside the test, and a shared permanent test account would stop being
 * "fresh" after its first run.
 *
 * Not automated here: the Microsoft consent screen (a real Microsoft account
 * and a human). The return path it lands on is covered by unit tests.
 * =============================================================================
 */

const EMAIL = process.env.E2E_ACTIVATION_EMAIL
const PASSWORD = process.env.E2E_ACTIVATION_PASSWORD
const ZONE = 'America/Chicago'

test.skip(!EMAIL || !PASSWORD, 'Set E2E_ACTIVATION_EMAIL / E2E_ACTIVATION_PASSWORD')
test.use({ timezoneId: ZONE })
test.setTimeout(240_000)

/** Three days from now at 08:53, as a datetime-local value. */
function meetingTime(): string {
  const day = new Date(Date.now() + 3 * 86_400_000)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(day)
  return `${parts}T08:53`
}

test('a new user reaches a useful brief, and what they entered survives', async ({ page }) => {
  // 1. Sign in. A confirmed but un-onboarded account lands on the one
  //    identity screen.
  await page.goto('/sign-in')
  await page.getByLabel(/email/i).fill(EMAIL!)
  await page
    .getByLabel(/password/i)
    .first()
    .fill(PASSWORD!)
  await page
    .getByRole('button', { name: /sign in/i })
    .first()
    .click()
  await page.waitForURL(/\/onboarding/)

  // 2. Fast path: name and time zone, nothing else required.
  await page.getByLabel(/full name/i).fill('Activation Tester')
  await page.getByLabel(/timezone/i).selectOption(ZONE)
  await page.getByRole('button', { name: /continue to today/i }).click()

  // 3. Today, with the canonical sequence.
  await page.waitForURL(/\/today/)
  await expect(page.getByText(/prepare for one real conversation/i)).toBeVisible()
  await expect(page.getByRole('link', { name: /create a meeting manually/i }).first()).toBeVisible()

  // 4. (Calendar or manual) -- manual here. 6. Add a person.
  await page.goto('/people/new')
  await page.getByLabel(/full name/i).fill('Maya Chen')
  await page.getByLabel(/company/i).fill('Northwind Traders')
  await page.getByLabel(/role or title/i).fill('VP Engineering')
  await page.getByRole('button', { name: /add person/i }).click()
  await page.waitForURL(/\/people\/[0-9a-f-]{36}/)
  const personUrl = page.url()

  // 7. Research either resolves with citations or says it could not identify
  //    them and asks for one more detail. Never silence, never a guess.
  const research = page.getByRole('button', { name: /research public footprint/i })
  if (await research.isVisible().catch(() => false)) {
    await research.click()
    await expect(
      page
        .getByText(/reviewed \d+ sources?, used \d+/i)
        .or(page.getByText(/couldn.t confidently identify/i))
        .or(page.getByText(/temporarily unavailable|rate limit|research limit/i)),
    ).toBeVisible({ timeout: 120_000 })
  }

  // 8–9. A meeting at a known local time, with a non-empty objective.
  const objective =
    'Get approval to move two engineers onto the migration before the quarter closes.'
  await page.goto(`/meetings/new?person=${personUrl.split('/').pop()}`)
  await page.getByLabel(/what is the meeting/i).fill('Northwind Renewals')
  await page.getByLabel(/what do you need from it/i).fill(objective)
  await page.getByLabel(/^when/i).fill(meetingTime())
  await page.getByRole('button', { name: /create and prepare/i }).click()

  // 11–12. "Create and prepare" prepares: the brief is built on arrival, or an
  // honest, retryable error is shown -- not a "Generate brief" button.
  await page.waitForURL(/\/meetings\/[0-9a-f-]{36}\/brief/)
  await expect(
    page.getByText(/how to open|open with/i).or(page.getByRole('button', { name: /try again/i })),
  ).toBeVisible({ timeout: 120_000 })

  // 10 & 13. After a reload: title, participant, objective, and the time typed.
  await page.reload()
  await expect(page.getByRole('heading', { name: /northwind renewals/i })).toBeVisible()
  await expect(page.getByText('Maya Chen').first()).toBeVisible()
  await expect(page.getByText(objective).first()).toBeVisible()
  await expect(page.getByText(/8:53\s?AM/).first()).toBeVisible()
  await expect(page.getByText(/no objective recorded/i)).toHaveCount(0)
})
