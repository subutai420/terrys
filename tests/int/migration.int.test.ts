import fs from 'fs'
import os from 'os'
import path from 'path'

import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FIXTURES_DIR } from '@/migration/config'
import type { CrawlEntry, CrawlState } from '@/migration/crawlState'
import type { CacheReader, CachedBinary, CachedPage } from '@/migration/fetcher'
import { type ImportResult, runImport } from '@/migration/loader'
import type { PageType } from '@/migration/urls'

import { getTestPayload } from './helpers'

/**
 * Loader idempotency: the importer runs against saved pages of the old site (migration/fixtures)
 * instead of the crawl cache. Importing twice must not create duplicates, and a document edited
 * in the admin after the import must survive the next import.
 */

const FIXTURES: [string, PageType][] = [
  ['category-rib-eye.html', 'category'],
  ['product-rib-eye.html', 'product'],
  ['product-flank-1ks.html', 'product'],
  ['product-omacka-ks.html', 'product'],
  ['product-hidden.html', 'product'],
  ['article-steak.html', 'article'],
  ['glossary-rib-eye.html', 'glossary-term'],
  ['recipe-burger.html', 'recipe'],
  ['static-doprava.html', 'static'],
]

/** Fake cache: fixture HTML for pages, one generated JPEG per image URL (distinct colours). */
function fixtureSource(tmpDir: string): { state: CrawlState; reader: CacheReader } {
  const pages = new Map<string, CachedPage>()
  const entries: Record<string, CrawlEntry> = {}
  for (const [file, type] of FIXTURES) {
    const body = fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8')
    const url = /fixture: (\S+)/.exec(body)?.[1] as string
    pages.set(url, { url, status: 200, contentType: 'text/html', fetchedAt: '', body })
    entries[url] = { url, type, status: 200, title: file }
  }
  let colour = 0
  const images = new Map<string, CachedBinary>()
  const reader: CacheReader = {
    readCachedPage: async (url) => pages.get(url) ?? null,
    readCachedBinary: async (url) => images.get(url) ?? null,
    getBinary: async (url) => {
      const known = images.get(url)
      if (known) return known
      const file = path.join(tmpDir, `img-${images.size}.jpg`)
      const c = (colour += 37) % 256
      await sharp({
        create: { width: 40, height: 30, channels: 3, background: { r: c, g: 80, b: 255 - c } },
      })
        .jpeg()
        .toFile(file)
      const meta: CachedBinary = {
        url,
        status: 200,
        contentType: 'image/jpeg',
        fetchedAt: '',
        file,
      }
      images.set(url, meta)
      return meta
    },
  }
  return { state: { startedAt: '', entries, images: {} }, reader }
}

