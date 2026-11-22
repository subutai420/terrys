import { mkdir } from 'fs/promises'
import path from 'path'

import { expect, type Page, test } from '@playwright/test'
import pg from 'pg'

/**
 * Stage 6 (measurement) on the data of `pnpm seed`:
 * - the cookie banner (375 px and 1440 px), equal-weight choices, preferences dialog, consent
 *   cookie, Consent Mode `consent_update`, attribution stored only with analytics consent,
 * - the GA4 e-commerce dataLayer sequence of a whole purchase with the payloads and item ids
 *   (identical to the feed ids), `{ ecommerce: null }` before every push, purchase once, the
 *   thank-you token never in the URL or the page view,
 * - feeds, llms.txt and robots.txt respond; GTM is not loaded in tests.
 * SCREENSHOTS=1 also saves docs/screenshots/etapa-6.
 */

const PRODUCT = '/produkty/argentinsky-hovezi-rib-eye-detail-406'
const PRODUCT_TITLE = 'Argentinský hovězí Rib Eye'
const MIN_FILL_MS = 3_500
const SHOTS = process.env.SCREENSHOTS === '1'
const SHOT_DIR = path.resolve('docs/screenshots/etapa-6')

type DataLayerEntry = Record<string, unknown> & {
  event?: string
  ecommerce?: Record<string, unknown> | null
}

async function query<T>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.end()
  }
}

async function dataLayer(page: Page): Promise<DataLayerEntry[]> {
  return page.evaluate(
    () => (window as unknown as { dataLayer?: DataLayerEntry[] }).dataLayer ?? [],
  )
}

async function events(page: Page, name: string): Promise<DataLayerEntry[]> {
  return (await dataLayer(page)).filter((entry) => entry.event === name)
}

/** Every e-commerce push is preceded by `{ ecommerce: null }` (Google's rule for GTM). */
function expectClearedBeforeEachPush(entries: DataLayerEntry[]) {
  entries.forEach((entry, index) => {
    if (entry.ecommerce && typeof entry.ecommerce === 'object') {
      expect(entries[index - 1]).toEqual({ ecommerce: null })
    }
  })
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return
  await mkdir(SHOT_DIR, { recursive: true })
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) })
}

test.describe('Consent banner', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  for (const [label, viewport] of [
    ['375', { width: 375, height: 812 }],
    ['1440', { width: 1440, height: 900 }],
  ] as const) {
    test(`banner and preferences at ${label} px`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto('/?utm_source=e2e&utm_medium=banner')
      const banner = page.getByTestId('consent-banner')
      await expect(banner).toBeVisible()
      await expect(banner.getByRole('heading', { name: 'Cookies a měření' })).toBeVisible()

      // Equal weight: same style, same height, nothing pre-ticked.
      const reject = page.getByTestId('consent-reject')
      const accept = page.getByTestId('consent-accept')
      expect(await reject.getAttribute('class')).toBe(await accept.getAttribute('class'))
      const [r, a] = [await reject.boundingBox(), await accept.boundingBox()]
      expect(Math.round(r?.height ?? 0)).toBe(Math.round(a?.height ?? 0))
      // No horizontal scrolling caused by the banner.
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      await shot(page, `consent-banner-${label}`)

      // Nothing non-essential before consent.
      expect(await page.evaluate(() => localStorage.getItem('terrys-attribution-v1'))).toBeNull()
      expect(await page.locator('script[src*="googletagmanager"]').count()).toBe(0)

      await page.getByTestId('consent-customize').click()
      const dialog = page.getByTestId('consent-dialog')
      await expect(dialog).toBeVisible()
      await expect(page.getByTestId('consent-analytics')).not.toBeChecked()
      await expect(page.getByTestId('consent-marketing')).not.toBeChecked()
      await shot(page, `consent-dialog-${label}`)

      await page.getByTestId('consent-analytics').check()
      await page.getByTestId('consent-save').click()
      await expect(dialog).toBeHidden()
      await expect(banner).toBeHidden()

      const cookie = (await page.context().cookies()).find((c) => c.name === 'terrys_consent')
      expect(JSON.parse(decodeURIComponent(cookie?.value ?? '{}'))).toMatchObject({
        a: 1,
        m: 0,
        v: '2026-11',
      })
      expect((await events(page, 'consent_update')).at(-1)).toMatchObject({
        consent_analytics: 'granted',
        consent_marketing: 'denied',
      })
      // Analytics consent → first-touch attribution is captured from this landing page.
      const stored = await page.evaluate(() => localStorage.getItem('terrys-attribution-v1'))
      expect(JSON.parse(stored ?? '{}')).toMatchObject({ utmSource: 'e2e', utmMedium: 'banner' })

      // Re-open from the footer, withdraw → attribution deleted, banner stays away after reload.
      await page.reload()
      await expect(banner).toBeHidden()
      await page.getByTestId('footer-consent-settings').click()
      await expect(dialog).toBeVisible()
      await expect(page.getByTestId('consent-analytics')).toBeChecked()
      await dialog.getByRole('button', { name: 'Odmítnout vše' }).click()
      await expect(dialog).toBeHidden()
      expect(await page.evaluate(() => localStorage.getItem('terrys-attribution-v1'))).toBeNull()
    })
  }
})

