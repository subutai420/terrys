import { expect, test } from '@playwright/test'

/**
 * Stage 9 pre-launch checks on the running app (seed data):
 * - every sitemap URL answers 200 and is indexable; noindex pages are not in the sitemap,
 * - unknown pages give a real 404 with the shop's not-found page,
 * - GTM is not loaded without its env gate (tests run without GTM_* variables),
 * - security headers are sent, /api/health answers without personal data.
 */

test('sitemap pages are 200 and indexable, noindex pages are not listed', async ({ request }) => {
  test.setTimeout(180_000)
  const xml = await (await request.get('/sitemap.xml')).text()
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)
  expect(paths.length).toBeGreaterThan(5)
  for (const noindexPath of ['/kosik', '/objednavka', '/vyhledavani']) {
    expect(paths).not.toContain(noindexPath)
  }
  const problems: string[] = []
  for (const path of paths) {
    const response = await request.get(path, { maxRedirects: 0 })
    if (response.status() !== 200) {
      problems.push(`${path}: HTTP ${response.status()}`)
      continue
    }
    const html = await response.text()
    if (/<meta[^>]+name="robots"[^>]+noindex/i.test(html)) problems.push(`${path}: noindex`)
    if (!/<link[^>]+rel="canonical"/i.test(html)) problems.push(`${path}: no canonical`)
  }
  expect(problems).toEqual([])
})

test('noindex pages say so', async ({ request }) => {
  for (const path of ['/kosik', '/vyhledavani?q=steak']) {
    const html = await (await request.get(path)).text()
    expect(html, path).toMatch(/<meta[^>]+name="robots"[^>]+noindex/i)
  }
})

test('unknown page is a real 404 with the shop layout', async ({ page }) => {
  const response = await page.goto('/tato-stranka-neexistuje-xyz')
  expect(response?.status()).toBe(404)
  await expect(page.locator('header').first()).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('GTM is not loaded without the env gate; security headers are present', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  const response = await page.goto('/')
  const html = await response!.text()
  expect(html).not.toContain('googletagmanager.com/gtm.js')
  await page.waitForLoadState('networkidle')
  expect(requests.filter((url) => url.includes('googletagmanager.com'))).toEqual([])
  const headers = response!.headers()
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['x-frame-options']).toBe('SAMEORIGIN')
})

test('health endpoint answers with counts only', async ({ request }) => {
  const response = await request.get('/api/health')
  expect([200, 503]).toContain(response.status())
  const body = await response.json()
  expect(body.database.ok).toBe(true)
  // CI runs on a migrated database; local runs (pnpm dev) use a schema-pushed one.
  if (process.env.CI) expect(body.migrations.ok).toBe(true)
  expect(JSON.stringify(body)).not.toMatch(/@|postgres:\/\//)
  expect(response.headers()['cache-control']).toBe('no-store')
})

test('admin GDPR page: dry run of the retention anonymisation', async ({ browser }) => {
  // Same admin as the other admin e2e tests (CI seeds it from SEED_ADMIN_*).
  const email = process.env.E2E_ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL
  const password = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD
  test.skip(!email || !password, 'no admin credentials (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)')
  const context = await browser.newContext({ locale: 'cs-CZ' })
  const page = await context.newPage()
  await page.goto('/admin/login')
  await page.locator('input[name="email"]').fill(email!)
  await page.locator('input[name="password"]').fill(password!)
  await page.locator('button[type="submit"]').click()
  await expect(page).not.toHaveURL(/\/admin\/login/, { timeout: 30_000 })
  await page.goto('/admin/osobni-udaje')
  await expect(page.getByRole('heading', { name: 'Osobní údaje (GDPR)' })).toBeVisible()
  await page.getByLabel('Starší objednávky (doba uchování)').check()
  await page.getByRole('button', { name: 'Zkontrolovat (nic nemění)' }).click()
  await expect(page.getByTestId('privacy-result')).toContainText('Zkouška – zatím se nic nezměnilo.')
  await context.close()
})