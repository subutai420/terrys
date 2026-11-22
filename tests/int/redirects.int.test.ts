import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { decideRedirect, legacyIndex, splitTarget } from '@/lib/redirects/legacy'
import { type FetchLike, runRedirectCheck } from '@/migration/redirectCheck'
import { planFor, type PlanRow } from '@/migration/redirectPlan'
import { buildLegacyIndexData } from '@/redirects/legacyIndex'

import { createTestImage, createUser, getTestPayload, type TestUser } from './helpers'

/**
 * Stage 8b against Payload + PostgreSQL (throwaway database): the redirect table built from the
 * database (public pages, hidden products → category, admin redirects), the validation of the
 * `redirects` collection (no shadowing, no chains, no missing targets, normalised input), access
 * per role, and the checker logic run over a sample against a site answering from that table.
 */

let payload: Payload
let staff: TestUser
let butcher: TestUser
const created: { collection: 'products' | 'categories' | 'redirects' | 'media'; id: number }[] = []
const ctx = { disableRevalidate: true }

const CATEGORY = '/produkty/presmerovani-test-kategorie-9001'
const PRODUCT = '/produkty/presmerovani-test-produkt-detail-9101'
const DRAFT = '/produkty/presmerovani-test-koncept-detail-9102'

beforeAll(async () => {
  payload = await getTestPayload()
  staff = await createUser(payload, 'staff', `redir-staff-${Date.now()}@example.test`)
  butcher = await createUser(payload, 'butcher', `redir-butcher-${Date.now()}@example.test`)
  const image = await createTestImage(payload, 'Přesměrování test')
  created.push({ collection: 'media', id: image.id })
  const category = await payload.create({
    collection: 'categories',
    data: { title: 'Přesměrování kategorie', legacyUrl: CATEGORY },
    context: ctx,
  })
  created.push({ collection: 'categories', id: category.id })
  const base = {
    mainImage: image.id,
    vatRate: '12',
    price: 100,
    priceUnit: 'piece',
    availability: 'in-stock',
    categories: [category.id],
  }
  const published = await payload.create({
    collection: 'products',
    data: {
      ...base,
      title: 'Přesměrování produkt',
      legacyUrl: PRODUCT,
      _status: 'published',
    } as never,
    context: ctx,
  })
  const draft = await payload.create({
    collection: 'products',
    data: { ...base, title: 'Přesměrování koncept', legacyUrl: DRAFT, _status: 'draft' } as never,
    draft: true,
    context: ctx,
  })
  created.push(
    { collection: 'products', id: published.id },
    { collection: 'products', id: draft.id },
  )
})

afterAll(async () => {
  if (!payload) return
  for (const { collection, id } of created.reverse()) {
    await payload
      .delete({ collection, id, overrideAccess: true, context: ctx })
      .catch(() => undefined)
  }
  await payload.delete({
    collection: 'users',
    where: { email: { like: 'redir-' } },
    overrideAccess: true,
  })
})

const createRedirect = (
  data: { from: string; to: string; active?: boolean },
  user: TestUser = staff,
) => payload.create({ collection: 'redirects', data, overrideAccess: false, user, context: ctx })

describe('redirect table from the database', () => {
  it('lists public pages and sends a draft product to its category', async () => {
    const data = await buildLegacyIndexData(payload)
    expect(data.served).toContain(PRODUCT)
    expect(data.served).toContain(CATEGORY)
    expect(data.served).not.toContain(DRAFT)
    expect(data.retired[DRAFT]).toBe(CATEGORY)
    const index = legacyIndex(data)
    expect(
      decideRedirect('/produkty/jiny-slug-detail-9101', '?utm_source=x', index)?.location,
    ).toBe(`${PRODUCT}?utm_source=x`)
    expect(decideRedirect(DRAFT, '', index)?.location).toBe(CATEGORY)
  })
})

describe('redirects collection', () => {
  it('normalises the input and is applied by the table', async () => {
    const doc = await createRedirect({
      from: 'https://www.terrys.cz/Stara-Akce-Presmerovani/',
      to: `${PRODUCT}?varianta=x`,
    })
    created.push({ collection: 'redirects', id: doc.id })
    expect(doc.from).toBe('/stara-akce-presmerovani')
    const index = legacyIndex(await buildLegacyIndexData(payload))
    expect(decideRedirect('/stara-akce-presmerovani', '?gclid=1', index)?.location).toBe(
      `${PRODUCT}?varianta=x&gclid=1`,
    )
  })

  it('refuses shadowing a page, chains, missing targets, duplicates and self-redirects', async () => {
    await expect(createRedirect({ from: PRODUCT, to: CATEGORY })).rejects.toThrow(/Stará adresa/)
    await expect(
      createRedirect({ from: '/presmerovani-x', to: '/produkty/jiny-slug-detail-9101' }),
    ).rejects.toThrow(/Nová adresa/)
    await expect(
      createRedirect({ from: '/presmerovani-y', to: '/neexistuje-presmerovani' }),
    ).rejects.toThrow(/Nová adresa/)
    await expect(
      createRedirect({ from: '/stara-akce-presmerovani', to: CATEGORY }),
    ).rejects.toThrow(/Stará adresa/)
    await expect(createRedirect({ from: '/presmerovani-z?page=1', to: CATEGORY })).rejects.toThrow(
      /Stará adresa/,
    )
    await expect(
      createRedirect({ from: '/presmerovani-ext', to: 'https://example.com/' }),
    ).rejects.toThrow(/Nová adresa/)
  })

  it('an inactive redirect is not validated against the site and not applied', async () => {
    const doc = await createRedirect({
      from: '/presmerovani-vypnute',
      to: '/zatim-neexistuje',
      active: false,
    })
    created.push({ collection: 'redirects', id: doc.id })
    const data = await buildLegacyIndexData(payload)
    expect(data.redirects['/presmerovani-vypnute']).toBeUndefined()
  })

  it('access: editors only', async () => {
    await expect(
      createRedirect({ from: '/presmerovani-reznik', to: CATEGORY }, butcher),
    ).rejects.toThrow()
    await expect(
      payload.find({ collection: 'redirects', overrideAccess: false, user: butcher }),
    ).rejects.toThrow()
    await expect(payload.find({ collection: 'redirects', overrideAccess: false })).rejects.toThrow()
    const list = await payload.find({ collection: 'redirects', overrideAccess: false, user: staff })
    expect(list.totalDocs).toBeGreaterThan(0)
  })
})

describe('checker over a sample', () => {
  it('passes against a site answering from the database table', async () => {
    const index = legacyIndex(await buildLegacyIndexData(payload))
    const site: FetchLike = async (url) => {
      const u = new URL(url)
      const decision = decideRedirect(u.pathname, u.search, index)
      const status = decision ? 308 : index.isServed(splitTarget(u.pathname).path) ? 200 : 404
      return {
        status,
        headers: {
          get: (name: string) => (name === 'location' && decision ? decision.location : null),
        },
        text: async () => '',
      }
    }
    const rows: PlanRow[] = [
      PRODUCT,
      `${CATEGORY}/2`,
      '/produkty/stary-slug-detail-9101?list=hide',
      DRAFT,
      '/stara-akce-presmerovani',
      '/magazin/novinky-21',
    ].map((url) => ({ ...planFor(url, index), source: 'inventory', note: '' }))
    expect(rows.map((r) => r.expected_status)).toEqual(['200', '308', '308', '308', '308', '308'])
    const result = await runRedirectCheck({
      base: new URL('http://localhost:3000'),
      rows,
      fetchImpl: site,
      sitemap: false,
    })
    expect(result.failures).toEqual([])
  })
})
