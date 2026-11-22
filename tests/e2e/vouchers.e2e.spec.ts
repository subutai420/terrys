import { randomBytes } from 'crypto'
import { mkdir, readdir, readFile, writeFile } from 'fs/promises'
import path from 'path'

import { type APIRequestContext, type Browser, expect, type Page, test } from '@playwright/test'
import jsQR from 'jsqr'
import pg from 'pg'
import { PNG } from 'pngjs'
import { extractText, getDocumentProxy } from 'unpdf'

/**
 * Stage 7 – gift vouchers end to end on the data of `pnpm seed` (demo voucher products, demo
 * batch T, the FAKE test bank account from the QR Platba specification):
 *
 * customer on a phone buys an electronic voucher → no postcode / delivery step → thank-you page
 * with payment details → the e-mail in the outbox has the QR image (decoded = SPAYD of the order)
 * and the PDF (contains the code and the expiry) → staff marks the payment in "Poukazy – platby"
 * → later a meat order is paid with that code on "Vyřízení objednávky" → balance and status.
 *
 * Users like the stage 5 test: first admin registered on an empty database, otherwise
 * E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD. SCREENSHOTS=1 writes docs/screenshots/etapa-7.
 */

const VOUCHER = '/produkty/detail/darkovy-poukaz-1000-kc'
const MEAT = '/produkty/argentinsky-hovezi-rib-eye-detail-406'
const MIN_FILL_MS = 3_500
const SHOTS = process.env.SCREENSHOTS === '1'
const SHOT_DIR = path.resolve('docs/screenshots/etapa-7')
const PHONE = { width: 375, height: 812 }
const DESKTOP = { width: 1440, height: 1000 }
const OUTBOX = path.resolve(process.env.EMAIL_OUTBOX_DIR || '.emails')

async function query<T>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.end()
  }
}

type Mail = {
  subject: string
  html: string
  attachments: { filename: string; file: string; cid: string | null }[]
}

