import type { CollectionSlug, Payload } from 'payload'

import { slugify } from '@/lib/slugify'

import { type BrandHit, checkBrandRules } from './brandCheck'
import type { CrawlEntry, CrawlState } from './crawlState'
import { flattenTree, extractArticle, extractCategory, extractMenuTree, extractProduct, extractRecipe, extractStaticPage, targetCollection } from './extract'
import { categoryImageCandidates, type MenuNode } from './extract/category'
import { extractRecipeDifficulties, type ExtractedArticle, type ExtractedPage, type ExtractedRecipe } from './extract/content'
import type { ExtractedProduct } from './extract/product'
import { type CacheReader, PoliteFetcher, sha1 } from './fetcher'
import type { InventoryRow } from './inventory'
import { MediaImporter } from './media'
import type { LexicalDocument, RichTextResult } from './richtext'
import { classifyUrl, toPathAndQuery } from './urls'

/**
 * Loads the crawled old site into Payload (local API). Used by `pnpm migrate:import`.
 *
 * Upsert key: `legacyUrl` (canonical path on the old site). Overwrite rule (also in CLAUDE.md):
 * - new legacyUrl → create (published; products without photo or price → draft + report),
 * - existing document, `migration.locked` → skipped,
 * - existing document edited in the admin since the last import (`updatedAt` more than
 *   EDIT_TOLERANCE_MS after `migration.importedAt`, or no `importedAt` at all = created by hand)
 *   → skipped and reported, unless `--force`,
 * - same source hash as last time → unchanged (no write),
 * - otherwise → updated. Slugs are set only on create, never changed by a re-import.
 */

export type ImportKind = 'categories' | 'products' | 'articles' | 'recipes' | 'pages'
export const IMPORT_KINDS: ImportKind[] = ['categories', 'products', 'articles', 'recipes', 'pages']

export interface ImportOptions {
  dryRun?: boolean
  only?: ImportKind[]
  limit?: number
  force?: boolean
  log?: (message: string) => void
  /** Source of cached pages/images (tests pass fixtures). Default: the crawl cache. */
  fetcher?: CacheReader
  /** How long after importedAt a change still counts as the import's own write. */
  editToleranceMs?: number
}

export type Action = 'created' | 'updated' | 'unchanged' | 'skipped-edited' | 'skipped-locked' | 'failed'

export interface ItemResult {
  kind: ImportKind
  legacyUrl: string
  title: string
  action: Action
  id?: number
  slug?: string
  draft?: boolean
  error?: string
  warnings: string[]
}

export interface ImportResult {
  startedAt: string
  finishedAt?: string
  dryRun: boolean
  options: { only?: ImportKind[]; limit?: number; force?: boolean }
  /** Pages found on the old site per kind (canonical, de-duplicated). */
  found: Record<ImportKind, number>
  items: ItemResult[]
  brandHits: { legacyUrl: string; title: string; hits: BrandHit[] }[]
  externalLinks: { url: string; usedOn: string }[]
  embeds: { url: string; usedOn: string }[]
  unknownPages: { url: string; status?: number; title?: string }[]
  /** Non-HTML files (PDF) under page URLs – not imported, to be moved by hand. */
  files: { url: string; contentType?: string }[]
  productsWithoutPrice: string[]
  productsWithoutImage: string[]
  portioning: { legacyUrl: string; title: string; options: string[] }[]
  availabilityTexts: Record<string, number>
  priceUnits: { legacyUrl: string; title: string; unit: string; price?: number; note?: string }[]
  unresolvedLinks: { from: string; to: string; field: string }[]
  createdCodeListItems: { collection: string; name: string }[]
  extraOldFields: Record<string, number>
  categoriesNotInMenu: string[]
  hiddenProducts: string[]
  mediaUploaded: number
  mediaReused: number
  mediaProblems: { url: string; usedOn: string; reason: string }[]
  fonts: string[]
  rubrics: Record<string, number>
  recipeNotes: { legacyUrl: string; notes: string[] }[]
  /** legacy path → { collection, slug } for the inventory. */
  targets: Record<string, { collection: string; slug: string }>
}

const EDIT_TOLERANCE_MS = 5_000

/**
 * Part of every source hash. Bump it when the mapping in this file changes, so the next run
 * re-imports documents whose old-site page did not change (edited / locked ones stay skipped).
 */
const LOADER_VERSION = 2

const DIFFICULTY: Record<string, 'easy' | 'medium' | 'hard'> = {
  snadné: 'easy',
  jednoduché: 'easy',
  střední: 'medium',
  'středně náročné': 'medium',
  náročné: 'hard',
}

