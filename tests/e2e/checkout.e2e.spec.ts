import { readdir, readFile } from 'fs/promises'
import path from 'path'

import { expect, type Page, test } from '@playwright/test'
import pg from 'pg'

/**
 * Whole purchase on the data of `pnpm seed` (stage 4), on a phone-sized screen:
 * product → variant → cart → postcode → method and date → checkout form → thank-you page; the
 * order is in the database and both e-mails were produced (no e-mail provider in tests: they are
 * saved to EMAIL_OUTBOX_DIR, default `.emails/`). Plus a pickup purchase and a postcode we do
 * not deliver to. CI: empty DB → migrate → seed → build → start.
 */

const PRODUCT = '/produkty/argentinsky-hovezi-rib-eye-detail-406'
const MIN_FILL_MS = 3_500 // the server refuses forms submitted faster (timing trap)

test.use({ viewport: { width: 375, height: 812 } })

async function query<T>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.end()
  }
}

async function emailsFor(orderNumber: string): Promise<{ to: string; subject: string }[]> {
  const dir = path.resolve(process.env.EMAIL_OUTBOX_DIR || '.emails')
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.json'))
  const result: { to: string; subject: string }[] = []
  for (const file of files) {
    const meta = JSON.parse(await readFile(path.join(dir, file), 'utf8'))
    if (String(meta.subject).includes(orderNumber)) result.push(meta)
  }
  return result
}

async function addToCart(page: Page, variant: RegExp) {
  await page.goto(PRODUCT)
  await page.locator('label', { hasText: variant }).first().click()
  await page.getByTestId('add-to-cart').first().click()
  await expect(page.getByTestId('cart-count')).not.toHaveText('0')
}

async function chooseDelivery(page: Page, postcode: string, method: RegExp) {
  await page.goto('/kosik')
  await expect(page.getByTestId('cart-line').first()).toBeVisible()
  await page.getByTestId('postcode-input').fill(postcode)
  await page.getByTestId('postcode-submit').click()
  await page.locator('label', { hasText: method }).first().click()
  await expect(page.getByTestId('date-option').first()).toBeChecked()
}

async function fillContact(page: Page, email: string) {
  await page.locator('#f-customer-firstName').fill('Jana')
  await page.locator('#f-customer-lastName').fill('Testovací')
  await page.locator('#f-customer-email').fill(email)
  await page.locator('#f-customer-phone').fill('602 123 456')
}

async function analyticsEvents(page: Page, name: string): Promise<unknown[]> {
  return page.evaluate(
    (event) =>
      (
        (window as unknown as { terrysAnalyticsLog?: { event: string; payload: unknown }[] })
          .terrysAnalyticsLog ?? []
      )
        .filter((item) => item.event === event)
        .map((item) => item.payload),
    name,
  )
}

