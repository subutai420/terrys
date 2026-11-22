import config from '@payload-config'
import { unstable_cache } from 'next/cache'
import { draftMode } from 'next/headers'
import { getPayload, type Payload, type Where } from 'payload'
import { cache } from 'react'

import { descendantIds } from '@/lib/categoryTree'
import { toShopDate } from '@/lib/delivery/calendar'
import { findActiveBatch } from '@/vouchers/issue'
import { buildOriginTiles, type OriginTile } from '@/lib/originTiles'
import { getPublicPath, GLOSSARY_PREFIX, normalizeLegacyPath } from '@/lib/urls'
import type {
  Article,
  Category,
  Homepage,
  Location,
  Page,
  Product,
  Recipe,
  Setting,
} from '@/payload-types'

import { STOREFRONT_TAG } from './revalidate'

/**
 * Storefront data access (server only). Every public read of the storefront goes through here.
 *
 * Access: all queries run with `overrideAccess: false` and no user, i.e. with the PUBLIC access
 * rules from `src/access` – drafts never, products with availability "hidden" never. The only
 * exception is draft mode (editor preview, `src/app/(frontend)/next/preview/route.ts`), which an
 * editor turns on after logging in to the admin: then drafts and hidden products are shown.
 *
 * Caching: loaders are wrapped in `unstable_cache` with the tag `storefront` (revalidated on
 * every admin change, see `revalidate.ts`) and a one-hour safety net, plus React `cache()` to
 * deduplicate calls within one render (metadata + page). Draft mode bypasses the cache.
 */

export const getPayloadClient = (): Promise<Payload> => getPayload({ config })

async function isDraftMode(): Promise<boolean> {
  try {
    return (await draftMode()).isEnabled
  } catch {
    // Outside a request (build of static params, sitemap at build time).
    return false
  }
}

/** Query options shared by all public reads. */
function access(draft: boolean) {
  return draft ? { draft: true, overrideAccess: true } : { draft: false, overrideAccess: false }
}

