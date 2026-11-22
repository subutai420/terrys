import { randomBytes } from 'crypto'
import { mkdir, readdir, readFile } from 'fs/promises'
import path from 'path'

import { type APIRequestContext, type Browser, expect, type Page, test } from '@playwright/test'
import pg from 'pg'

/**
 * Stage 5 – the whole fulfilment of a courier order on the data of `pnpm seed`:
 * customer places an order in the storefront (phone) → butcher weighs it on a tablet →
 * staff types the invoice number, deducts a gift voucher, confirms the final price, creates a
 * SIMULATED Balíkobot shipment and marks the order shipped → the final-price and the "on the
 * way" e-mails exist in the outbox, statuses are right.
 *
 * Users: on an empty database the test registers the first admin itself; otherwise it needs
 * E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (or SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD). It then
 * creates its own butcher and staff accounts with random passwords.
 *
 * SCREENSHOTS=1 also saves the screenshots of docs/screenshots/etapa-5 (README).
 */

const PRODUCT = '/produkty/argentinsky-hovezi-rib-eye-detail-406'
const MIN_FILL_MS = 3_500
const SHOTS = process.env.SCREENSHOTS === '1'
const SHOT_DIR = path.resolve('docs/screenshots/etapa-5')
const TABLET = { width: 768, height: 1024 }
const PHONE = { width: 390, height: 844 }

async function query<T>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.end()
  }
}

async function outbox(orderNumber: string) {
  const dir = path.resolve(process.env.EMAIL_OUTBOX_DIR || '.emails')
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.json'))
  const result: { subject: string; html: string }[] = []
  for (const file of files) {
    const meta = JSON.parse(await readFile(path.join(dir, file), 'utf8'))
    if (String(meta.subject).includes(orderNumber)) {
      result.push({ subject: meta.subject, html: path.join(dir, file.replace(/\.json$/, '.html')) })
    }
  }
  return result
}

async function shot(page: Page, name: string, fullPage = true) {
  if (!SHOTS) return
  await mkdir(SHOT_DIR, { recursive: true })
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage })
}

type Account = { email: string; password: string }

async function adminAccount(request: APIRequestContext): Promise<Account | null> {
  const init = await (await request.get('/api/users/init')).json()
  if (!init.initialized) {
    const account = {
      email: `e2e-admin-${Date.now()}@example.test`,
      password: randomBytes(18).toString('hex'),
    }
    const res = await request.post('/api/users/first-register', {
      data: { ...account, role: 'admin' },
    })
    expect(res.ok()).toBe(true)
    return account
  }
  const email = process.env.E2E_ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL
  const password = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD
  return email && password ? { email, password } : null
}

async function createAccount(
  request: APIRequestContext,
  admin: Account,
  role: 'staff' | 'butcher',
) {
  const login = await (await request.post('/api/users/login', { data: admin })).json()
  const account = {
    email: `e2e-${role}-${Date.now()}@example.test`,
    password: randomBytes(18).toString('hex'),
  }
  const res = await request.post('/api/users', {
    data: { ...account, role },
    headers: { Authorization: `JWT ${login.token}` },
  })
  expect(res.ok()).toBe(true)
  return account
}

async function login(
  browser: Browser,
  account: Account,
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({ viewport, locale: 'cs-CZ' })
  const page = await context.newPage()
  await page.goto('/admin/login')
  await page.locator('input[name="email"]').fill(account.email)
  await page.locator('input[name="password"]').fill(account.password)
  await page.locator('button[type="submit"]').click()
  await expect(page).not.toHaveURL(/\/admin\/login/, { timeout: 30_000 })
  return page
}

async function placeCourierOrder(page: Page): Promise<string> {
  await page.goto(PRODUCT)
  await page
    .locator('label', { hasText: /^500 g$/ })
    .first()
    .click()
  await page.getByTestId('add-to-cart').first().click()
  await expect(page.getByTestId('cart-count')).not.toHaveText('0')
  await page.goto('/kosik')
  await page.getByTestId('postcode-input').fill('602 00')
  await page.getByTestId('postcode-submit').click()
  await page.locator('label', { hasText: /Kurýr/ }).first().click()
  await expect(page.getByTestId('date-option').first()).toBeChecked()
  await page.getByTestId('cart-continue').click()
  const loadedAt = Date.now()
  await page.locator('#f-customer-firstName').fill('Jana')
  await page.locator('#f-customer-lastName').fill('Expediční')
  await page.locator('#f-customer-email').fill('e2e-expedice@example.test')
  await page.locator('#f-customer-phone').fill('602 123 456')
  await page.locator('#f-address-street').fill('Masarykova 12')
  await page.locator('#f-address-city').fill('Brno')
  await page.getByTestId('consent-terms').check()
  await page.waitForTimeout(Math.max(0, MIN_FILL_MS - (Date.now() - loadedAt)))
  await page.getByTestId('place-order').click()
  // Stage 6 strips the token from the address bar right after the page loads.
  await expect(page).toHaveURL(/\/objednavka\/dekujeme/)
  await expect(page.getByTestId('order-number')).toBeVisible()
  return ((await page.getByTestId('order-number').textContent()) ?? '').trim()
}

