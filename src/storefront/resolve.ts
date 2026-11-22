import { CLEAN_PATH_PREFIX, getPublicPath, normalizeLegacyPath } from '@/lib/urls'
import type { Article, Category, Page, Product, Recipe } from '@/payload-types'

import {
  getArticleByLegacyPath,
  getArticleBySlug,
  getCategoryByLegacyPath,
  getPageByLegacyPath,
  getPageBySlug,
  getProductByLegacyPath,
  getProductBySlug,
  getRecipeByLegacyPath,
  getRecipeBySlug,
} from './data'

/**
 * Finds the document for a storefront path (the catch-all route `[...path]`).
 *
 * 1. Clean paths of documents created in the new admin (`/produkty/detail/<slug>`, …, see
 *    `src/lib/urls.ts`). A document that has a legacy URL is redirected there (its canonical).
 * 2. Every other path is looked up by `legacyUrl` – the old terrys.cz address. The likely
 *    collection is tried first (by the old section prefix), then the others, so a legacy URL works
 *    wherever an editor puts it.
 *
 * Categories normally come through their own route (`/produkty/kategorie/[slug]`, legacy category
 * paths are rewritten there by `src/proxy.ts`, because category pages read filter parameters);
 * a category found here has a legacy URL outside the old pattern and is shown without filters.
 */
export type Resolved =
  | { kind: 'product'; doc: Product }
  | { kind: 'article'; doc: Article }
  | { kind: 'recipe'; doc: Recipe }
  | { kind: 'page'; doc: Page }
  | { kind: 'category'; doc: Category }
  | { kind: 'redirect'; to: string }

function cleanSlug(path: string, prefix: string): string | null {
  if (!path.startsWith(prefix)) return null
  const rest = path.slice(prefix.length)
  return rest && !rest.includes('/') ? rest : null
}

export async function resolvePath(rawPath: string): Promise<Resolved | null> {
  const path = normalizeLegacyPath(rawPath)
  if (!path || path === '/') return null

  // ---- 1. clean paths
  const productSlug = cleanSlug(path, CLEAN_PATH_PREFIX.products)
  if (productSlug) {
    const doc = await getProductBySlug(productSlug)
    return withCanonical(doc && { kind: 'product', doc }, path)
  }
  for (const section of ['magazine', 'academy'] as const) {
    const slug = cleanSlug(path, CLEAN_PATH_PREFIX[section])
    if (slug) {
      const doc = await getArticleBySlug(section, slug)
      return withCanonical(doc && { kind: 'article', doc }, path)
    }
  }
  const recipeSlug = cleanSlug(path, CLEAN_PATH_PREFIX.recipes)
  if (recipeSlug) {
    const doc = await getRecipeBySlug(recipeSlug)
    return withCanonical(doc && { kind: 'recipe', doc }, path)
  }
  const pageSlug = cleanSlug(path, CLEAN_PATH_PREFIX.pages)
  if (pageSlug) {
    const doc = await getPageBySlug(pageSlug)
    return withCanonical(doc && { kind: 'page', doc }, path)
  }

  // ---- 2. legacy paths
  const lookups: (() => Promise<Resolved | null>)[] = [
    async () => {
      const doc = await getProductByLegacyPath(path)
      return doc && { kind: 'product', doc }
    },
    async () => {
      const doc = await getArticleByLegacyPath(path)
      return doc && { kind: 'article', doc }
    },
    async () => {
      const doc = await getRecipeByLegacyPath(path)
      return doc && { kind: 'recipe', doc }
    },
    async () => {
      const doc = await getPageByLegacyPath(path)
      return doc && { kind: 'page', doc }
    },
    async () => {
      const doc = await getCategoryByLegacyPath(path)
      return doc && { kind: 'category', doc }
    },
  ]
  // Most likely collection first.
  const order = path.startsWith('/produkty/')
    ? [0, 4, 1, 2, 3]
    : /^\/(magazin|academy-magazin|pojmy)\//.test(path)
      ? [1, 0, 2, 3, 4]
      : path.startsWith('/recepty/')
        ? [2, 0, 1, 3, 4]
        : [3, 0, 1, 2, 4]
  for (const index of order) {
    const found = await lookups[index]()
    if (found) return found
  }
  return null
}

/** A document reached by its clean path but having a legacy URL lives at the legacy URL. */
function withCanonical(resolved: Resolved | null, requestedPath: string): Resolved | null {
  if (!resolved || resolved.kind === 'redirect') return resolved
  const collection =
    resolved.kind === 'product'
      ? 'products'
      : resolved.kind === 'article'
        ? 'articles'
        : resolved.kind === 'recipe'
          ? 'recipes'
          : resolved.kind === 'page'
            ? 'pages'
            : 'categories'
  const canonical = getPublicPath(collection, resolved.doc)
  if (canonical !== requestedPath) return { kind: 'redirect', to: canonical }
  return resolved
}