function loader<A extends unknown[], R>(
  name: string,
  load: (draft: boolean, ...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  const version = process.env.STOREFRONT_CACHE_VERSION ?? 'dev'
  const cachedLoad = unstable_cache(
    (...args: A) => load(false, ...args),
    ['storefront', version, name],
    {
      tags: [STOREFRONT_TAG],
      revalidate: 3600,
    },
  )
  return cache(async (...args: A): Promise<R> =>
    (await isDraftMode()) ? load(true, ...args) : cachedLoad(...args),
  )
}

// ----------------------------------------------------------------------------- shared shapes

/** Fields of a populated image the storefront needs. */
const mediaPopulate = { alt: true, url: true, width: true, height: true, sizes: true } as const
const termPopulate = { name: true, slug: true, sortOrder: true } as const

/** Populate settings for product lists (cards, filters). */
const populateForCards = {
  media: mediaPopulate,
  cuts: { ...termPopulate, alternativeName: true },
  origins: termPopulate,
  'meat-types': termPopulate,
  usages: termPopulate,
} as const

/** Product fields shown in cards and used by filters. */
const cardSelect = {
  title: true,
  slug: true,
  legacyUrl: true,
  price: true,
  priceUnit: true,
  availability: true,
  variants: true,
  mainImage: true,
  cut: true,
  origin: true,
  meatType: true,
  usages: true,
  marbling: true,
  categories: true,
  // Stage 6: item_brand in the dataLayer.
  brand: true,
} as const

export type CardProduct = Pick<
  Product,
  | 'id'
  | 'title'
  | 'slug'
  | 'legacyUrl'
  | 'price'
  | 'priceUnit'
  | 'availability'
  | 'variants'
  | 'mainImage'
  | 'cut'
  | 'origin'
  | 'meatType'
  | 'usages'
  | 'marbling'
  | 'categories'
  | 'brand'
>

/** Drops relations that the public may not read (Payload leaves them as plain ids). */
export function populated<T extends { id: number | string }>(
  values: (number | T | null | undefined)[] | null | undefined,
): T[] {
  return (values ?? []).filter((value): value is T => typeof value === 'object' && value !== null)
}

// ----------------------------------------------------------------------------- globals

export const getSettings = loader('settings', async (draft): Promise<Setting> => {
  const payload = await getPayloadClient()
  return payload.findGlobal({ slug: 'settings', depth: 0, ...access(draft) })
})

/**
 * Stage 6: the public part of the Marketing global (only the consent text version). The global
 * itself is not publicly readable, so this reads it on the server with `overrideAccess`.
 */
export const getConsentVersion = loader('consent-version', async (): Promise<string> => {
  const payload = await getPayloadClient()
  try {
    const marketing = await payload.findGlobal({
      slug: 'marketing',
      depth: 0,
      overrideAccess: true,
      select: { consentVersion: true },
    })
    return marketing.consentVersion || '1'
  } catch {
    return '1'
  }
})

export const getHomepage = loader('homepage', async (draft): Promise<Homepage> => {
  const payload = await getPayloadClient()
  return payload.findGlobal({
    slug: 'homepage',
    depth: 2,
    populate: {
      media: mediaPopulate,
      categories: { title: true, slug: true, legacyUrl: true, image: true },
      origins: { name: true, slug: true, adjective: true, image: true, category: true },
      products: cardSelect,
    },
    ...access(draft),
  })
})

// ----------------------------------------------------------------------------- categories

export type MenuCategory = Pick<
  Category,
  'id' | 'title' | 'slug' | 'legacyUrl' | 'parent' | 'menuColumn' | 'menuOrder' | 'image'
>

/** All categories (small list, used for the menu, breadcrumbs and subcategory links). */
export const getAllCategories = loader('categories', async (draft): Promise<MenuCategory[]> => {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'categories',
    depth: 1,
    limit: 1000,
    pagination: false,
    sort: ['menuOrder', 'title'],
    select: {
      title: true,
      slug: true,
      legacyUrl: true,
      parent: true,
      menuColumn: true,
      menuOrder: true,
      image: true,
    },
    populate: { media: mediaPopulate, categories: { title: true } },
    ...access(draft),
  })
  // `parent` is populated at depth 1; keep only its id to keep the shape simple.
  return result.docs.map((doc) => ({
    ...doc,
    parent: typeof doc.parent === 'object' && doc.parent ? doc.parent.id : (doc.parent ?? null),
  })) as MenuCategory[]
})

const categoryPopulate = { media: mediaPopulate } as const

async function findCategory(draft: boolean, where: Where): Promise<Category | null> {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'categories',
    where,
    depth: 1,
    limit: 1,
    populate: categoryPopulate,
    // The join field (products) is not needed: products are loaded separately.
    joins: false,
    ...access(draft),
  })
  return result.docs[0] ?? null
}

export const getCategoryByLegacyPath = loader('category-legacy', async (draft, path: string) =>
  findCategory(draft, { legacyUrl: { equals: path } }),
)

export const getCategoryBySlug = loader('category-slug', async (draft, slug: string) =>
  findCategory(draft, { slug: { equals: slug } }),
)

/** Products of a category and all its subcategories, for cards and filters. */
export const getCategoryProducts = loader(
  'category-products',
  async (draft, categoryId: number): Promise<CardProduct[]> => {
    const categories = await getAllCategories()
    const ids = descendantIds(categories, categoryId)
    return findCardProducts(draft, { categories: { in: ids } })
  },
)

/** All public products (the /produkty listing). */
export const getAllCardProducts = loader('all-products', async (draft) =>
  findCardProducts(draft, {}),
)

async function findCardProducts(draft: boolean, where: Where): Promise<CardProduct[]> {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'products',
    where,
    depth: 1,
    limit: 2000,
    pagination: false,
    sort: 'title',
    select: cardSelect,
    populate: populateForCards,
    ...access(draft),
  })
  return result.docs as CardProduct[]
}

