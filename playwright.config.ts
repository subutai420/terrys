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
    // Stage 4: e-mails are saved to EMAIL_OUTBOX_DIR (no RESEND_API_KEY in tests); the shop copy
    // needs a recipient – a reserved test domain, never a real address.
    env: {
      ORDER_NOTIFICATION_EMAIL: process.env.ORDER_NOTIFICATION_EMAIL || 'objednavky@example.test',
      // Stage 5: never call Balíkobot from tests – the production server (`pnpm start` on CI)
      // would otherwise refuse to create shipments without credentials.
      BALIKOBOT_SIMULATION: '1',
    },
  },
})