const actions = (r: ImportResult) => {
  const out: Record<string, number> = {}
  for (const i of r.items) out[i.action] = (out[i.action] ?? 0) + 1
  return out
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('migration loader (idempotent upsert by legacyUrl)', () => {
  let payload: Payload
  let tmpDir: string
  let source: ReturnType<typeof fixtureSource>
  const run = (extra: { force?: boolean } = {}) =>
    runImport(payload, source.state, { fetcher: source.reader, editToleranceMs: 1000, ...extra })
  const count = async (
    collection: 'products' | 'categories' | 'articles' | 'recipes' | 'pages' | 'media',
  ) => (await payload.count({ collection, overrideAccess: true })).totalDocs

  beforeAll(async () => {
    payload = await getTestPayload()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrys-migration-'))
    source = fixtureSource(tmpDir)
  })

  // The integration test files share one database: remove what this file imported, so other
  // files (e.g. code-list slugs in access.int.test.ts) do not depend on the order of the files.
  const createdCodeLists: { collection: string; name: string }[] = []
  afterAll(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    for (const collection of ['articles', 'recipes', 'pages', 'products', 'categories'] as const) {
      await payload.delete({
        collection,
        where: { legacyUrl: { exists: true } },
        overrideAccess: true,
      })
    }
    for (const { collection, name } of createdCodeLists) {
      await payload.delete({
        collection: collection as 'cuts',
        where: { name: { equals: name } },
        overrideAccess: true,
      })
    }
  })

  it('imports products, category, articles, recipe and page on the first run', async () => {
    const result = await run()
    createdCodeLists.push(...result.createdCodeListItems)
    expect(result.items.filter((i) => i.action === 'failed')).toEqual([])
    expect(actions(result)).toEqual({ created: 9 })

    const { docs } = await payload.find({
      collection: 'products',
      where: { legacyUrl: { equals: '/produkty/argentinsky-hovezi-rib-eye-detail-406' } },
      depth: 1,
      overrideAccess: true,
    })
    const ribEye = docs[0]
    expect(ribEye.title).toBe('Argentinský hovězí Rib Eye')
    expect(ribEye.slug).toBe('argentinsky-hovezi-rib-eye')
    expect(ribEye._status).toBe('published')
    expect(ribEye.price).toBe(990)
    expect(ribEye.priceUnit).toBe('kg')
    expect(ribEye.sku).toBe('406')
    expect(ribEye.variants?.map((v) => v.weightGrams)).toEqual([
      250, 500, 750, 1000, 1500, 2000, 2500,
    ])
    expect(typeof ribEye.mainImage === 'object' && ribEye.mainImage?.alt).toBe(
      'Argentinský hovězí Rib Eye',
    )
    expect(typeof ribEye.origin === 'object' && ribEye.origin?.name).toBe('Argentina')
    expect(typeof ribEye.meatType === 'object' && ribEye.meatType?.name).toBe('Hovězí')
    expect(ribEye.categories?.map((c) => (typeof c === 'object' ? c.legacyUrl : c))).toEqual([
      '/produkty/vysoky-rostenec-rib-eye-106',
    ])
    expect(ribEye.migration?.importedAt).toBeTruthy()

    // A product switched off on the old site: hidden draft (no price, no photo).
    const hidden = await payload.find({
      collection: 'products',
      where: { sku: { equals: '28803' } },
      draft: true,
      overrideAccess: true,
    })
    expect(hidden.docs[0].availability).toBe('hidden')
    expect(hidden.docs[0]._status).toBe('draft')

    const glossary = await payload.find({
      collection: 'articles',
      where: { legacyUrl: { equals: '/pojmy/rib-eye-detail-775' } },
      overrideAccess: true,
    })
    expect(glossary.docs[0].section).toBe('academy')
    // Related product exists in this import → linked in the second pass.
    expect(glossary.docs[0].relatedProducts?.length).toBe(1)
  })

  it('creates no duplicates and writes nothing on a second run', async () => {
    const before = {
      products: await count('products'),
      categories: await count('categories'),
      articles: await count('articles'),
      recipes: await count('recipes'),
      pages: await count('pages'),
      media: await count('media'),
    }
    const result = await run()
    expect(actions(result)).toEqual({ unchanged: 9 })
    expect({
      products: await count('products'),
      categories: await count('categories'),
      articles: await count('articles'),
      recipes: await count('recipes'),
      pages: await count('pages'),
      media: await count('media'),
    }).toEqual(before)
  })

  it('keeps admin edits, honours the lock and overwrites edits only with --force', async () => {
    await sleep(1200) // later than the edit tolerance after the import
    const product = (
      await payload.find({
        collection: 'products',
        where: { sku: { equals: '406' } },
        overrideAccess: true,
      })
    ).docs[0]
    await payload.update({
      collection: 'products',
      id: product.id,
      data: { title: 'Rib Eye upravený v administraci' },
      overrideAccess: true,
    })
    const page = (await payload.find({ collection: 'pages', limit: 1, overrideAccess: true }))
      .docs[0]
    await payload.update({
      collection: 'pages',
      id: page.id,
      data: { migration: { ...page.migration, locked: true } },
      overrideAccess: true,
    })

    const third = await run()
    expect(third.items.find((i) => i.legacyUrl === product.legacyUrl)?.action).toBe(
      'skipped-edited',
    )
    expect(third.items.find((i) => i.legacyUrl === page.legacyUrl)?.action).toBe('skipped-locked')
    const kept = await payload.findByID({
      collection: 'products',
      id: product.id,
      overrideAccess: true,
    })
    expect(kept.title).toBe('Rib Eye upravený v administraci')

    const forced = await run({ force: true })
    expect(forced.items.find((i) => i.legacyUrl === product.legacyUrl)?.action).toBe('updated')
    expect(forced.items.find((i) => i.legacyUrl === page.legacyUrl)?.action).toBe('skipped-locked')
    const restored = await payload.findByID({
      collection: 'products',
      id: product.id,
      overrideAccess: true,
    })
    expect(restored.title).toBe('Argentinský hovězí Rib Eye')
    const imported = await payload.count({
      collection: 'products',
      where: { legacyUrl: { exists: true } },
      overrideAccess: true,
    })
    expect(imported.totalDocs).toBe(4)
  })
})