/** Stable JSON (sorted keys) for hashing. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/** Meat type from the product name / category path (only when it is clear). */
export function deriveMeatType(text: string): string | undefined {
  const t = text.toLowerCase()
  if (/wagyu/.test(t)) return 'Wagyu'
  if (/tele(c|č)/.test(t)) return 'Telecí'
  if (/jehn(e|ě)/.test(t)) return 'Jehněčí'
  if (/(srn(c|č)|jelen|dan(c|č)|kan(c|č)|divo(c|č)|zv(e|ě)(r|ř)in)/.test(t)) return 'Zvěřina'
  if (/(ku(r|ř)ec|ku(r|ř)e\b|kachn|husí|husa|kr(u|ů)t|dr(u|ů)be(z|ž))/.test(t)) return 'Drůbež'
  if (/vep(r|ř)|mangalic|pras/.test(t)) return 'Vepřové'
  if (/hov(e|ě)z|angus|black angus|beef|steak|burger/.test(t)) return 'Hovězí'
  return undefined
}

function seoData(seo: { title?: string; description?: string }, warnings: string[], fallbackTitle: string) {
  const out: { title?: string; description?: string } = {}
  // Generic boilerplate of the old site ("… Maso je naše vášeň … SelaVita") is not worth keeping.
  const boilerplate = /maso je naše vášeň/i
  if (seo.title && seo.title !== fallbackTitle) {
    if (seo.title.length <= 70) out.title = seo.title
    else warnings.push(`SEO titulek má ${seo.title.length} znaků (max 70) – nepřenesen: „${seo.title}“`)
  }
  if (seo.description && !boilerplate.test(seo.description)) {
    if (seo.description.length <= 200) out.description = seo.description
    else warnings.push(`SEO popis má ${seo.description.length} znaků (max 200) – nepřenesen`)
  }
  return out
}

/** Readable message of a Payload error (validation errors list the fields). */
function errorMessage(error: unknown): string {
  const e = error as { message?: string; data?: { errors?: { path?: string; label?: string; message?: string }[] } }
  const fields = e?.data?.errors?.map((x) => `${x.label ?? x.path}: ${x.message}`).join('; ')
  return fields ? `${e.message ?? 'Chyba'} (${fields})` : (e?.message ?? String(error))
}

