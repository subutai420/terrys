import path from 'path'
import type { CollectionSlug, Payload } from 'payload'
import { fileURLToPath } from 'url'

import { DEFAULT_PRICE_NOTICE } from '@/globals/Settings'
import { slugify } from '@/lib/slugify'

import { seedDelivery } from './delivery'
import { seedDemoOrders } from './orders'
import { seedVouchers } from './vouchers'

import {
  categories,
  cuts,
  meatTypes,
  origins,
  pages,
  products,
  type SeedCodeListItem,
  shelfLives,
  TODO,
  usages,
} from './data'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const ASSETS_DIR = path.resolve(dirname, 'assets')

/** Minimal Lexical rich text document made of plain paragraphs. */
function richText(...paragraphs: string[]) {
  return {
    root: {
      type: 'root',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      children: paragraphs.map((text) => ({
        type: 'paragraph',
        format: '' as const,
        indent: 0,
        version: 1,
        direction: 'ltr' as const,
        textFormat: 0,
        textStyle: '',
        children: [
          { type: 'text', text, format: 0, style: '', mode: 'normal', detail: 0, version: 1 },
        ],
      })),
    },
  }
}

type Log = (message: string) => void

/**
 * Parts of the seed that can be run alone with `pnpm seed --only=a,b`. Useful on a database that
 * already holds the imported catalog (stage 8), where the demo products would duplicate real ones:
 * `pnpm seed --only=settings,locations,delivery`.
 */
export const SEED_PARTS = [
  'catalog', // code lists, categories, the 12 demo Rib Eye products
  'content', // sample article and recipe (drafts), empty static pages (drafts)
  'locations',
  'settings',
  'delivery', // needs locations (pickup methods point to them)
  'vouchers', // stage 7: maps imported voucher products; demo batch/account/vouchers outside production
  'orders', // stage 5: demo orders in different states (never in production); needs catalog + delivery
] as const
export type SeedPart = (typeof SEED_PARTS)[number]

/**
 * Fills the database with code lists, categories, locations, settings, the 12 Rib Eye products,
 * a sample article and a sample recipe, and the delivery setup (shipping methods, a provisional
 * Prague zone, a SAMPLE of postcodes, public holidays of this and next year).
 *
 * Idempotent: every item is looked up by its slug (images by file name) and created only when it
 * does not exist yet. Existing items are NEVER overwritten, so running the seed again is safe
 * and keeps any edits made in the admin.
 */