test.describe('Checkout', () => {
  test('delivery purchase: cart → postcode → date → form → thank-you, order and e-mails exist', async ({
    page,
  }) => {
    await addToCart(page, /^500 g$/)
    await chooseDelivery(page, '120 00', /Rozvoz/)
    await expect(page.getByTestId('summary-delivery')).toContainText('229')
    await expect(page.getByTestId('estimate-notice')).toContainText('±15 %')

    await page.getByTestId('cart-continue').click()
    await expect(page).toHaveURL(/\/objednavka$/)
    const loadedAt = Date.now()
    await expect(page.getByTestId('delivery-summary')).toBeVisible()
    expect(await analyticsEvents(page, 'begin_checkout')).toHaveLength(1)

    // Inline validation in Czech.
    await page.getByTestId('place-order').click()
    await expect(page.getByTestId('error-summary')).toContainText('Vyplňte jméno')

    await fillContact(page, 'e2e-rozvoz@example.test')
    await page.locator('#f-customer-phone').fill('123')
    await page.locator('#f-customer-phone').blur()
    await expect(page.getByTestId('error-f-customer-phone')).toContainText('devět číslic')
    await page.locator('#f-customer-phone').fill('602 123 456')
    await page.locator('#f-address-street').fill('Italská 17')
    await page.locator('#f-address-city').fill('Praha 2')
    await expect(page.locator('#f-address-postcode')).toHaveValue('120 00')
    await page.getByTestId('consent-terms').check()
    await expect(page.getByTestId('consent-newsletter')).not.toBeChecked()
    await expect(page.getByTestId('place-order')).toHaveText('Objednávka zavazující k platbě')

    await page.waitForTimeout(Math.max(0, MIN_FILL_MS - (Date.now() - loadedAt)))
    await page.getByTestId('place-order').click()

    await expect(page).toHaveURL(/\/objednavka\/dekujeme\/[A-Za-z0-9_-]{20,}$/)
    const orderNumber = (await page.getByTestId('order-number').textContent())?.trim() ?? ''
    expect(orderNumber).toMatch(/^\d+$/)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await expect(page.getByTestId('cart-count')).toHaveText('0')

    // purchase fired exactly once, also after a reload.
    const purchases = await analyticsEvents(page, 'purchase')
    expect(purchases).toHaveLength(1)
    expect(purchases[0]).toMatchObject({ transaction_id: orderNumber, shipping: 229 })
    await page.reload()
    await expect(page.getByTestId('order-number')).toHaveText(orderNumber)
    expect(await analyticsEvents(page, 'purchase')).toHaveLength(0)

    // The order in the database (what the admin shows).
    const [order] = await query<Record<string, unknown>>(
      'select status, delivery_price::int as delivery_price, totals_total_estimate::int as totals_total_estimate, customer_email, delivery_method_type, emails_customer_status from orders where order_number = $1',
      [orderNumber],
    )
    expect(order).toMatchObject({
      status: 'received',
      delivery_price: 229,
      customer_email: 'e2e-rozvoz@example.test',
      delivery_method_type: 'own-delivery',
      emails_customer_status: 'outbox',
    })
    // 990 Kč/kg × 500 g = 495 + 229
    expect(Number(order.totals_total_estimate)).toBe(724)

    // Both e-mails were produced (customer + shop copy).
    await expect
      .poll(async () => (await emailsFor(orderNumber)).length, { timeout: 10_000 })
      .toBe(2)
  })

  test('pickup purchase needs no address and costs nothing', async ({ page }) => {
    await addToCart(page, /^250 g$/)
    await chooseDelivery(page, '120 00', /Osobní odběr/)
    await expect(page.getByTestId('summary-delivery')).toContainText('zdarma')
    await page.getByTestId('cart-continue').click()
    const loadedAt = Date.now()
    await expect(page.getByRole('heading', { name: 'Vyzvednutí' })).toBeVisible()
    await expect(page.locator('#f-address-street')).toHaveCount(0)
    await fillContact(page, 'e2e-odber@example.test')
    await page.getByTestId('consent-terms').check()
    await page.getByTestId('consent-heureka').check()
    await page.waitForTimeout(Math.max(0, MIN_FILL_MS - (Date.now() - loadedAt)))
    await page.getByTestId('place-order').click()
    await expect(page).toHaveURL(/\/objednavka\/dekujeme\//)
    const orderNumber = (await page.getByTestId('order-number').textContent())?.trim() ?? ''
    const [order] = await query<Record<string, unknown>>(
      'select delivery_price::int as delivery_price, delivery_method_type, consents_heureka_opt_out, shipping_address_street from orders where order_number = $1',
      [orderNumber],
    )
    expect(order).toMatchObject({
      delivery_price: 0,
      delivery_method_type: 'pickup',
      consents_heureka_opt_out: true,
      shipping_address_street: null,
    })
  })

  test('postcode without delivery offers pickup only, with the reason', async ({ page }) => {
    await addToCart(page, /^250 g$/)
    await page.goto('/kosik')
    await page.getByTestId('postcode-input').fill('39999')
    await page.getByTestId('postcode-submit').click()
    await expect(page.getByTestId('pickup-only')).toBeVisible()
    const unavailable = page.getByTestId('method-unavailable')
    expect(await unavailable.count()).toBeGreaterThan(0)
    await expect(unavailable.first()).toContainText('osobní odběr')
    // Delivery methods are disabled, pickup can be chosen.
    for (const option of await page.getByTestId('method-option').all()) {
      const label = await page
        .locator(`label[for="${await option.getAttribute('id')}"]`)
        .textContent()
      if (label?.includes('Osobní odběr')) await expect(option).toBeEnabled()
      else await expect(option).toBeDisabled()
    }
  })

  test('orders are never public and the withdrawal form is reachable from the footer', async ({
    page,
    request,
  }) => {
    expect((await request.get('/api/orders')).status()).toBe(403)
    expect((await request.get('/api/withdrawals')).status()).toBe(403)
    await page.goto('/')
    await page.getByTestId('footer-withdrawal').click()
    await expect(page).toHaveURL(/\/odstoupeni-od-smlouvy$/)
    await page.getByTestId('withdrawal-open').click()
    await expect(page.getByTestId('withdrawal-confirm')).toHaveText(
      'Potvrdit odstoupení od smlouvy',
    )
  })
})