export const getProductsByIds = loader(
  'products-by-ids',
  async (draft, ids: number[]): Promise<CardProduct[]> => {
    if (ids.length === 0) return []
    const products = await findCardProducts(draft, { id: { in: ids } })
    // Keep the requested order (relevance from the search, editor's order).
    const byId = new Map(products.map((p) => [p.id, p]))
    return ids.map((id) => byId.get(id)).filter((p): p is CardProduct => Boolean(p))
  },
)

// ----------------------------------------------------------------------------- products

const productDetailPopulate = {
  ...populateForCards,
  'shelf-lives': { name: true, description: true },
  categories: { title: true, slug: true, legacyUrl: true, parent: true },
  products: cardSelect,
  recipes: { title: true, slug: true, legacyUrl: true, coverImage: true, perex: true },
} as const

async function findProduct(draft: boolean, where: Where): Promise<Product | null> {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'products',
    where,
    depth: 2,
    limit: 1,
    populate: productDetailPopulate,
    ...access(draft),
  })
  return result.docs[0] ?? null
}

export const getProductByLegacyPath = loader('product-legacy', async (draft, path: string) =>
  findProduct(draft, { legacyUrl: { equals: path } }),
)

export const getProductBySlug = loader('product-slug', async (draft, slug: string) =>
  findProduct(draft, { slug: { equals: slug } }),
)

/** Recipes that list the product in "V tomto receptu jsme použili" (reverse relation). */
export const getRecipesUsingProduct = loader(
  'recipes-using-product',
  async (draft, productId: number): Promise<Recipe[]> => {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'recipes',
      where: { relatedProducts: { contains: productId } },
      depth: 1,
      limit: 4,
      sort: '-publishedAt',
      select: { title: true, slug: true, legacyUrl: true, coverImage: true, perex: true },
      populate: { media: mediaPopulate },
      ...access(draft),
    })
    return result.docs as Recipe[]
  },
)

// ----------------------------------------------------------------------------- content

const contentPopulate = {
  ...populateForCards,
  products: cardSelect,
} as const

async function findOne<T>(
  draft: boolean,
  collection: 'articles' | 'recipes' | 'pages',
  where: Where,
): Promise<T | null> {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection,
    where,
    depth: 2,
    limit: 1,
    populate: contentPopulate,
    ...access(draft),
  })
  return (result.docs[0] as T | undefined) ?? null
}

export const getArticleByLegacyPath = loader('article-legacy', async (draft, path: string) =>
  findOne<Article>(draft, 'articles', { legacyUrl: { equals: path } }),
)
export const getArticleBySlug = loader(
  'article-slug',
  async (draft, section: 'magazine' | 'academy', slug: string) =>
    findOne<Article>(draft, 'articles', {
      and: [{ slug: { equals: slug } }, { section: { equals: section } }],
    }),
)
export const getRecipeByLegacyPath = loader('recipe-legacy', async (draft, path: string) =>
  findOne<Recipe>(draft, 'recipes', { legacyUrl: { equals: path } }),
)
export const getRecipeBySlug = loader('recipe-slug', async (draft, slug: string) =>
  findOne<Recipe>(draft, 'recipes', { slug: { equals: slug } }),
)
export const getPageByLegacyPath = loader('page-legacy', async (draft, path: string) =>
  findOne<Page>(draft, 'pages', { legacyUrl: { equals: path } }),
)
export const getPageBySlug = loader('page-slug', async (draft, slug: string) =>
  findOne<Page>(draft, 'pages', { slug: { equals: slug } }),
)

export type ArticleListKind = 'magazine' | 'academy' | 'glossary'

const listSelect = {
  title: true,
  slug: true,
  legacyUrl: true,
  section: true,
  perex: true,
  coverImage: true,
  publishedAt: true,
} as const

export type ListArticle = Pick<
  Article,
  'id' | 'title' | 'slug' | 'legacyUrl' | 'section' | 'perex' | 'coverImage' | 'publishedAt'
>