export async function runImport(payload: Payload, state: CrawlState, options: ImportOptions = {}): Promise<ImportResult> {
  const log = options.log ?? (() => {})
  const dryRun = Boolean(options.dryRun)
  const only = new Set(options.only?.length ? options.only : IMPORT_KINDS)
  const limit = options.limit && options.limit > 0 ? options.limit : Infinity
  const fetcher: CacheReader = options.fetcher ?? new PoliteFetcher({ offline: dryRun, log })
  const editTolerance = options.editToleranceMs ?? EDIT_TOLERANCE_MS
  const media = new MediaImporter(payload, fetcher, dryRun)
  const now = () => new Date().toISOString()

  const result: ImportResult = {
    startedAt: now(),
    dryRun,
    options: { only: options.only, limit: options.limit, force: options.force },
    found: { categories: 0, products: 0, articles: 0, recipes: 0, pages: 0 },
    items: [],
    brandHits: [],
    externalLinks: [],
    embeds: [],
    unknownPages: [],
    files: [],
    productsWithoutPrice: [],
    productsWithoutImage: [],
    portioning: [],
    availabilityTexts: {},
    priceUnits: [],
    unresolvedLinks: [],
    createdCodeListItems: [],
    extraOldFields: {},
    categoriesNotInMenu: [],
    hiddenProducts: [],
    mediaUploaded: 0,
    mediaReused: 0,
    mediaProblems: [],
    fonts: state.fonts ?? [],
    rubrics: {},
    recipeNotes: [],
    targets: {},
  }

  // ------------------------------------------------------------------ pages from the crawl
  const pagesByKind = new Map<ImportKind, { entry: CrawlEntry; html: string; path: string }[]>()
  const seenCanonical = new Set<string>()
  const categoryPages: { entry: CrawlEntry; html: string }[] = []
  const listingPages: { entry: CrawlEntry; html: string }[] = []
  for (const entry of Object.values(state.entries).sort((a, b) => a.url.localeCompare(b.url))) {
    if (entry.status !== 200) continue
    if (entry.type === 'file') {
      result.files.push({ url: toPathAndQuery(entry.url), contentType: entry.title })
      continue
    }
    if (entry.type === 'unknown') {
      result.unknownPages.push({ url: toPathAndQuery(entry.url), status: entry.status, title: entry.title })
      continue
    }
    const cached = await fetcher.readCachedPage(entry.url)
    if (!cached) continue
    if (entry.type === 'category' || entry.type === 'category-page') categoryPages.push({ entry, html: cached.body })
    if (/listing|academy/.test(entry.type)) listingPages.push({ entry, html: cached.body })
    const collection = targetCollection(entry.type)
    if (!collection) continue
    // Category pages declare ".../1" (first page) as canonical; the category itself is the URL
    // without the page number, which is also what menus and product breadcrumbs link to.
    const canonicalOf = (url: string) => {
      const p = toPathAndQuery(url)
      return entry.type === 'category' ? p.replace(/\/1$/, '') : p
    }
    const path = canonicalOf(entry.canonical ?? entry.url)
    if (seenCanonical.has(path)) continue
    // Aliases (another slug, ?catId=, ?page=) point to the canonical page; take the canonical one.
    if (path !== toPathAndQuery(entry.url) && state.entries[`https://www.terrys.cz${path}`]?.status === 200) continue
    seenCanonical.add(path)
    const kind = collection as ImportKind
    if (!pagesByKind.has(kind)) pagesByKind.set(kind, [])
    pagesByKind.get(kind)?.push({ entry, html: cached.body, path })
  }
  for (const kind of IMPORT_KINDS) result.found[kind] = pagesByKind.get(kind)?.length ?? 0

  // ------------------------------------------------------------------ helpers
  const record = (item: ItemResult) => {
    result.items.push(item)
    if (item.id !== undefined && item.slug) {
      const collection = item.kind
      result.targets[item.legacyUrl] = { collection, slug: item.slug }
    }
  }
  const collectRichTextInfo = (rt: RichTextResult, usedOn: string) => {
    for (const url of rt.externalLinks) result.externalLinks.push({ url, usedOn })
    for (const url of rt.embeds) result.embeds.push({ url, usedOn })
  }
  // Only texts that are imported are checked (the old generic SEO boilerplate is not imported).
  const seoText = (d?: string) => (d && !/maso je naše vášeň/i.test(d) ? d : '')
  const brand = (legacyUrl: string, title: string, texts: string[], struck: string[] = []) => {
    const hits = checkBrandRules([title, ...texts].join('\n'), struck)
    if (hits.length) result.brandHits.push({ legacyUrl, title, hits })
  }

  async function freeSlug(collection: CollectionSlug, base: string): Promise<string> {
    const clean = slugify(base) || 'polozka'
    for (let i = 1; i < 100; i++) {
      const candidate = i === 1 ? clean : `${clean}-${i}`
      const found = await payload.find({ collection, where: { slug: { equals: candidate } }, limit: 1, depth: 0, draft: true, overrideAccess: true })
      if (!found.docs.length) return candidate
    }
    return `${clean}-${Date.now()}`
  }

  /**
   * Create or update one document by legacyUrl following the overwrite rule.
   * `data` must not contain `migration`; `hashInput` is the extracted source data.
   */
  async function upsert(
    kind: ImportKind,
    legacyUrl: string,
    title: string,
    slugBase: string,
    build: () => Promise<Record<string, unknown>>,
    hashInput: unknown,
    opts: { drafts: boolean; draft?: () => boolean; warnings: string[] },
  ): Promise<ItemResult> {
    const collection = kind as CollectionSlug
    const sourceHash = sha1(stableStringify({ v: LOADER_VERSION, hashInput }))
    const base: ItemResult = { kind, legacyUrl, title, action: 'failed', warnings: opts.warnings }
    /** Builds the data; an import with failed images is marked so the next run retries it. */
    const buildData = async () => {
      const failuresBefore = media.failures
      const data = await build()
      const incomplete = media.failures > failuresBefore
      const draft = Boolean(opts.draft?.())
      return { data, draft, hash: incomplete ? `${sourceHash}:incomplete` : sourceHash }
    }
    try {
      const found = await payload.find({
        collection,
        where: { legacyUrl: { equals: legacyUrl } },
        limit: 2,
        depth: 0,
        draft: true,
        overrideAccess: true,
      })
      if (found.docs.length > 1) opts.warnings.push(`v databázi jsou ${found.totalDocs} dokumenty s touto původní URL – aktualizován první`)
      const existing = found.docs[0] as unknown as
        | { id: number; slug?: string; updatedAt: string; migration?: { locked?: boolean; importedAt?: string; sourceHash?: string } }
        | undefined

      if (existing) {
        const m = existing.migration ?? {}
        const out = { ...base, id: existing.id, slug: existing.slug }
        if (m.locked) return { ...out, action: 'skipped-locked' }
        const edited =
          !m.importedAt || new Date(existing.updatedAt).getTime() - new Date(m.importedAt).getTime() > editTolerance
        if (edited && !options.force) return { ...out, action: 'skipped-edited' }
        if (m.sourceHash === sourceHash && !options.force) return { ...out, action: 'unchanged' }
        if (dryRun) return { ...out, action: 'updated' }
        const { data, draft, hash } = await buildData()
        delete data.slug // never change a slug on re-import
        const updated = await payload.update({
          collection,
          id: existing.id,
          data: {
            ...data,
            ...(opts.drafts ? { _status: draft ? 'draft' : 'published' } : {}),
            migration: { locked: false, importedAt: now(), sourceHash: hash },
          } as never,
          draft: opts.drafts && draft ? true : undefined,
          overrideAccess: true,
          context: { migration: true },
        })
        return { ...out, action: 'updated', draft, slug: (updated as { slug?: string }).slug }
      }

      const slug = await freeSlug(collection, slugBase)
      if (dryRun) return { ...base, action: 'created', slug, id: -1 }
      const { data, draft, hash } = await buildData()
      const created = await payload.create({
        collection,
        data: {
          ...data,
          slug,
          ...(opts.drafts ? { _status: draft ? 'draft' : 'published' } : {}),
          migration: { locked: false, importedAt: now(), sourceHash: hash },
        } as never,
        draft: opts.drafts && draft ? true : undefined,
        overrideAccess: true,
        context: { migration: true },
      })
      return { ...base, action: 'created', draft, id: created.id as number, slug: (created as { slug?: string }).slug }
    } catch (error) {
      return { ...base, action: 'failed', error: errorMessage(error) }
    }
  }

  /** Writes relation fields of an already imported document (second pass). */
  async function setRelations(kind: ImportKind, id: number, data: Record<string, unknown>, draft?: boolean) {
    if (dryRun || id < 0) return
    try {
      const doc = (await payload.findByID({ collection: kind as CollectionSlug, id, depth: 0, draft: true, overrideAccess: true })) as unknown as {
        migration?: { sourceHash?: string; locked?: boolean }
      }
      await payload.update({
        collection: kind as CollectionSlug,
        id,
        data: {
          ...data,
          ...(kind === 'categories' ? {} : { _status: draft ? 'draft' : 'published' }),
          migration: { locked: false, importedAt: now(), sourceHash: doc.migration?.sourceHash },
        } as never,
        draft: draft ? true : undefined,
        overrideAccess: true,
        context: { migration: true },
      })
    } catch (error) {
      result.items.push({ kind, legacyUrl: `#${id}`, title: '', action: 'failed', error: `vazby: ${errorMessage(error)}`, warnings: [] })
    }
  }

  // Code lists (číselníky): find by name (case-insensitive) or create.
  const codeListCache = new Map<string, number | null>()
  async function codeList(collection: 'origins' | 'cuts' | 'meat-types' | 'usages' | 'shelf-lives', name: string | undefined, description?: string) {
    if (!name) return undefined
    const key = `${collection}:${name.toLowerCase()}`
    if (codeListCache.has(key)) return codeListCache.get(key) ?? undefined
    const found = await payload.find({
      collection,
      where: collection === 'cuts' ? { or: [{ name: { equals: name } }, { alternativeName: { equals: name } }] } : { name: { equals: name } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    let id = found.docs[0]?.id as number | undefined
    if (!id) {
      result.createdCodeListItems.push({ collection, name })
      if (!dryRun) {
        const created = await payload.create({
          collection,
          data: { name, ...(description ? { description } : {}) } as never,
          overrideAccess: true,
        })
        id = created.id as number
      }
    }
    codeListCache.set(key, id ?? null)
    return id
  }

  // ------------------------------------------------------------------ categories
  const categoryIds = new Map<number, number>() // old category id → new id
  const categoryProducts = new Map<number, Set<string>>() // old category id → product paths
  for (const { entry, html } of categoryPages) {
    const c = extractCategory(html, entry.url)
    if (!categoryProducts.has(c.oldId)) categoryProducts.set(c.oldId, new Set())
    for (const p of c.productLinks) categoryProducts.get(c.oldId)?.add(p)
  }
  // Category tree from the left menu (the most complete one found on any category page).
  let menu: MenuNode[] = []
  for (const { entry, html } of categoryPages) {
    const tree = extractMenuTree(html, entry.url)
    if (flattenTree(tree).length > flattenTree(menu).length) menu = tree
  }
  const menuByOldId = new Map<number, { node: MenuNode; parent?: MenuNode }>()
  const walkMenu = (nodes: MenuNode[], parent?: MenuNode) => {
    for (const node of nodes) {
      if (!menuByOldId.has(node.oldId)) menuByOldId.set(node.oldId, { node, parent })
      walkMenu(node.children, node)
    }
  }
  walkMenu(menu)

  if (only.has('categories') || only.has('products')) {
    const cats = (pagesByKind.get('categories') ?? []).map((p) => ({ p, c: extractCategory(p.html, p.entry.url) }))
    // Parents first, so children can point to them.
    cats.sort((a, b) => Number(Boolean(menuByOldId.get(a.c.oldId)?.parent)) - Number(Boolean(menuByOldId.get(b.c.oldId)?.parent)))
    let count = 0
    for (const { p, c } of cats) {
      // Existing categories are needed by products even when only products are imported.
      const writeAllowed = only.has('categories') && count < limit
      const menuInfo = menuByOldId.get(c.oldId)
      if (!menuInfo) result.categoriesNotInMenu.push(c.legacyUrl)
      const warnings = [...c.warnings]
      collectRichTextInfo(c.intro, c.legacyUrl)
      brand(c.legacyUrl, c.title, [c.intro.text, seoText(c.seo.description)], c.intro.struckText)
      const parentOld = menuInfo?.parent?.oldId
      const hashInput = { c: { ...c, productLinks: undefined, paginationLinks: undefined }, parentOld, order: menuInfo?.node.order }
      if (!writeAllowed) {
        const found = await payload.find({ collection: 'categories', where: { legacyUrl: { equals: c.legacyUrl } }, limit: 1, depth: 0, overrideAccess: true })
        if (found.docs[0]) categoryIds.set(c.oldId, found.docs[0].id)
        continue
      }
      count++
      const item = await upsert(
        'categories',
        c.legacyUrl,
        c.title,
        p.entry.url.split('/').pop()?.replace(/-\d+$/, '') ?? c.title,
        async () => {
          let image: number | null = null
          if (menuInfo) {
            for (const candidate of categoryImageCandidates(menuInfo.node)) {
              image = await media.ensure(candidate, c.title, c.legacyUrl)
              if (image !== null) break
            }
          }
          return {
            title: c.title,
            intro: await media.resolveRichText(c.intro.doc, c.legacyUrl),
            image: image ?? undefined,
            parent: parentOld !== undefined ? categoryIds.get(parentOld) : undefined,
            menuOrder: menuInfo ? (menuInfo.node.order + 1) * 10 : 100,
            seo: seoData(c.seo, warnings, c.title),
            legacyUrl: c.legacyUrl,
          }
        },
        hashInput,
        { drafts: false, warnings },
      )
      if (item.id !== undefined) categoryIds.set(c.oldId, item.id)
      record(item)
    }
    log(`Kategorie: ${count}`)
  }

  // ------------------------------------------------------------------ products
  const productIdsByOldId = new Map<number, number>()
  const productPathsByOldId = new Map<number, string>()
  const productRelations: { id: number; p: ExtractedProduct; draft: boolean }[] = []
  const allListedProducts = new Set<string>()
  for (const set of categoryProducts.values()) for (const p of set) allListedProducts.add(p)
  const oldIdOf = (path: string) => Number(/-detail-(\d+)/.exec(path)?.[1])
  const listedOldIds = new Set([...allListedProducts].map(oldIdOf))

  const products = (pagesByKind.get('products') ?? []).map((p) => ({ p, x: extractProduct(p.html, p.entry.url) }))
  for (const { x } of products) productPathsByOldId.set(x.oldId, x.legacyUrl)

  if (only.has('products')) {
    let count = 0
    for (const { x } of products) {
      if (count >= limit) break
      count++
      const warnings = [...x.warnings]
      result.availabilityTexts[x.availabilityText ?? '(prázdné)'] = (result.availabilityTexts[x.availabilityText ?? '(prázdné)'] ?? 0) + 1
      if (x.portioningOptions.length) result.portioning.push({ legacyUrl: x.legacyUrl, title: x.title, options: x.portioningOptions })
      result.priceUnits.push({ legacyUrl: x.legacyUrl, title: x.title, unit: x.priceUnit, price: x.price, note: x.priceNote })
      for (const [label, value] of [
        ['Zrání masa', x.agingText],
        ['Štítek', x.labels.join(', ')],
        ['Trvanlivost', x.shelfLifeText],
        ['Skladování', x.storageText],
        ['Velikost kusu', x.pieceSizeText],
      ] as const) {
        if (value) result.extraOldFields[`${label}: ${value}`] = (result.extraOldFields[`${label}: ${value}`] ?? 0) + 1
      }
      collectRichTextInfo(x.shortDescription, x.legacyUrl)
      collectRichTextInfo(x.description, x.legacyUrl)
      const struck = [...x.shortDescription.struckText, ...x.description.struckText, ...x.originalPriceDiffers.map((o) => `${o.variant}: ${o.original} Kč → ${o.price} Kč`)]
      brand(x.legacyUrl, x.title, [x.shortDescription.text, x.description.text, seoText(x.seo.description)], struck)
      if (x.originalPriceDiffers.length) {
        result.brandHits.push({
          legacyUrl: x.legacyUrl,
          title: x.title,
          hits: x.originalPriceDiffers.map((o) => ({ rule: 'preskrtnuta-cena' as const, snippet: `„původní cena“ ${o.original} Kč, prodejní ${o.price} Kč (${o.variant})` })),
        })
      }

      const notListed = !listedOldIds.has(x.oldId) || x.hiddenOnOldSite
      if (notListed) result.hiddenProducts.push(x.legacyUrl)
      if (x.price === undefined) result.productsWithoutPrice.push(x.legacyUrl)
      if (!x.images.length) result.productsWithoutImage.push(x.legacyUrl)

      const categoryOldIds = new Set<number>()
      for (const [catOld, set] of categoryProducts) if ([...set].some((path) => oldIdOf(path) === x.oldId)) categoryOldIds.add(catOld)
      if (x.categoryOldId) categoryOldIds.add(x.categoryOldId)
      const hashInput = { x: { ...x, warnings: undefined }, categoryOldIds: [...categoryOldIds].sort(), notListed }
      let mediaIds: number[] = []
      let missingImage = !x.images.length

      const item = await upsert(
        'products',
        x.legacyUrl,
        x.title,
        x.legacyUrl.split('/').pop()?.replace(/-detail-\d+$/, '') ?? x.title,
        async () => {
          mediaIds = []
          for (const [i, url] of x.images.entries()) {
            const id = await media.ensure(url, i === 0 ? x.title : `${x.title} – foto ${i + 1}`, x.legacyUrl)
            if (id !== null && !mediaIds.includes(id)) mediaIds.push(id)
          }
          missingImage = mediaIds.length === 0
          const shelfName = [x.chilledOrFrozen, x.shelfLifeText ? `trvanlivost ${x.shelfLifeText}` : undefined, x.storageText].filter(Boolean).join(', ')
          return {
            title: x.title,
            shortDescription: await media.resolveRichText(x.shortDescription.doc, x.legacyUrl),
            description: await media.resolveRichText(x.description.doc, x.legacyUrl),
            mainImage: mediaIds[0],
            gallery: mediaIds.slice(1),
            price: x.price,
            priceUnit: x.priceUnit,
            variants: x.variants.map((v) => ({ label: v.label, kind: v.kind, weightGrams: v.weightGrams })),
            meatType: await codeList('meat-types', deriveMeatType(`${x.title} ${x.categoryPath ?? ''}`)),
            cut: await codeList('cuts', x.cutText),
            origin: await codeList('origins', x.originText),
            usages: (await Promise.all(x.usages.map((u) => codeList('usages', u)))).filter((id): id is number => typeof id === 'number'),
            shelfLife: await codeList('shelf-lives', shelfName || undefined, x.storageText ? `Skladování: ${x.storageText}` : undefined),
            brand: x.supplierText,
            categories: [...categoryOldIds].map((id) => categoryIds.get(id)).filter((id): id is number => typeof id === 'number'),
            sku: String(x.oldId),
            availability: notListed ? 'hidden' : x.availability,
            seo: seoData(x.seo, warnings, x.title),
            legacyUrl: x.legacyUrl,
          }
        },
        hashInput,
        { drafts: true, draft: () => x.price === undefined || missingImage, warnings },
      )
      record(item)
      if (missingImage && x.images.length) result.productsWithoutImage.push(`${x.legacyUrl} (obrázky nešly nahrát)`)
      if (item.id !== undefined) {
        productIdsByOldId.set(x.oldId, item.id)
        if (item.action === 'created' || item.action === 'updated') productRelations.push({ id: item.id, p: x, draft: Boolean(item.draft) })
      }
      if (count % 25 === 0) log(`Produkty: ${count}/${Math.min(products.length, limit)}`)
    }
  }
  // Products imported earlier (needed for relations when only articles/recipes run).
  if (!only.has('products') || limit !== Infinity) {
    const all = await payload.find({ collection: 'products', where: { legacyUrl: { exists: true } }, limit: 0, pagination: false, depth: 0, draft: true, overrideAccess: true, select: { legacyUrl: true } })
    for (const doc of all.docs as { id: number; legacyUrl?: string | null }[]) {
      const old = oldIdOf(doc.legacyUrl ?? '')
      if (old && !productIdsByOldId.has(old)) productIdsByOldId.set(old, doc.id)
    }
  }
  const productId = (path: string, from: string, field: string) => {
    const id = productIdsByOldId.get(oldIdOf(path))
    if (!id || id < 0) {
      if (!dryRun) result.unresolvedLinks.push({ from, to: path, field })
      return undefined
    }
    return id
  }

  // ------------------------------------------------------------------ recipes
  const recipeIdsByPath = new Map<string, number>()
  const difficulties = new Map<string, string>()
  for (const { entry, html } of listingPages) for (const [k, v] of extractRecipeDifficulties(html, entry.url)) difficulties.set(k, v)
  const recipeRelations: { id: number; r: ExtractedRecipe }[] = []
  if (only.has('recipes')) {
    let count = 0
    for (const { p } of (pagesByKind.get('recipes') ?? []).map((p) => ({ p }))) {
      if (count >= limit) break
      count++
      const r = extractRecipe(p.html, p.entry.url)
      const warnings = [...r.warnings]
      result.recipeNotes.push({ legacyUrl: r.legacyUrl, notes: r.warnings })
      if (r.rubric) result.rubrics[`recept: ${r.rubric}`] = (result.rubrics[`recept: ${r.rubric}`] ?? 0) + 1
      collectRichTextInfo(r.content, r.legacyUrl)
      brand(r.legacyUrl, r.title, [r.perex ?? '', r.content.text, ...r.steps.map((s) => s.text), ...r.ingredients.map((i) => i.name)], r.content.struckText)
      const difficultyText = difficulties.get(r.legacyUrl.replace(/\?.*$/, ''))
      const difficulty = difficultyText ? DIFFICULTY[difficultyText.toLowerCase()] : undefined
      if (difficultyText && !difficulty) warnings.push(`neznámá obtížnost „${difficultyText}“`)
      const item = await upsert(
        'recipes',
        r.legacyUrl,
        r.title,
        r.legacyUrl.split('/').pop()?.replace(/-detail-\d+$/, '') ?? r.title,
        async () => {
          const steps = []
          for (const s of r.steps) {
            const image = s.image ? await media.ensure(s.image, r.title, r.legacyUrl) : null
            steps.push({ text: s.text, image: image ?? undefined })
          }
          return {
            title: r.title,
            perex: r.perex,
            coverImage: (r.coverImage ? await media.ensure(r.coverImage, r.title, r.legacyUrl) : null) ?? undefined,
            ingredients: r.ingredients,
            steps,
            content: await media.resolveRichText(r.content.doc, r.legacyUrl),
            difficulty,
            seo: seoData(r.seo, warnings, r.title),
            legacyUrl: r.legacyUrl,
          }
        },
        { r: { ...r, warnings: undefined }, difficulty },
        { drafts: true, warnings },
      )
      record(item)
      if (item.id !== undefined) {
        recipeIdsByPath.set(r.legacyUrl, item.id)
        if (item.action === 'created' || item.action === 'updated') recipeRelations.push({ id: item.id, r })
      }
    }
    log(`Recepty: ${count}`)
  }
  {
    const all = await payload.find({ collection: 'recipes', where: { legacyUrl: { exists: true } }, limit: 0, pagination: false, depth: 0, draft: true, overrideAccess: true, select: { legacyUrl: true } })
    for (const doc of all.docs as { id: number; legacyUrl?: string | null }[]) if (doc.legacyUrl && !recipeIdsByPath.has(doc.legacyUrl)) recipeIdsByPath.set(doc.legacyUrl, doc.id)
  }

  // ------------------------------------------------------------------ articles
  const articleRelations: { id: number; a: ExtractedArticle }[] = []
  if (only.has('articles')) {
    let count = 0
    for (const p of pagesByKind.get('articles') ?? []) {
      if (count >= limit) break
      count++
      const a = extractArticle(p.html, p.entry.url)
      const warnings = [...a.warnings]
      if (a.rubric) result.rubrics[`${a.kind === 'magazine' ? 'magazín' : 'academy'}: ${a.rubric}`] = (result.rubrics[`${a.kind === 'magazine' ? 'magazín' : 'academy'}: ${a.rubric}`] ?? 0) + 1
      if (a.kind === 'glossary') result.rubrics['slovník pojmů (importováno do Terrys Academy)'] = (result.rubrics['slovník pojmů (importováno do Terrys Academy)'] ?? 0) + 1
      collectRichTextInfo(a.content, a.legacyUrl)
      brand(a.legacyUrl, a.title, [a.content.text, seoText(a.seo.description)], a.content.struckText)
      const perex = a.seo.description && !/maso je naše vášeň/i.test(a.seo.description) ? a.seo.description : undefined
      const item = await upsert(
        'articles',
        a.legacyUrl,
        a.title,
        a.legacyUrl.split('/').pop()?.replace(/-detail-\d+$/, '') ?? a.title,
        async () => ({
          title: a.title,
          section: a.kind === 'magazine' ? 'magazine' : 'academy',
          perex,
          coverImage: (a.coverImage ? await media.ensure(a.coverImage, a.title, a.legacyUrl) : null) ?? undefined,
          content: await media.resolveRichText(a.content.doc, a.legacyUrl),
          authorName: a.authorName,
          publishedAt: a.publishedAt,
          seo: seoData(a.seo, warnings, a.title),
          legacyUrl: a.legacyUrl,
        }),
        { a: { ...a, warnings: undefined } },
        { drafts: true, warnings },
      )
      record(item)
      if (item.id !== undefined && (item.action === 'created' || item.action === 'updated')) articleRelations.push({ id: item.id, a })
    }
    log(`Články: ${count}`)
  }

  // ------------------------------------------------------------------ static pages
  if (only.has('pages')) {
    let count = 0
    for (const p of pagesByKind.get('pages') ?? []) {
      if (count >= limit) break
      count++
      const s: ExtractedPage = extractStaticPage(p.html, p.entry.url)
      const warnings = [...s.warnings]
      collectRichTextInfo(s.content, s.legacyUrl)
      brand(s.legacyUrl, s.title, [s.content.text], s.content.struckText)
      const item = await upsert(
        'pages',
        s.legacyUrl,
        s.title,
        s.legacyUrl.split('/').filter(Boolean).pop()?.replace(/\.aspx$/, '').replace(/-detail-\d+$/, '') || s.title,
        async () => ({
          title: s.title,
          content: await media.resolveRichText(s.content.doc, s.legacyUrl),
          seo: seoData(s.seo, warnings, s.title),
          legacyUrl: s.legacyUrl,
        }),
        { s: { ...s, warnings: undefined } },
        { drafts: true, warnings },
      )
      record(item)
    }
    log(`Stránky: ${count}`)
  }

  // ------------------------------------------------------------------ relations (second pass)
  for (const { id, p, draft } of productRelations) {
    const related = p.relatedProducts.map((path) => productId(path, p.legacyUrl, 'relatedProducts')).filter((x): x is number => Boolean(x) && x !== id)
    const recipes = p.relatedRecipes
      .map((path) => {
        const rid = recipeIdsByPath.get(path)
        if (!rid && !dryRun) result.unresolvedLinks.push({ from: p.legacyUrl, to: path, field: 'relatedRecipes' })
        return rid
      })
      .filter((x): x is number => typeof x === 'number' && x > 0)
    if (related.length || recipes.length) await setRelations('products', id, { relatedProducts: related, relatedRecipes: recipes }, draft)
  }
  for (const { id, r } of recipeRelations) {
    const related = r.relatedProducts.map((path) => productId(path, r.legacyUrl, 'relatedProducts')).filter((x): x is number => Boolean(x))
    if (related.length) await setRelations('recipes', id, { relatedProducts: [...new Set(related)] })
  }
  for (const { id, a } of articleRelations) {
    const related = a.relatedProducts.map((path) => productId(path, a.legacyUrl, 'relatedProducts')).filter((x): x is number => Boolean(x))
    if (related.length) await setRelations('articles', id, { relatedProducts: [...new Set(related)] })
  }

  if (!dryRun) await media.finalizeSharedAlts()
  result.mediaUploaded = media.uploaded
  result.mediaReused = media.reused
  result.mediaProblems = media.problems
  result.finishedAt = now()
  return result
}

/** Fills new_collection / new_slug of inventory rows from the import result (aliases too). */
export function applyTargetsToInventory(rows: InventoryRow[], targets: ImportResult['targets']): InventoryRow[] {
  const byProductId = new Map<number, { collection: string; slug: string }>()
  for (const [path, t] of Object.entries(targets)) {
    const m = /\/produkty\/.+-detail-(\d+)/.exec(path)
    if (m) byProductId.set(Number(m[1]), t)
  }
  const byPath = new Map(Object.entries(targets))
  return rows.map((row) => {
    const candidates = [row.old_url, row.canonical, row.redirect_to, row.old_url.replace(/\?.*$/, '')].filter(Boolean)
    let target = candidates.map((c) => byPath.get(c)).find(Boolean)
    if (!target) {
      const cls = classifyUrl(`https://www.terrys.cz${row.redirect_to || row.old_url}`)
      if (cls.type === 'product' && cls.oldId) target = byProductId.get(cls.oldId)
      if ((cls.type === 'category' || cls.type === 'category-page') && cls.oldId) {
        target = Object.entries(targets).find(([p]) => new RegExp(`^/produkty/.+-${cls.oldId}$`).test(p))?.[1]
      }
    }
    return target ? { ...row, new_collection: target.collection, new_slug: target.slug } : row
  })
}

/** Rich text documents (for tests). */
export type { LexicalDocument }