test.describe('E-commerce dataLayer', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('purchase journey pushes GA4 events with feed item ids', async ({ page }) => {
    const [product] = await query<{ id: number }>('select id from products where legacy_url = $1', [
      PRODUCT,
    ])
    const variants = await query<{ id: string; label: string }>(
      'select id, label from products_variants where _parent_id = $1 order by _order',
      [product.id],
    )
    const v500 = variants.find((v) => v.label === '500 g')?.id
    const itemPattern = /^\d+(-[0-9a-f]{24})?$/

    // 1. Listing → view_item_list
    await page.goto('/produkty')
    await expect.poll(async () => (await events(page, 'view_item_list')).length).toBe(1)
    const [list] = await events(page, 'view_item_list')
    const listItems = (list.ecommerce?.items ?? []) as Record<string, unknown>[]
    expect(list.ecommerce).toMatchObject({ item_list_id: 'all-products', currency: 'CZK' })
    expect(listItems[0]).toMatchObject({
      index: 1,
      item_list_id: 'all-products',
      item_brand: expect.any(String),
    })
    for (const item of listItems) expect(String(item.item_id)).toMatch(itemPattern)

    // 2. Click the card → select_item, then view_item (client navigation, same dataLayer)
    await page
      .getByTestId('product-grid')
      .getByRole('link', { name: PRODUCT_TITLE, exact: true })
      .click()
    await expect(page).toHaveURL(new RegExp(`${PRODUCT}$`))
    await expect.poll(async () => (await events(page, 'view_item')).length).toBe(1)
    const [select] = await events(page, 'select_item')
    const [view] = await events(page, 'view_item')
    const selected = (select.ecommerce?.items as Record<string, unknown>[])[0]
    const viewed = (view.ecommerce?.items as Record<string, unknown>[])[0]
    expect(selected.item_id).toBe(viewed.item_id)
    expect(viewed).toMatchObject({
      item_name: PRODUCT_TITLE,
      item_group_id: String(product.id),
      price_per_kg: 990,
      price_is_estimate: true,
    })
    expect(viewed.item_category).toBeTruthy()
    const pageViews = await events(page, 'virtual_page_view')
    expect(pageViews.map((p) => p.page_path)).toEqual(['/produkty', PRODUCT])

    // 3. Variant 500 g → add_to_cart with the variant id
    await page
      .locator('label', { hasText: /^500 g$/ })
      .first()
      .click()
    await page.getByTestId('add-to-cart').first().click()
    await expect.poll(async () => (await events(page, 'add_to_cart')).length).toBe(1)
    const [add] = await events(page, 'add_to_cart')
    expect(add.ecommerce).toMatchObject({
      currency: 'CZK',
      value: 495,
      items: [
        expect.objectContaining({
          item_id: `${product.id}-${v500}`,
          item_variant: '500 g',
          price: 495,
          quantity: 1,
          estimated_weight_grams: 500,
        }),
      ],
    })
    expect(add.value_is_estimate).toBe(true)
    expect(JSON.stringify(await dataLayer(page))).not.toMatch(/"coupon"|"discount"/)
    expectClearedBeforeEachPush(await dataLayer(page))

    // 4. Cart → view_cart, add_shipping_info; checkout → begin_checkout
    await page.goto('/kosik')
    await expect.poll(async () => (await events(page, 'view_cart')).length).toBe(1)
    await page.getByTestId('postcode-input').fill('120 00')
    await page.getByTestId('postcode-submit').click()
    await page
      .locator('label', { hasText: /Rozvoz/ })
      .first()
      .click()
    await expect(page.getByTestId('date-option').first()).toBeChecked()
    await page.getByTestId('cart-continue').click()
    await expect(page).toHaveURL(/\/objednavka$/)
    await expect.poll(async () => (await events(page, 'begin_checkout')).length).toBe(1)
    const loadedAt = Date.now()
    const sequence = (await dataLayer(page))
      .map((entry) => entry.event)
      .filter((name) => ['view_cart', 'add_shipping_info', 'begin_checkout'].includes(String(name)))
    expect(sequence).toEqual(['view_cart', 'add_shipping_info', 'begin_checkout'])
    const [shipping] = await events(page, 'add_shipping_info')
    expect(shipping.ecommerce).toMatchObject({
      shipping_tier: expect.stringMatching(/Rozvoz/),
      value: 495,
    })

    // 5. Order → purchase on the thank-you page (client navigation, same dataLayer)
    await page.locator('#f-customer-firstName').fill('Jana')
    await page.locator('#f-customer-lastName').fill('Měřicí')
    await page.locator('#f-customer-email').fill('E2E-Mereni@example.test')
    await page.locator('#f-customer-phone').fill('602 123 456')
    await page.locator('#f-address-street').fill('Italská 17')
    await page.locator('#f-address-city').fill('Praha 2')
    await page.getByTestId('consent-terms').check()
    await page.waitForTimeout(Math.max(0, MIN_FILL_MS - (Date.now() - loadedAt)))
    await page.getByTestId('place-order').click()
    await expect(page.getByTestId('order-number')).toBeVisible()
    await expect(page).toHaveURL(/\/objednavka\/dekujeme$/)
    const orderNumber = ((await page.getByTestId('order-number').textContent()) ?? '').trim()
    const [order] = await query<{
      event_id: string
      meta: string
      heureka: string
      ecomail: string
    }>(
      `select event_id, integrations_meta_status as meta, integrations_heureka_status as heureka,
              integrations_ecomail_status as ecomail from orders where order_number = $1`,
      [orderNumber],
    )
    await expect.poll(async () => (await events(page, 'purchase')).length).toBe(1)
    const [purchase] = await events(page, 'purchase')
    expect(purchase).toMatchObject({
      event_id: order.event_id,
      value_is_estimate: true,
      order_total: 724,
      delivery_price: 229,
      ecommerce: {
        transaction_id: orderNumber,
        currency: 'CZK',
        value: 495,
        shipping: 229,
        items: [
          expect.objectContaining({ item_id: `${product.id}-${v500}`, quantity: 1, price: 495 }),
        ],
      },
      // marketing consent (preset cookie) → enhanced conversions data
      user_data: { email: 'e2e-mereni@example.test', phone_number: '+420602123456' },
    })
    expect(Number(purchase.ecommerce?.tax)).toBeGreaterThan(0)
    expectClearedBeforeEachPush(await dataLayer(page))

    // The token never appears in a page view.
    const views = await events(page, 'virtual_page_view')
    for (const view of views)
      expect(String(view.page_location)).not.toMatch(/dekujeme\/[A-Za-z0-9_-]{20,}/)
    expect(views.at(-1)?.page_path).toBe('/objednavka/dekujeme')

    // Reload: the order is shown again, purchase is NOT pushed again.
    await page.reload()
    await expect(page.getByTestId('order-number')).toHaveText(orderNumber)
    await page.waitForTimeout(500)
    expect(await events(page, 'purchase')).toHaveLength(0)

    // No keys in tests: CAPI and Heureka disabled, no newsletter consent → Ecomail skipped.
    expect(order).toMatchObject({ meta: 'disabled', heureka: 'disabled', ecomail: 'skipped' })
  })
})

test.describe('Feeds and machine-readable files', () => {
  test('feeds, llms.txt and robots.txt respond', async ({ request }) => {
    const google = await request.get('/feeds/google.xml')
    expect(google.status()).toBe(200)
    expect(google.headers()['content-type']).toContain('application/xml')
    const googleXml = await google.text()
    expect(googleXml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">')
    expect(googleXml).toMatch(/<g:id>\d+-[0-9a-f]{24}<\/g:id>/)
    expect(googleXml).not.toMatch(/sale_price/i)

    for (const channel of ['meta', 'heureka', 'zbozi']) {
      const response = await request.get(`/feeds/${channel}.xml`)
      expect(response.status()).toBe(200)
      expect(await response.text()).toMatch(channel === 'meta' ? /<item>/ : /<SHOPITEM>/)
    }
    expect((await request.get('/feeds/unknown.xml')).status()).toBe(404)

    const llms = await request.get('/llms.txt')
    expect(llms.status()).toBe(200)
    expect(await llms.text()).toMatch(/^# Terrys Steak/)

    const robots = await (await request.get('/robots.txt')).text()
    expect(robots).toContain('Disallow: /admin')
    expect(robots).toContain('Disallow: /objednavka')
  })
})