/** Articles of a listing. Glossary = academy articles imported from /pojmy/ (old glossary). */
export const getArticles = loader(
  'articles',
  async (draft, kind: ArticleListKind, limit: number): Promise<ListArticle[]> => {
    const payload = await getPayloadClient()
    const where: Where =
      kind === 'magazine'
        ? { section: { equals: 'magazine' } }
        : kind === 'glossary'
          ? { legacyUrl: { like: `${GLOSSARY_PREFIX}%` } }
          : {
              and: [
                { section: { equals: 'academy' } },
                {
                  or: [
                    { legacyUrl: { exists: false } },
                    { legacyUrl: { not_like: `${GLOSSARY_PREFIX}%` } },
                  ],
                },
              ],
            }
    const result = await payload.find({
      collection: 'articles',
      where,
      depth: 1,
      limit,
      sort: kind === 'glossary' ? 'title' : '-publishedAt',
      select: listSelect,
      populate: { media: mediaPopulate },
      ...access(draft),
    })
    return result.docs as ListArticle[]
  },
)

export type ListRecipe = Pick<
  Recipe,
  | 'id'
  | 'title'
  | 'slug'
  | 'legacyUrl'
  | 'perex'
  | 'coverImage'
  | 'publishedAt'
  | 'prepTimeMinutes'
  | 'cookTimeMinutes'
>

export const getRecipes = loader('recipes', async (draft, limit: number): Promise<ListRecipe[]> => {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'recipes',
    depth: 1,
    limit,
    sort: '-publishedAt',
    select: {
      title: true,
      slug: true,
      legacyUrl: true,
      perex: true,
      coverImage: true,
      publishedAt: true,
      prepTimeMinutes: true,
      cookTimeMinutes: true,
    },
    populate: { media: mediaPopulate },
    ...access(draft),
  })
  return result.docs as ListRecipe[]
})

// ----------------------------------------------------------------------------- locations, pages

export const getLocations = loader('locations', async (draft): Promise<Location[]> => {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'locations',
    depth: 1,
    limit: 20,
    sort: ['sortOrder', 'name'],
    populate: { media: mediaPopulate, pages: { title: true, slug: true, legacyUrl: true } },
    ...access(draft),
  })
  return result.docs
})

export type LinkPage = Pick<Page, 'id' | 'title' | 'slug' | 'legacyUrl'>

/** Published static pages (footer links, sitemap). */
export const getAllPages = loader('pages', async (draft): Promise<LinkPage[]> => {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'pages',
    depth: 0,
    limit: 500,
    pagination: false,
    sort: 'title',
    select: { title: true, slug: true, legacyUrl: true },
    ...access(draft),
  })
  return result.docs as LinkPage[]
})

/** Country tiles for the homepage (see `src/lib/originTiles.ts` for the rules). */
export const getOriginTiles = loader('origin-tiles', async (draft): Promise<OriginTile[]> => {
  const payload = await getPayloadClient()
  const [origins, products, categories] = await Promise.all([
    payload.find({
      collection: 'origins',
      depth: 1,
      limit: 200,
      pagination: false,
      sort: ['sortOrder', 'name'],
      populate: { media: mediaPopulate },
      select: { name: true, slug: true, adjective: true, image: true, category: true },
      ...access(draft),
    }),
    payload.find({
      collection: 'products',
      depth: 1,
      limit: 2000,
      pagination: false,
      select: {
        origin: true,
        meatType: true,
        mainImage: true,
        availability: true,
        categories: true,
      },
      populate: {
        media: mediaPopulate,
        origins: { name: true },
        'meat-types': { slug: true },
        categories: { title: true },
      },
      ...access(draft),
    }),
    getAllCategories(),
  ])
  const idOf = (value: unknown): number | null =>
    typeof value === 'number'
      ? value
      : typeof value === 'object' && value && 'id' in value
        ? Number((value as { id: number }).id)
        : null
  return buildOriginTiles(
    origins.docs.map((origin) => ({
      id: origin.id,
      name: origin.name,
      slug: origin.slug,
      adjective: origin.adjective,
      image: origin.image,
      categoryId: idOf(origin.category),
    })),
    products.docs.map((product) => ({
      originId: idOf(product.origin),
      meatTypeSlug: typeof product.meatType === 'object' ? product.meatType?.slug : null,
      categoryIds: (product.categories ?? []).map(idOf).filter((id): id is number => id !== null),
      image: product.mainImage,
      inStock: product.availability === 'in-stock',
    })),
    categories.map((category) => ({ id: category.id, image: usableImage(category.image) })),
    (categories.some((c) => c.menuColumn === 'origin')
      ? categories.filter((c) => c.menuColumn === 'origin')
      : categories.filter((c) => c.parent === null || c.parent === undefined)
    ).map((c) => c.id),
  )
})