test.describe('Fulfilment (stage 5)', () => {
  test.setTimeout(240_000)

  test('fulfilment endpoints and screens are closed to anonymous visitors', async ({
    request,
    page,
  }) => {
    expect((await request.post('/api/fulfilment/orders/1/weigh', { data: {} })).status()).toBe(401)
    expect((await request.get('/api/fulfilment/print/production?date=2026-11-25')).status()).toBe(
      401,
    )
    expect((await request.get('/api/order-audit-log')).status()).toBe(403)
    await page.goto('/admin/expedice')
    // login (or "create first user" on an empty database)
    await expect(page).toHaveURL(/\/admin\/(login|create-first-user)/)
  })

  test('courier order: storefront → butcher weighs (tablet) → staff bills, ships (simulation) → e-mails', async ({
    browser,
    request,
  }) => {
    const admin = await adminAccount(request)
    test.skip(!admin, 'Database has users – set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD.')
    const butcher = await createAccount(request, admin!, 'butcher')
    const staff = await createAccount(request, admin!, 'staff')

    // 1) Customer (phone).
    const customer = await (
      await browser.newContext({ viewport: PHONE, locale: 'cs-CZ' })
    ).newPage()
    const orderNumber = await placeCourierOrder(customer)
    const [row] = await query<{ id: number; scheduled_date: string }>(
      'select id, scheduled_date from orders where order_number = $1',
      [orderNumber],
    )
    const { id, scheduled_date: date } = row

    // 2) Butcher on a tablet: Expedice → Vážit → weight → Hotovo.
    const b = await login(browser, butcher, TABLET)
    await b.goto(`/admin/expedice?date=${date}`)
    const card = b.locator(`[data-testid="expedice-order"][data-order="${orderNumber}"]`)
    await expect(card).toBeVisible()
    await shot(b, 'expedice-tablet-reznik', false)
    await card.getByTestId('action-weigh').click()
    await expect(b.getByTestId('weigh-title')).toContainText(orderNumber)
    await expect(b.getByTestId('weigh-done')).toBeDisabled()
    // 990 Kč/kg; 500 g ordered; 640 g is +28 % → over tolerance, needs a reason.
    // (retry: typing before React hydrated the page would be lost)
    await expect(async () => {
      await b.getByTestId('weigh-input').first().fill('640')
      await expect(b.getByTestId('weigh-tolerance')).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 30_000 })
    await expect(b.getByTestId('weigh-line-price').first()).toHaveText(/634\sKč/)
    await expect(b.getByTestId('weigh-done')).toBeDisabled()
    await shot(b, 'vazeni-tablet-odchylka')
    await b.getByTestId('weigh-input').first().fill('523')
    await expect(b.getByTestId('weigh-tolerance')).toHaveCount(0)
    await expect(b.getByTestId('weigh-line-price').first()).toHaveText(/518\sKč/)
    await expect(b.getByTestId('weigh-line-deviation').first()).toContainText('+5 %')
    await shot(b, 'vazeni-tablet')
    if (SHOTS) {
      await b.setViewportSize(PHONE)
      await shot(b, 'vazeni-telefon', false)
      await b.setViewportSize(TABLET)
    }
    await b.getByTestId('weigh-done').click()
    await expect(b).toHaveURL(/\/admin\/expedice/)
    const [afterWeigh] = await query<{ status: string; amount_due: string }>(
      'select status, amount_due from orders where id = $1',
      [id],
    )
    expect(afterWeigh.status).toBe('weighed')
    // 518 + 229 delivery
    expect(Number(afterWeigh.amount_due)).toBe(747)
    // The butcher has no billing screen.
    await b.goto(`/admin/vyrizeni/${id}`)
    await expect(b.getByText('Vyřízení objednávky dělá obsluha.')).toBeVisible()

    // 3) Staff on a desktop: invoice number, voucher, confirm, shipment, shipped.
    const s = await login(browser, staff, { width: 1280, height: 900 })
    await s.goto(`/admin/vyrizeni/${id}`)
    await expect(s.getByTestId('fulfil-total-final')).toHaveText(/747\sKč/)
    const invoice = `2026${String(Date.now()).slice(-6)}`
    await expect(async () => {
      await s.getByTestId('invoice-number').fill(invoice)
      await expect(s.getByTestId('invoice-number')).toHaveValue(invoice, { timeout: 1_000 })
      await s.getByTestId('voucher-add').click()
      await expect(s.getByTestId('voucher-code')).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 30_000 })
    await s.getByTestId('voucher-code').fill('DAREK-E2E')
    await s.getByTestId('voucher-amount').fill('200')
    await expect(s.getByTestId('amount-due')).toHaveText(/547\sKč/)
    await s.getByTestId('billing-finalise').click()
    await expect(s.getByText('✓ Vyúčtování potvrzeno.')).toBeVisible({ timeout: 20_000 })
    await shot(s, 'vyrizeni-vyuctovani')
    await s.getByTestId('shipment-create').click()
    await expect(s.getByTestId('tracking-number')).toHaveText(/^SIM\d+/, { timeout: 20_000 })
    // (from the page: Payload accepts the session cookie only from the browser – CSRF check)
    const labelType = await s.evaluate(
      async (orderId) =>
        (await fetch(`/api/fulfilment/orders/${orderId}/label`)).headers.get('content-type'),
      id,
    )
    expect(labelType).toContain('application/pdf')
    await s.getByTestId('status-shipped').click()
    await expect(s.getByTestId('fulfil-title').locator('..').getByTestId('status-pill')).toHaveText(
      'Odesláno',
      { timeout: 20_000 },
    )
    await shot(s, 'vyrizeni-odeslano')

    const [final] = await query<Record<string, unknown>>(
      'select status, invoice_number, amount_due, totals_total_final, totals_voucher_total, tracking_number, shipment_provider, shipment_handed_over_at from orders where id = $1',
      [id],
    )
    expect(final).toMatchObject({
      status: 'shipped',
      invoice_number: invoice,
      shipment_provider: 'simulation',
    })
    expect(Number(final.totals_total_final)).toBe(747) // the voucher is a payment, not a discount
    expect(Number(final.totals_voucher_total)).toBe(200)
    expect(Number(final.amount_due)).toBe(547)
    expect(final.shipment_handed_over_at).toBeTruthy() // "→ Odesláno" hands the parcel to the carrier
    const audit = await query<{ field: string; user_email: string }>(
      'select field, user_email from order_audit_log where order_id = $1',
      [id],
    )
    expect(audit.some((a) => a.field.includes('hmotnost') && a.user_email === butcher.email)).toBe(
      true,
    )
    expect(audit.some((a) => a.field === 'Číslo faktury' && a.user_email === staff.email)).toBe(
      true,
    )

    // 4) E-mails: confirmation (stage 4), final price, on the way – each exactly once.
    await expect
      .poll(
        async () => (await outbox(orderNumber)).some((m) => m.subject.includes('je na cestě')),
        { timeout: 10_000 },
      )
      .toBe(true)
    const mails = await outbox(orderNumber)
    expect(mails.filter((m) => m.subject.includes('Přijali jsme'))).toHaveLength(1)
    expect(mails.filter((m) => m.subject.includes('je zvážená'))).toHaveLength(1)
    expect(mails.filter((m) => m.subject.includes('je na cestě'))).toHaveLength(1)

    if (SHOTS) {
      // Expedice (desktop, light + dark), production sheet as PDF, the two e-mails.
      await s.goto(`/admin/expedice?date=${date}`)
      await shot(s, 'expedice')
      const theme = (value: 'dark' | 'light') =>
        s.context().addCookies([{ name: 'payload-theme', value, url: new URL(s.url()).origin }])
      await theme('dark')
      await s.reload()
      await shot(s, 'expedice-tmave')
      await s.goto(`/admin/vyrizeni/${id}`)
      await shot(s, 'vyrizeni-tmave', false)
      await theme('light')
      await s.goto('/admin')
      await shot(s, 'dashboard-dnes', false)
      await s.goto(`/api/fulfilment/print/production?date=${date}`)
      await s.emulateMedia({ media: 'print' })
      await s.pdf({
        path: path.join(SHOT_DIR, 'vyrobni-list.pdf'),
        format: 'A4',
        printBackground: true,
      })
      await shot(s, 'vyrobni-list-tisk')
      await s.goto(`/api/fulfilment/print/route?date=${date}`)
      await shot(s, 'rozvozovy-list-tisk')
      await s.emulateMedia({ media: 'screen' })
      for (const [subject, name] of [
        ['je zvážená', 'email-vysledna-cena'],
        ['je na cestě', 'email-odeslano'],
      ] as const) {
        const mail = mails.find((m) => m.subject.includes(subject))!
        await s.setViewportSize({ width: 700, height: 900 })
        await s.setContent(await readFile(mail.html, 'utf8'))
        await shot(s, name)
      }
    }
  })
})
