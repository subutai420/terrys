import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

/**
 * Stage 9: accessibility check (axe-core, WCAG 2.0/2.1 A + AA rules) of the main customer pages.
 * Fails on "critical" and "serious" violations; "moderate"/"minor" ones are printed only (the
 * list is in the test output and docs/spusteni.md → audit). Uses the seed data like the other
 * storefront tests.
 */

async function firstUrlFromSitemap(page: Page, pattern: RegExp): Promise<string | null> {
  const xml = await (await page.request.get('/sitemap.xml')).text()
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)
  return urls.find((url) => pattern.test(url)) ?? null
}

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // The consent banner is preset to "accepted" in Playwright; GTM is off in tests.
    .analyze()
  const summary = results.violations.map(
    (v) => `${v.impact ?? 'n/a'} ${v.id} (${v.nodes.length}×): ${v.help}`,
  )
  console.log(
    `[a11y] ${label}: ${summary.length ? `\n  ${summary.join('\n  ')}` : 'no violations'}`,
  )
  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  )
  expect(
    blocking.map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}`,
    ),
  ).toEqual([])
}

test.describe('accessibility (axe)', () => {
  test('home, category, product, cart, checkout, withdrawal form', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto('/')
    await audit(page, 'home')

    const category = await firstUrlFromSitemap(page, /^\/produkty\/kategorie\//)
    if (category) {
      await page.goto(category)
      await audit(page, `category ${category}`)
    }

    const product = await firstUrlFromSitemap(page, /^\/produkty\/detail\//)
    expect(product).not.toBeNull()
    await page.goto(product!)
    await audit(page, `product ${product}`)
    const add = page.getByRole('button', { name: /do košíku/i }).first()
    if (await add.isEnabled().catch(() => false)) await add.click()

    await page.goto('/kosik')
    await page.waitForLoadState('networkidle')
    await audit(page, 'cart')

    await page.goto('/objednavka')
    await page.waitForLoadState('networkidle')
    await audit(page, 'checkout')

    await page.goto('/odstoupeni-od-smlouvy')
    await audit(page, 'withdrawal')
  })
})