/**
 * Category pictures imported from the old web are often tiny menu icons (45 px). For tiles we
 * use only images at least this wide; otherwise a product photo of the category stands in.
 */
const MIN_TILE_IMAGE_WIDTH = 300

export function usableImage(media: unknown): unknown {
  return typeof media === 'object' &&
    media !== null &&
    Number((media as { width?: number }).width) >= MIN_TILE_IMAGE_WIDTH
    ? media
    : null
}

/** A product photo per category (first in-stock product with a photo) for category tiles. */
export const getCategorySampleImages = loader(
  'category-sample-images',
  async (draft): Promise<Record<number, unknown>> => {
    const products = await findCardProducts(draft, { availability: { equals: 'in-stock' } })
    const result: Record<number, unknown> = {}
    for (const product of products) {
      if (!product.mainImage || typeof product.mainImage !== 'object') continue
      for (const category of product.categories ?? []) {
        const id = typeof category === 'object' ? category.id : category
        if (!(id in result)) result[id] = product.mainImage
      }
    }
    return result
  },
)

// ----------------------------------------------------------------------------- sitemap

export type SitemapDoc = {
  slug?: string | null
  legacyUrl?: string | null
  section?: string | null
  updatedAt: string
}

/** Public documents of a collection for the sitemap (drafts and hidden products excluded). */
export async function getSitemapDocs(
  collection: 'products' | 'categories' | 'articles' | 'recipes' | 'pages',
): Promise<SitemapDoc[]> {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection,
    depth: 0,
    limit: 10000,
    pagination: false,
    select:
      collection === 'articles'
        ? { slug: true, legacyUrl: true, section: true, updatedAt: true }
        : { slug: true, legacyUrl: true, updatedAt: true },
    draft: false,
    overrideAccess: false,
  })
  return result.docs as SitemapDoc[]
}

/** Normalised legacy path of a request path (for lookups). */
export function lookupPath(path: string): string {
  return normalizeLegacyPath(path) ?? path
}

// ----------------------------------------------------------------------------- vouchers (stage 7)

export type VoucherChoice = {
  id: number
  title: string
  value: number
  url: string
  current?: boolean
}

/** All public gift voucher products (value chips on a voucher product page), cheapest first. */
export const getVoucherProducts = loader(
  'voucher-products',
  async (draft): Promise<Omit<VoucherChoice, 'current'>[]> => {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'products',
      where: {
        and: [
          { 'voucher.enabled': { equals: true } },
          { availability: { in: ['in-stock', 'in-transit'] } },
        ],
      },
      sort: 'price',
      depth: 0,
      limit: 20,
      select: { title: true, slug: true, legacyUrl: true, price: true, voucher: true },
      ...access(draft),
    })
    return result.docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      value: doc.voucher?.value ?? doc.price,
      url: getPublicPath('products', doc),
    }))
  },
)

/**
 * Expiry (YYYY-MM-DD) of the active voucher batch – what a voucher bought today will say. The
 * batches are not public, so this reads them on the server; null when no valid batch is active.
 */
export const getActiveVoucherExpiry = loader('voucher-expiry', async (): Promise<string | null> => {
  const payload = await getPayloadClient()
  const { batch } = await findActiveBatch(payload)
  return batch ? toShopDate(batch.expiresOn) : null
})
