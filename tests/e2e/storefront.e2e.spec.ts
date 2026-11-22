import { expect, test } from '@playwright/test'

/**
 * Storefront (stage 3) against the data of `pnpm seed`: 12 Rib Eye products, the category tree
 * (Steaky → Rib Eye, Argentinské hovězí with the old URL /produkty/argentinske-hovezi-23), the
 * Argentinian Rib Eye with its old URL, and a sample article/recipe as DRAFTS (never public).
 * CI runs `pnpm payload migrate && pnpm seed` before these tests.
 */

const LEGACY_PRODUCT = '/produkty/argentinsky-hovezi-rib-eye-detail-406'
const LEGACY_CATEGORY = '/produkty/argentinske-hovezi-23'
const RIB_EYE_CATEGORY = '/produkty/kategorie/rib-eye'

test.describe('Storefront', () => {
  test('home renders with menu, search and categories', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Steaky')
    await expect(page.getByRole('navigation', { name: 'Hlavní menu' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Argentinské hovězí/ }).first()).toBeVisible()
  })

  test('mega menu leads to a category at its old URL', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('mega-menu-button').click()
    const panel = page.getByTestId('mega-menu-panel')
    await expect(panel).toBeVisible()
    await panel.getByRole('link', { name: 'Argentinské hovězí' }).click()
    await expect(page).toHaveURL(new RegExp(`${LEGACY_CATEGORY}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Argentinské hovězí')
  })

  test('mobile menu opens nested accordions', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/')
    await page.getByTestId('mobile-menu-button').click()
    await page.getByText('Podle řezu', { exact: true }).first().click()
    await expect(page.getByRole('link', { name: /Rib Eye/ }).first()).toBeVisible()
  })

  test('category filter changes the results, filtered page is noindex', async ({ page }) => {
    await page.goto(RIB_EYE_CATEGORY)
    const grid = page.getByTestId('product-grid').locator('article')
    expect(await grid.count()).toBeGreaterThan(1)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`${RIB_EYE_CATEGORY}$`),
    )

    await page.getByTestId('filter-puvod-argentina').check()
    await expect(page).toHaveURL(/puvod=argentina/)
    await expect(grid).toHaveCount(1)
    await expect(grid.first()).toContainText('Argentinský')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`${RIB_EYE_CATEGORY}$`),
    )
  })

  test('product: variant changes the estimated price, add to cart updates the counter', async ({
    page,
  }) => {
    const response = await page.goto(LEGACY_PRODUCT)
    expect(response?.status()).toBe(200)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`${LEGACY_PRODUCT}$`),
    )
    await expect(page.getByTestId('price-notice')).toBeVisible()

    const estimate = page.getByTestId('price-estimate')
    await expect(estimate).toContainText('248')
    await page
      .locator('label', { hasText: /^500 g$/ })
      .first()
      .click()
    await expect(estimate).toContainText('495')

    await expect(page.getByTestId('cart-count')).toHaveText('0')
    await page.getByTestId('add-to-cart').first().click()
    await expect(page.getByTestId('cart-count')).toHaveText('1')
    // The cart survives a reload (localStorage; stage 4 takes over).
    await page.reload()
    await expect(page.getByTestId('cart-count')).toHaveText('1')
  })

  test('product JSON-LD offers estimated variant prices with a per-kg unit price', async ({
    page,
  }) => {
    await page.goto(LEGACY_PRODUCT)
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
    const product = blocks
      .flatMap((block) => [JSON.parse(block)].flat())
      .find((data) => data['@type'] === 'Product')
    expect(product.offers[0].priceSpecification.referenceQuantity.unitCode).toBe('KGM')
    expect(product.offers[0].priceCurrency).toBe('CZK')
  })

  test('search finds a product without diacritics (old ad URL)', async ({ page }) => {
    await page.goto('/vyhledavani?ProductsSearch=uruguaysky')
    await expect(page.getByTestId('search-results')).toContainText('Uruguayský hovězí Rib Eye')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)

    await page.getByTestId('search-input').fill('argentinsky')
    await page.getByTestId('search-input').press('Enter')
    await expect(page).toHaveURL(/ProductsSearch=argentinsky/)
    await expect(page.getByTestId('search-results')).toContainText('Argentinský hovězí Rib Eye')
  })

  test('legacy URLs return 200, unknown ones a real 404', async ({ request }) => {
    expect((await request.get(LEGACY_PRODUCT)).status()).toBe(200)
    expect((await request.get(LEGACY_CATEGORY)).status()).toBe(200)
    expect((await request.get('/produkty/neexistuje-detail-1')).status()).toBe(404)
    expect((await request.get('/produkty/neexistujici-kategorie-999')).status()).toBe(404)
    expect((await request.get('/tohle/neexistuje')).status()).toBe(404)
    // Drafts are never public.
    expect((await request.get('/magazin/clanek/ukazka-jak-vybrat-steak')).status()).toBe(404)
    expect((await request.get('/recepty/recept/ukazka-rib-eye-steak')).status()).toBe(404)
  })

  test('404 page is in Czech with search', async ({ page }) => {
    await page.goto('/produkty/neexistuje-detail-1')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tuhle stránku jsme nenašli')
    await expect(page.getByRole('search').last()).toBeVisible()
  })

  test('sitemap lists products, robots.txt blocks search and filters', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text()
    expect(sitemap).toContain(LEGACY_PRODUCT)
    expect(sitemap).toContain(LEGACY_CATEGORY)
    expect(sitemap).not.toContain('ukazka')
    const robots = await (await request.get('/robots.txt')).text()
    expect(robots).toContain('Disallow: /vyhledavani')
    expect(robots).toContain('Sitemap:')
  })
})
