import type { MetadataRoute } from 'next'

import { absoluteUrl, getPublicPath, LISTING_PATHS } from '@/lib/urls'
import { getSitemapDocs } from '@/storefront/data'

/**
 * /sitemap.xml – every public document at its canonical URL (`getPublicPath`), plus the listing
 * pages. Drafts and hidden products are left out (public access rules, `overrideAccess: false`).
 * Rendered per request (crawlers fetch it rarely; it is always up to date). With a few hundred
 * URLs one file is enough; split with `generateSitemaps` beyond ~40 000 URLs.
 */
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories, articles, recipes, pages] = await Promise.all([
    getSitemapDocs('products'),
    getSitemapDocs('categories'),
    getSitemapDocs('articles'),
    getSitemapDocs('recipes'),
    getSitemapDocs('pages'),
  ])
  const entry = (path: string, lastModified?: string) => ({
    url: absoluteUrl(path),
    ...(lastModified ? { lastModified: new Date(lastModified) } : {}),
  })
  return [
    entry('/'),
    entry(LISTING_PATHS.products),
    entry(LISTING_PATHS.magazine),
    entry(LISTING_PATHS.academy),
    entry(LISTING_PATHS.glossary),
    entry(LISTING_PATHS.recipes),
    entry(LISTING_PATHS.stores),
    ...categories.map((doc) => entry(getPublicPath('categories', doc), doc.updatedAt)),
    ...products.map((doc) => entry(getPublicPath('products', doc), doc.updatedAt)),
    ...articles.map((doc) => entry(getPublicPath('articles', doc), doc.updatedAt)),
    ...recipes.map((doc) => entry(getPublicPath('recipes', doc), doc.updatedAt)),
    ...pages.map((doc) => entry(getPublicPath('pages', doc), doc.updatedAt)),
  ]
}