async function outbox(orderNumber: string): Promise<Mail[]> {
  const files = (await readdir(OUTBOX).catch(() => [] as string[])).filter((f) =>
    f.endsWith('.json'),
  )
  const result: Mail[] = []
  for (const file of files) {
    const meta = JSON.parse(await readFile(path.join(OUTBOX, file), 'utf8'))
    if (String(meta.subject).includes(orderNumber)) {
      result.push({
        subject: meta.subject,
        html: path.join(OUTBOX, file.replace(/\.json$/, '.html')),
        attachments: meta.attachments ?? [],
      })
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

async function staffAccount(request: APIRequestContext, admin: Account): Promise<Account> {
  const login = await (await request.post('/api/users/login', { data: admin })).json()
  const account = {
    email: `e2e-poukazy-${Date.now()}@example.test`,
    password: randomBytes(18).toString('hex'),
  }
  const res = await request.post('/api/users', {
    data: { ...account, role: 'staff' },
    headers: { Authorization: `JWT ${login.token}` },
  })
  expect(res.ok()).toBe(true)
  return account
}

async function login(browser: Browser, account: Account, viewport = DESKTOP) {
  const context = await browser.newContext({ viewport, locale: 'cs-CZ' })
  const page = await context.newPage()
  await page.goto('/admin/login')
  await page.locator('input[name="email"]').fill(account.email)
  await page.locator('input[name="password"]').fill(account.password)
  await page.locator('button[type="submit"]').click()
  await expect(page).not.toHaveURL(/\/admin\/login/, { timeout: 30_000 })
  return page
}

function decodeQr(png: Buffer): string | null {
  const image = PNG.sync.read(png)
  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data ?? null
}

async function pdfText(file: string): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(await readFile(file)))
  const { text } = await extractText(doc, { mergePages: true })
  return String(text).replace(/\s+/g, ' ')
}

test.describe('Gift vouchers (stage 7)', () => {
  test.setTimeout(300_000)

  test('voucher endpoints are closed to anonymous visitors', async ({ request }) => {
    expect((await request.post('/api/gift-vouchers/orders/1/paid', { data: {} })).status()).toBe(
      401,
    )
    expect((await request.get('/api/gift-vouchers/search?q=ABCD')).status()).toBe(401)
    expect((await request.get('/api/vouchers')).status()).toBe(403)
    expect((await request.get('/api/gift-vouchers/pdf/not-a-real-token-0123456789')).status()).toBe(
      404,
    )
    expect((await request.get('/api/gift-vouchers/overdue')).status()).toBeGreaterThanOrEqual(401)
  })

  test('electronic voucher on a phone → e-mail with QR + PDF → staff marks paid → redeemed on a meat order', async ({
    browser,
    request,
  }) => {
    const admin = await adminAccount(request)
    test.skip(!admin, 'Database has users – set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD.')
    const staff = await staffAccount(request, admin!)

    // 1) Product page on a phone: value chips, electronic vs printed explained.
    const phone = await (await browser.newContext({ viewport: PHONE, locale: 'cs-CZ' })).newPage()
    await phone.goto(VOUCHER)
    await expect(phone.getByTestId('voucher-buybox')).toBeVisible()
    await expect(phone.getByTestId('voucher-values').getByRole('link')).toHaveCount(4)
    await expect(phone.getByTestId('price-estimate')).toHaveText(/1\s000\sKč/)
    await expect(phone.getByTestId('voucher-validity')).toContainText('Platnost do')
    await expect(phone.getByTestId('voucher-format-info')).toContainText('převodem')
    await shot(phone, 'poukaz-produkt-375')
    if (SHOTS) {
      const wide = await (
        await browser.newContext({ viewport: DESKTOP, locale: 'cs-CZ' })
      ).newPage()
      await wide.goto(VOUCHER)
      await expect(wide.getByTestId('voucher-buybox')).toBeVisible()
      await shot(wide, 'poukaz-produkt-1440')
      await wide.close()
    }
    await expect(async () => {
      await phone.locator('label[for$="-electronic"]').click()
      await expect(phone.getByTestId('voucher-format-electronic')).toBeChecked({ timeout: 1_000 })
    }).toPass({ timeout: 20_000 })
    await phone.getByTestId('add-to-cart').first().click()
    await expect(phone.getByTestId('cart-count')).not.toHaveText('0')

    // 2) Cart: no postcode, no delivery, bank transfer explained.
    await phone.goto('/kosik')
    await expect(phone.getByTestId('voucher-no-delivery')).toBeVisible()
    await expect(phone.getByTestId('postcode-input')).toHaveCount(0)
    await expect(phone.getByTestId('voucher-payment-notice')).toContainText('převodem')
    await expect(phone.getByTestId('summary-total')).toHaveText(/1\s000\sKč/)
    await shot(phone, 'poukaz-kosik-375')
    if (SHOTS) {
      await phone.setViewportSize(DESKTOP)
      await shot(phone, 'poukaz-kosik-1440')
      await phone.setViewportSize(PHONE)
    }
    await phone.getByTestId('cart-continue').click()

    // 3) Checkout: contact, recipient on the voucher, consents.
    const loadedAt = Date.now()
    await expect(phone.getByTestId('voucher-delivery-info')).toBeVisible()
    await phone.locator('#f-customer-firstName').fill('Petra')
    await phone.locator('#f-customer-lastName').fill('Dárková')
    await phone.locator('#f-customer-email').fill('e2e-poukaz@example.test')
    await phone.locator('#f-customer-phone').fill('602 111 222')
    await phone.locator('#f-voucherDetails-recipientName').fill('Jan Novák')
    await phone.locator('#f-voucherDetails-message').fill('Všechno nejlepší!')
    await phone.getByTestId('consent-terms').check()
    await expect(phone.getByTestId('precontract-info')).toContainText('bankovním převodem')
    await shot(phone, 'poukaz-objednavka-375')
    await phone.waitForTimeout(Math.max(0, MIN_FILL_MS - (Date.now() - loadedAt)))
    await phone.getByTestId('place-order').click()
    await expect(phone).toHaveURL(/\/objednavka\/dekujeme/)
    await expect(phone.getByTestId('voucher-payment')).toBeVisible()
    await expect(phone.getByTestId('voucher-qr')).toBeVisible()
    const orderNumber = ((await phone.getByTestId('order-number').textContent()) ?? '').trim()
    await shot(phone, 'poukaz-dekujeme-375')

    const [order] = await query<{
      id: number
      kind: string
      delivery_method_type: string | null
      payment_status: string
      payment_amount: string
      payment_account: string
    }>(
      'select id, kind, delivery_method_type, payment_status, payment_amount, payment_account from orders where order_number = $1',
      [orderNumber],
    )
    expect(order).toMatchObject({
      kind: 'voucher',
      delivery_method_type: null,
      payment_status: 'awaiting',
    })
    expect(Number(order.payment_amount)).toBe(1000)
    const [voucher] = await query<{ id: number; code: string; status: string; expires_on: Date }>(
      'select id, code, status, expires_on from vouchers where order_id = $1',
      [order.id],
    )
    expect(voucher.status).toBe('issued')

    // 4) The e-mail: QR image decodes to the SPAYD of the order, PDF with code and expiry.
    await expect
      .poll(async () => (await outbox(orderNumber)).length, { timeout: 15_000 })
      .toBeGreaterThan(0)
    const mail = (await outbox(orderNumber)).find((m) => m.attachments.length > 0)!
    const qrFile = mail.attachments.find((a) => a.cid)!
    const spayd = decodeQr(await readFile(path.join(OUTBOX, qrFile.file)))
    expect(spayd).toMatch(
      /^SPD\*1\.0\*ACC:CZ\d{22}\*AM:1000\.00\*CC:CZK\*DT:\d{8}\*MSG:Darkovy poukaz Terrys \d+\*X-VS:\d+$/,
    )
    expect(spayd).toContain(`X-VS:${orderNumber}`)
    const pdfFile = mail.attachments.find((a) => a.filename.endsWith('.pdf'))!
    const text = await pdfText(path.join(OUTBOX, pdfFile.file))
    expect(text).toContain(voucher.code)
    const expiry = new Date(voucher.expires_on)
    expect(text).toContain(
      `${expiry.getUTCDate()}. ${expiry.getUTCMonth() + 1}. ${expiry.getUTCFullYear()}`,
    )
    expect(text).toContain('Jan Novák')
    if (SHOTS) {
      const viewer = await (
        await browser.newContext({ viewport: { width: 700, height: 900 } })
      ).newPage()
      await viewer.goto(`file://${mail.html.replace(/\\/g, '/')}`)
      await shot(viewer, 'poukaz-email')
      // The PDF as an image (rendered with PDF.js, dev dependency).
      const { pdfToPngPages } = await import('../../src/vouchers/pdfPreview')
      const [png] = await pdfToPngPages(await readFile(path.join(OUTBOX, pdfFile.file)), {
        scale: 1.6,
      })
      await mkdir(SHOT_DIR, { recursive: true })
      await writeFile(path.join(SHOT_DIR, 'poukaz-pdf.png'), png)
      await viewer.close()
    }

    // 5) Staff: Poukazy – platby → Zaplaceno.
    const s = await login(browser, staff)
    await s.goto('/admin/poukazy-platby')
    const row = s.locator(`[data-testid="payment-row"][data-order="${orderNumber}"]`)
    await expect(row).toBeVisible()
    await expect(row).toContainText('1 000 Kč')
    await shot(s, 'poukazy-platby')
    await expect(async () => {
      await row.getByTestId(`mark-paid-${orderNumber}`).click({ timeout: 2_000 })
      await expect(row).toHaveCount(0, { timeout: 5_000 })
    }).toPass({ timeout: 30_000 })
    const [paid] = await query<{ status: string }>('select status from vouchers where id = $1', [
      voucher.id,
    ])
    expect(paid.status).toBe('paid')
    await expect
      .poll(
        async () => (await outbox(orderNumber)).some((m) => m.subject.startsWith('Platba přijata')),
        {
          timeout: 15_000,
        },
      )
      .toBe(true)
    await shot(s, 'poukazy-platby-zaplaceno')

    // 6) Later: a meat order (pickup… courier like stage 5) with the voucher code.
    const buyer = await (await browser.newContext({ viewport: PHONE, locale: 'cs-CZ' })).newPage()
    await buyer.goto(MEAT)
    await buyer
      .locator('label', { hasText: /^500 g$/ })
      .first()
      .click()
    await buyer.getByTestId('add-to-cart').first().click()
    await expect(buyer.getByTestId('cart-count')).not.toHaveText('0')
    await buyer.goto('/kosik')
    await buyer.getByTestId('postcode-input').fill('602 00')
    await buyer.getByTestId('postcode-submit').click()
    await buyer.locator('label', { hasText: /Kurýr/ }).first().click()
    await expect(buyer.getByTestId('date-option').first()).toBeChecked()
    await buyer.getByTestId('cart-continue').click()
    const meatLoaded = Date.now()
    await buyer.locator('#f-customer-firstName').fill('Jan')
    await buyer.locator('#f-customer-lastName').fill('Novák')
    await buyer.locator('#f-customer-email').fill('e2e-obdarovany@example.test')
    await buyer.locator('#f-customer-phone').fill('602 999 888')
    await buyer.locator('#f-address-street').fill('Masarykova 12')
    await buyer.locator('#f-address-city').fill('Brno')
    await buyer.getByText('Zaplatím částečně dárkovým poukazem Terrys').click()
    await buyer.locator('#f-voucherCode').fill(voucher.code.toLowerCase().replace(/-/g, ' '))
    await buyer.getByTestId('consent-terms').check()
    await buyer.waitForTimeout(Math.max(0, MIN_FILL_MS - (Date.now() - meatLoaded)))
    await buyer.getByTestId('place-order').click()
    await expect(buyer).toHaveURL(/\/objednavka\/dekujeme/)
    const meatNumber = ((await buyer.getByTestId('order-number').textContent()) ?? '').trim()
    const [meat] = await query<{ id: number }>('select id from orders where order_number = $1', [
      meatNumber,
    ])
    const lines = await query<{ id: string }>('select id from orders_lines where _parent_id = $1', [
      meat.id,
    ])

    // Weighing (as staff, through the same endpoint the weighing screen uses): 500 g exactly.
    const weighed = await s.evaluate(
      async ({ id, lineId }) =>
        (
          await fetch(`/api/fulfilment/orders/${id}/weigh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lines: [{ id: lineId, actualWeightGrams: 500 }],
              markWeighed: true,
            }),
          })
        ).status,
      { id: meat.id, lineId: lines[0].id },
    )
    expect(weighed).toBe(200)

    // 7) Vyřízení: the customer's code is pre-filled, checked live, "Použít" fills the amount.
    await s.goto(`/admin/vyrizeni/${meat.id}`)
    await expect(async () => {
      await s.getByTestId('voucher-add').click({ timeout: 2_000 })
      await expect(s.getByTestId('voucher-code')).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 30_000 })
    await expect(s.getByTestId('voucher-check')).toHaveAttribute('data-state', 'ok', {
      timeout: 15_000,
    })
    await s.getByTestId('voucher-check').getByRole('button').click()
    const total = Number(
      ((await s.getByTestId('fulfil-total-final').textContent()) ?? '').replace(/\D/g, ''),
    )
    await expect(s.getByTestId('voucher-amount')).toHaveValue(String(Math.min(1000, total)))
    await shot(s, 'poukaz-uplatneni-vyrizeni')
    await s.getByTestId('billing-finalise').click()
    await expect(s.getByText('✓ Vyúčtování potvrzeno.')).toBeVisible({ timeout: 20_000 })

    const [after] = await query<{ balance: string; status: string }>(
      'select balance, status from vouchers where id = $1',
      [voucher.id],
    )
    const used = Math.min(1000, total)
    expect(Number(after.balance)).toBe(1000 - used)
    expect(after.status).toBe(used === 1000 ? 'redeemed' : 'partially-redeemed')
    const [billed] = await query<{ amount_due: string; totals_total_final: string }>(
      'select amount_due, totals_total_final from orders where id = $1',
      [meat.id],
    )
    expect(Number(billed.totals_total_final)).toBe(total) // a voucher is a payment, not a discount
    expect(Number(billed.amount_due)).toBe(total - used)
  })
})
