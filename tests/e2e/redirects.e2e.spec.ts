import { randomBytes } from 'crypto'

import { type APIRequestContext, expect, test } from '@playwright/test'

import { legacyIndex, type LegacyIndexData } from '@/lib/redirects/legacy'
import { type FetchLike, runRedirectCheck } from '@/migration/redirectCheck'
import { planFor, type PlanRow } from '@/migration/redirectPlan'

/**
 * Stage 8b on the running site (seeded catalog, `pnpm seed`): old addresses answer 200 or exactly
 * one 308 hop to the right page, tracking parameters survive, the checker logic passes over a
 * sample, and a redirect added in the admin works without a deploy (and cannot hide a page).
 */

const CATEGORY = '/produkty/argentinske-hovezi-23'
const PRODUCT = '/produkty/argentinsky-hovezi-rib-eye-detail-406'

async function location(request: APIRequestContext, url: string) {
  const res = await request.get(url, { maxRedirects: 0 })
  return { status: res.status(), location: res.headers()['location'] ?? null }
}

/**
 * Path + query of a Location header. A redirect rendered by the ISR catch-all on its first render
 * carries the header twice with the same value (Next 16; see CLAUDE.md) – the values must agree.
 */
const path = (header: string | null) => {
  if (!header) return null
  const values = [...new Set(header.split(', '))]
  if (values.length > 1) return `DIFFERENT LOCATIONS: ${header}`
  const url = new URL(values[0], 'http://x')
  return url.pathname + url.search
}

test('old addresses: one hop, tracking parameters kept', async ({ request }) => {
  // Warm up the proxy's redirect table.
  await request.get('/', { maxRedirects: 0 })

  const cases: [string, string][] = [
    [`${CATEGORY}/1`, CATEGORY],
    [`${CATEGORY}/2?utm_source=e2e&gclid=abc`, `${CATEGORY}?utm_source=e2e&gclid=abc`],
    ['/produkty/argentinske-23?druh_masa=svickova', CATEGORY],
    ['/Produkty/Argentinske-Hovezi-23/', CATEGORY],
    ['/produkty/stary-nazev-detail-406?list=hide&fbclid=x', `${PRODUCT}?fbclid=x`],
    ['/magazin/novinky-21', '/magazin'],
    ['/magazin/?Id=807', '/magazin'],
    ['/recepty/hlavni-jidla-31', '/recepty'],
    ['/academy-magazin', '/academy'],
    ['/pojmy/podle-typu-masa-74', '/pojmy'],
    ['/produkty?Page=4', '/produkty'],
    ['/?Id=807', '/'],
    ['/obchod/kosik', '/kosik'],
  ]
  for (const [from, to] of cases) {
    const first = await location(request, from)
    expect(first.status, from).toBe(308)
    expect(path(first.location), from).toBe(to)
    const second = await request.get(to, { maxRedirects: 0 })
    expect(second.status(), `${from} → ${to}`).toBe(200)
  }

  for (const direct of [
    PRODUCT,
    CATEGORY,
    '/prodejny',
    '/vyhledavani?ProductsSearch=rib',
    `${PRODUCT}?varianta=x`,
  ]) {
    expect((await request.get(direct, { maxRedirects: 0 })).status(), direct).toBe(200)
  }
  // Unknown addresses stay a real 404; clean paths are never touched.
  expect((await request.get('/magazin/clanek/neexistuje-e2e', { maxRedirects: 0 })).status()).toBe(
    404,
  )
  expect(
    (await request.get('/produkty/neexistuje-e2e-detail-999999', { maxRedirects: 0 })).status(),
  ).toBe(404)
  // Form posts are never redirected (server actions post to the page address).
  expect((await request.post('/magazin/?Id=807', { maxRedirects: 0 })).status()).not.toBe(308)
})

test('checker logic over a sample against the running site', async ({ request, baseURL }) => {
  const data = (await (await request.get('/api/legacy-redirects/index')).json()) as LegacyIndexData
  const index = legacyIndex(data)
  const rows: PlanRow[] = [
    PRODUCT,
    `${CATEGORY}/3`,
    '/produkty/rib-eye-detail-406?page=2&catId=1&list=hide',
    '/magazin/stolovani-80',
    '/jidelni-listek',
    '/muj-ucet',
  ].map((url) => ({ ...planFor(url, index), source: 'inventory', note: '' }))
  expect(rows.map((r) => r.expected_status)).toEqual(['200', '308', '308', '308', '308', '308'])
  const fetchImpl: FetchLike = async (url) => {
    const res = await request.get(url, { maxRedirects: 0 })
    return {
      status: res.status(),
      headers: { get: (n) => res.headers()[n.toLowerCase()] ?? null },
      text: () => res.text(),
    }
  }
  const result = await runRedirectCheck({
    base: new URL(baseURL as string),
    rows,
    fetchImpl,
    concurrency: 2,
  })
  expect(result.failures).toEqual([])
  expect(result.sitemapChecked).toBeGreaterThan(5)
})

test('redirect added in the admin works without a deploy and cannot hide a page', async ({
  request,
}) => {
  test.setTimeout(150_000)
  const init = await (await request.get('/api/users/init')).json()
  let account: { email: string; password: string } | null = null
  if (!init.initialized) {
    account = {
      email: `e2e-admin-${Date.now()}@example.test`,
      password: randomBytes(18).toString('hex'),
    }
    expect(
      (
        await request.post('/api/users/first-register', { data: { ...account, role: 'admin' } })
      ).ok(),
    ).toBe(true)
  } else {
    const email = process.env.E2E_ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL
    const password = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD
    account = email && password ? { email, password } : null
  }
  test.skip(!account, 'No admin account (set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD).')
  const login = await (await request.post('/api/users/login', { data: account })).json()
  const auth = { Authorization: `JWT ${login.token}` }

  // A published page cannot be a redirect source.
  const shadow = await request.post('/api/redirects', {
    data: { from: PRODUCT, to: CATEGORY },
    headers: auth,
  })
  expect(shadow.status()).toBe(400)

  const from = `/e2e-stara-akce-${Date.now()}`
  const created = await request.post('/api/redirects', {
    data: { from: `https://www.terrys.cz${from.toUpperCase()}/`, to: CATEGORY, note: 'e2e' },
    headers: auth,
  })
  expect(created.ok()).toBe(true)
  const { doc } = await created.json()
  expect(doc.from).toBe(from)

  try {
    // Immediately: the storefront's fallback (the proxy's table refreshes within a minute).
    const now = await location(request, from)
    expect(now.status).toBe(308)
    expect(path(now.location)).toBe(CATEGORY)
    // Within a minute the proxy has it too, with tracking parameters kept.
    await expect
      .poll(async () => path((await location(request, `${from}?utm_source=e2e`)).location), {
        timeout: 90_000,
        intervals: [2_000, 5_000],
      })
      .toBe(`${CATEGORY}?utm_source=e2e`)
  } finally {
    await request.delete(`/api/redirects/${doc.id}`, { headers: auth })
  }
})