export async function seed(
  payload: Payload,
  log: Log = (m) => payload.logger.info(m),
  { only }: { only?: readonly SeedPart[] } = {},
) {
  const stats = { created: 0, existing: 0 }
  const runs = (part: SeedPart) => !only || only.length === 0 || only.includes(part)

  // ---------------------------------------------------------------- helpers
  const mediaCache = new Map<string, number>()
  async function media(file: string, alt: string): Promise<number> {
    const cached = mediaCache.get(file)
    if (cached) return cached
    // Payload may rename an upload ("p5-800-1.webp") when a file of the same name already exists,
    // e.g. in the shared media/ folder of another local database. Match on alt text + base name.
    const baseName = path.parse(file).name
    const found = await payload.find({
      collection: 'media',
      where: { and: [{ alt: { equals: alt } }, { filename: { like: baseName } }] },
      limit: 1,
      depth: 0,
    })
    let id = found.docs[0]?.id
    if (!id) {
      // Uploading through Payload generates the resized versions (thumbnail, card, detail, og).
      const created = await payload.create({
        collection: 'media',
        data: { alt },
        filePath: path.join(ASSETS_DIR, file),
      })
      id = created.id
      stats.created++
    }
    mediaCache.set(file, id)
    return id
  }

  async function findIdBySlug(
    collection: CollectionSlug,
    slug: string,
  ): Promise<number | undefined> {
    const found = await payload.find({
      collection,
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      draft: true,
    })
    return found.docs[0]?.id as number | undefined
  }

  /** Creates the document unless one with the same slug exists. Returns its id. */
  async function ensure(
    collection: CollectionSlug,
    slug: string,
    build: () => Promise<Record<string, unknown>>,
    options: { draft?: boolean } = {},
  ): Promise<number> {
    const existingId = await findIdBySlug(collection, slug)
    if (existingId) {
      stats.existing++
      return existingId
    }
    const data = { ...(await build()), slug }
    const created = await payload.create({
      collection,
      // The data shape differs per collection; it is validated by Payload at runtime.
      data: data as never,
      draft: options.draft,
    })
    stats.created++
    return created.id as number
  }

  async function codeList(collection: CollectionSlug, items: SeedCodeListItem[]) {
    const ids = new Map<string, number>()
    for (const [index, item] of items.entries()) {
      const id = await ensure(collection, item.slug, async () => ({
        name: item.name,
        description: item.description,
        alternativeName: item.alternativeName,
        adjective: item.adjective,
        sortOrder: (index + 1) * 10,
        ...(item.image ? { image: await media(item.image, item.adjective ?? item.name) } : {}),
      }))
      ids.set(item.slug, id)
    }
    log(`Číselník ${collection}: ${items.length} položek`)
    return ids
  }

  const productIds = new Map<string, number>()
  if (runs('catalog')) {
    // ---------------------------------------------------------------- code lists
    const meatTypeIds = await codeList('meat-types', meatTypes)
    const cutIds = await codeList('cuts', cuts)
    const originIds = await codeList('origins', origins)
    await codeList('usages', usages)
    await codeList('shelf-lives', shelfLives)

    // ---------------------------------------------------------------- categories (parents first)
    const categoryIds = new Map<string, number>()
    for (const category of categories) {
      const id = await ensure('categories', category.slug, async () => ({
        title: category.title,
        menuColumn: category.menuColumn,
        menuOrder: category.menuOrder,
        legacyUrl: category.legacyUrl,
        parent: category.parentSlug ? categoryIds.get(category.parentSlug) : undefined,
        ...(category.image ? { image: await media(category.image, category.title) } : {}),
      }))
      categoryIds.set(category.slug, id)
    }
    log(`Kategorie: ${categories.length}`)

    // ---------------------------------------------------------------- products (published)
    for (const product of products) {
      const slug = slugify(product.title)
      const id = await ensure('products', slug, async () => ({
        title: product.title,
        price: product.price,
        priceUnit: 'kg',
        vatRate: '12',
        availability: product.availability,
        mainImage: await media(product.image, product.title),
        variants: product.variants,
        cut: cutIds.get(product.cutSlug),
        origin: originIds.get(product.originSlug),
        meatType: meatTypeIds.get(product.meatTypeSlug),
        categories: product.categorySlugs.map((s) => categoryIds.get(s)).filter(Boolean),
        marbling: product.marbling,
        legacyUrl: product.legacyUrl,
        _status: 'published',
      }))
      productIds.set(slug, id)
    }
    log(`Produkty: ${products.length}`)
  }

  if (runs('content')) {
    const sampleProductId =
      productIds.get('argentinsky-hovezi-rib-eye') ??
      (await findIdBySlug('products', 'argentinsky-hovezi-rib-eye'))
    // ---------------------------------------------------------------- sample content (drafts)
    const recipeSlug = 'ukazka-rib-eye-steak'
    const recipeExisted = Boolean(await findIdBySlug('recipes', recipeSlug))
    const recipeId = await ensure(
      'recipes',
      recipeSlug,
      async () => ({
        title: 'UKÁZKA: Rib Eye steak',
        perex:
          'UKÁZKOVÝ RECEPT vytvořený instalačním skriptem, aby bylo vidět, jak recept v adminu ' +
          'vypadá. Nejde o ověřený postup – před zveřejněním ho nahraďte receptem od řezníků z Terrysu.',
        coverImage: await media('ribeye-slate-800.webp', 'Steak Rib Eye na břidlicovém prkénku'),
        servings: 2,
        difficulty: 'easy',
        ingredients: [
          { amount: '1', unit: 'ks', name: 'steak Rib Eye' },
          { amount: '', unit: '', name: 'sůl' },
          { amount: '', unit: '', name: 'čerstvě mletý pepř' },
        ],
        steps: [
          { text: 'UKÁZKA – krok 1. Sem patří první krok ověřeného postupu.' },
          { text: 'UKÁZKA – krok 2. Ke každému kroku lze přidat fotku.' },
        ],
        relatedProducts: sampleProductId ? [sampleProductId] : [],
        _status: 'draft',
      }),
      { draft: true },
    )

    // Link the sample recipe from the product only when the recipe was just created,
    // so a re-run never overwrites manual changes on the product.
    if (!recipeExisted && sampleProductId) {
      await payload.update({
        collection: 'products',
        id: sampleProductId,
        data: { relatedRecipes: [recipeId] },
      })
    }

    await ensure(
      'articles',
      'ukazka-jak-vybrat-steak',
      async () => ({
        title: 'UKÁZKA: Jak vybrat steak',
        section: 'magazine',
        perex:
          'UKÁZKOVÝ ČLÁNEK vytvořený instalačním skriptem, aby bylo vidět, jak článek v adminu ' +
          'vypadá. Před zveřejněním ho nahraďte skutečným textem.',
        coverImage: await media('fire-800.webp', 'Oheň v grilu'),
        content: richText(
          'UKÁZKA – tento text je jen výplň. Skutečný obsah připraví Terrys (např. z rozhovorů s majitelem).',
          'V článku lze používat nadpisy, odkazy, seznamy a obrázky.',
        ),
        authorName: 'Řezníci z Terrysu',
        relatedProducts: sampleProductId ? [sampleProductId] : [],
        _status: 'draft',
      }),
      { draft: true },
    )
    log('Ukázkový článek a recept (koncepty)')

    // ---------------------------------------------------------------- static pages (empty drafts)
    for (const page of pages) {
      await ensure(
        'pages',
        page.slug,
        async () => ({ title: page.title, legacyUrl: page.legacyUrl, _status: 'draft' }),
        { draft: true },
      )
    }
    log(`Stránky: ${pages.length} (prázdné koncepty)`)
  }

  if (runs('locations')) {
    // Store pages imported from the old web (stage 8); linked when they exist in this database.
    const pageIdByLegacyUrl = async (legacyUrl: string) => {
      const found = await payload.find({
        collection: 'pages',
        where: { legacyUrl: { equals: legacyUrl } },
        limit: 1,
        depth: 0,
        draft: true,
      })
      return found.docs[0]?.id
    }
    // ---------------------------------------------------------------- locations
    await ensure('locations', 'prodejna-praha-vinohrady', async () => ({
      name: 'Prodejna Praha 2 – Vinohrady',
      kind: 'shop',
      isPickupPoint: true,
      sortOrder: 10,
      address: { street: 'Italská 17', city: 'Praha 2 – Vinohrady', zip: '' },
      page: await pageIdByLegacyUrl('/prodejny/prodejna-terrys-steak-praha-detail-382'),
      openingHours: { note: `${TODO}: otevírací dobu doplní administrátor (ověřit s majitelem).` },
      parkingNote: `${TODO}: informace o parkování.`,
    }))
    await ensure('locations', 'sklad-slivinko', async () => ({
      name: 'Sklad Slivínko',
      kind: 'warehouse',
      isPickupPoint: true,
      sortOrder: 20,
      address: { street: '', city: 'Slivínko (u Benátek nad Jizerou)', zip: '' },
      page: await pageIdByLegacyUrl('/prodejny/sidlo-spolecnosti-vydejni-misto-detail-1003'),
      openingHours: { note: `${TODO}: otevírací dobu / výdejní časy doplní administrátor.` },
      parkingNote: `${TODO}: přesná adresa, příjezd a parkování.`,
    }))
    log('Provozovny: 2')
  }

  if (runs('settings')) {
    // ---------------------------------------------------------------- settings
    // Saves the defaults only when the settings were never saved; never overwrites an admin's values.
    const settings = await payload.findGlobal({ slug: 'settings' })
    if (!settings.updatedAt) {
      await payload.updateGlobal({
        slug: 'settings',
        data: { deliveryPrice: 229, priceNotice: DEFAULT_PRICE_NOTICE },
      })
    }
    log('Nastavení obchodu zkontrolováno')
  }

  if (runs('delivery')) {
    // ---------------------------------------------------------------- delivery (stage 2)
    await seedDelivery(payload, stats, log)
  }

  if (runs('vouchers')) {
    // ---------------------------------------------------------------- vouchers (stage 7)
    await seedVouchers(payload, stats, log)
  }

  if (runs('orders')) {
    // ---------------------------------------------------------------- demo orders (stage 5)
    await seedDemoOrders(payload, stats, log)
  }

  log(`Hotovo: vytvořeno ${stats.created}, už existovalo ${stats.existing}.`)
  return stats
}
