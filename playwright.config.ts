import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end configuration.
 *
 * Runs against a real build by default. `npm run dev` is faster to iterate
 * against, but a production build is where prerendering, Suspense boundaries
 * and environment validation actually get exercised — and every one of those
 * has broken this project at least once while the dev server stayed green.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100)
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // A committed `.only` should fail the pipeline rather than quietly shrink it.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Mobile is a first-class target, not an afterthought: the product is
    // opened on a phone in the ten minutes before a meeting.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npm run start -- --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
})
