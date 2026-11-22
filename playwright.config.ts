import { defineConfig, devices } from '@playwright/test'
import 'dotenv/config'

const PORT = 3000
const baseURL = `http://localhost:${PORT}`

/**
 * Browser (end-to-end) tests. See https://playwright.dev/docs/test-configuration
 *
 * Playwright starts the app automatically:
 * - locally: `pnpm dev` (or reuses a dev server you already have running),
 * - on CI:   `pnpm start` (the production build created by `pnpm build`).
 * The database must be running in both cases.
 */
export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL,
    locale: 'cs-CZ',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: process.env.CI ? 'pnpm start' : 'pnpm dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
