import { unstable_cache } from 'next/cache'
import type { Payload } from 'payload'

import { getPublicPath } from '@/lib/urls'
import {
  buildLocation,
  isOldAliasParam,
  legacyIndex,
  type LegacyIndexData,
  normalizePathShape,
  resolveLegacyPath,
} from '@/lib/redirects/legacy'
import { STOREFRONT_TAG } from '@/storefront/revalidate'

/**
 * The redirect table of the running site (stage 8b), built from the database:
 * - `served`: public path of every PUBLIC document (same access rules as the storefront:
 *   `overrideAccess: false`, so drafts and hidden products are not in it),
 * - `retired`: legacy path of every non-public product → its most specific public category
 *   (else /produkty),
 * - `redirects`: active redirects entered in the admin (collection `redirects`).
 *
 * ~800 short strings; built in a few hundred ms and cached under the storefront tag, so every
 * admin change (product hidden, redirect added…) rebuilds it on the next request.
 */
export async function buildLegacyIndexData(payload: Payload): Promise<LegacyIndexData> {
  const publicDocs = async (
    collection: 'products' | 'categories' | 'articles' | 'recipes' | 'pages',
  ) =>
    (
      await payload.find({
        collection,
        depth: 0,
        limit: 0,
        pagination: false,
        draft: false,
        overrideAccess: false,
        select:
          collection === 'articles'
            ? { slug: true, legacyUrl: true, section: true }
            : collection === 'products'
              ? { slug: true, legacyUrl: true, categories: true }
              : collection === 'categories'
                ? { slug: true, legacyUrl: true, parent: true }
                : { slug: true, legacyUrl: true },
      })
    ).docs as {
      id: number
      slug?: string | null
      legacyUrl?: string | null
      section?: string | null
      categories?: unknown[] | null
      parent?: unknown
    }[]

  const [products, categories, articles, recipes, pages, hiddenProducts, redirects] =
    await Promise.all([
      publicDocs('products'),
      publicDocs('categories'),
      publicDocs('articles'),
      publicDocs('recipes'),
      publicDocs('pages'),
      payload.find({
        collection: 'products',
        depth: 0,
        limit: 0,
        pagination: false,
        draft: false,
        overrideAccess: true,
        where: {
          and: [
            { legacyUrl: { exists: true } },
            {
              or: [
                { _status: { not_equals: 'published' } },
                { availability: { equals: 'hidden' } },
              ],
            },
          ],
        },
        select: { legacyUrl: true, categories: true },
      }),
      payload.find({
        collection: 'redirects',
        depth: 0,
        limit: 0,
        pagination: false,
        overrideAccess: true,
        where: { active: { equals: true } },
        select: { from: true, to: true },
      }),
    ])

  const idOf = (value: unknown): number | null =>
    typeof value === 'number'
      ? value
      : value && typeof value === 'object'
        ? (value as { id: number }).id
        : null
  const categoryPath = new Map(categories.map((c) => [c.id, getPublicPath('categories', c)]))
  const parentOf = new Map(categories.map((c) => [c.id, idOf(c.parent)]))
  const depthOf = (id: number): number => {
    let depth = 0
    for (let p = parentOf.get(id); p && depth < 10; p = parentOf.get(p)) depth++
    return depth
  }
  const productCount = new Map<number, number>()
  for (const product of products) {
    for (const c of product.categories ?? []) {
      const id = idOf(c)
      if (id) productCount.set(id, (productCount.get(id) ?? 0) + 1)
    }
  }
  /**
   * The most specific category of a product: deepest in the tree, then the one with the fewest
   * public products (old data sometimes lists a broader or even a wrong cut category first).
   */
  const bestCategory = (ids: number[]): string | undefined =>
    ids
      .filter((id) => categoryPath.has(id))
      .map((id, order) => ({ id, order, depth: depthOf(id), count: productCount.get(id) ?? 0 }))
      .sort((a, b) => b.depth - a.depth || a.count - b.count || a.order - b.order)
      .map((c) => categoryPath.get(c.id))[0]
  const served = [
    ...products.map((d) => getPublicPath('products', d)),
    ...categories.map((d) => getPublicPath('categories', d)),
    ...articles.map((d) => getPublicPath('articles', d)),
    ...recipes.map((d) => getPublicPath('recipes', d)),
    ...pages.map((d) => getPublicPath('pages', d)),
  ]
  const servedSet = new Set(served)

  const retired: Record<string, string> = {}
  for (const doc of hiddenProducts.docs as {
    legacyUrl?: string | null
    categories?: unknown[] | null
  }[]) {
    const path = getPublicPath('products', doc)
    if (servedSet.has(path)) continue // another public document uses the same path
    const ids = (doc.categories ?? []).map(idOf).filter((id): id is number => id !== null)
    retired[path] = bestCategory(ids) ?? '/produkty'
  }

  const table: Record<string, string> = {}
  for (const doc of redirects.docs as { from?: string | null; to?: string | null }[]) {
    if (doc.from && doc.to) table[doc.from] = doc.to
  }

  return { served, retired, redirects: table }
}

/** Cached table for the running Next.js server (storefront tag = rebuilt after admin edits). */
const cachedIndexData = unstable_cache(
  async () => {
    // Imported lazily: this module is also used by the `redirects` collection (validation),
    // which is part of the Payload config itself.
    const [{ getPayload }, { default: config }] = await Promise.all([
      import('payload'),
      import('@payload-config'),
    ])
    return buildLegacyIndexData(await getPayload({ config }))
  },
  ['storefront', process.env.STOREFRONT_CACHE_VERSION ?? 'dev', 'legacy-redirect-index'],
  { tags: [STOREFRONT_TAG], revalidate: 3600 },
)

export function getLegacyIndexData(): Promise<LegacyIndexData> {
  return cachedIndexData()
}

/**
 * Not-found fallback of the storefront routes: the final address for an old path that no route
 * could serve, or null (→ real 404). `query` = the request's query parameters when the route can
 * read them (old alias parameters are dropped, the rest is kept). Normally `src/proxy.ts`
 * answers these requests first; this covers a cold proxy without the table.
 */
export async function findLegacyRedirect(
  path: string,
  query?: Record<string, string | string[] | undefined>,
): Promise<string | null> {
  const lower = normalizePathShape(path).toLowerCase()
  const resolution = resolveLegacyPath(lower, legacyIndex(await getLegacyIndexData()))
  if (!resolution || resolution.target === path) return null
  const kept = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || isOldAliasParam(key)) continue
    for (const v of Array.isArray(value) ? value : [value]) kept.append(key, v)
  }
  return buildLocation(resolution.target, kept)
}
