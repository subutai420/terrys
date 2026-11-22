/**
 * Public URLs of storefront documents – the ONE place that decides where a document lives.
 * Use it for every link, canonical URL, sitemap entry, structured data and (later) feeds.
 *
 * Rules (decided in stage 3, see CLAUDE.md → "Storefront URLs"):
 *
 * 1. A document imported from the old terrys.cz keeps its old address exactly: the public path is
 *    its `legacyUrl` (e.g. `/produkty/argentinsky-hovezi-rib-eye-detail-406`). Nothing needs a
 *    redirect for the main content, and the canonical URL points to the same path.
 *
 * 2. A document created in the new admin (no `legacyUrl`) gets a clean path in the same section:
 *
 *      products            /produkty/detail/<slug>
 *      categories          /produkty/kategorie/<slug>
 *      magazine articles   /magazin/clanek/<slug>
 *      academy articles    /academy-magazin/clanek/<slug>
 *      recipes             /recepty/recept/<slug>
 *      pages               /stranky/<slug>
 *
 *    Why this cannot collide with the old patterns: every old content URL in those sections has
 *    exactly ONE segment after the section (`/produkty/<slug>-detail-<id>`, `/produkty/<slug>-<id>`,
 *    `/magazin/<slug>-detail-<id>`, …), while the clean paths always have TWO, with a fixed word
 *    (`detail`, `kategorie`, `clanek`, `recept`) in between. The old site never used `/stranky/`.
 *    Slugs alone cannot guarantee this (a new slug may end in "-2" just like an old ID), the extra
 *    segment can.
 *
 * Pure module (no Payload / Next imports), unit-tested in `urls.test.ts`.
 */

export type PublicCollection = 'products' | 'categories' | 'articles' | 'recipes' | 'pages'

export type ArticleSection = 'magazine' | 'academy'

/** The minimum a document needs to have a public URL. */
export type UrlDoc = {
  slug?: string | null
  legacyUrl?: string | null
  /** Articles only. */
  section?: ArticleSection | string | null
}

/** Fixed parts of the clean (non-legacy) paths. Also used by the routes in `src/app/(frontend)`. */
export const CLEAN_PATH_PREFIX = {
  products: '/produkty/detail/',
  categories: '/produkty/kategorie/',
  magazine: '/magazin/clanek/',
  academy: '/academy-magazin/clanek/',
  recipes: '/recepty/recept/',
  pages: '/stranky/',
} as const

/** Listing pages (also old URLs of the same listings). */
export const LISTING_PATHS = {
  home: '/',
  products: '/produkty',
  magazine: '/magazin',
  academy: '/academy',
  glossary: '/pojmy',
  recipes: '/recepty',
  stores: '/prodejny',
  search: '/vyhledavani',
} as const

/** Old site: glossary terms are academy articles whose legacy URL starts with this. */
export const GLOSSARY_PREFIX = '/pojmy/'

/**
 * Normalises a stored legacy URL to a path: must start with "/", no host, no query or fragment,
 * no trailing slash (except "/"). Returns null for anything that is not a usable path.
 */
export function normalizeLegacyPath(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  let path = value.trim()
  if (!path) return null
  // Tolerate a full old URL (https://www.terrys.cz/...) pasted into the admin.
  const absolute = path.match(/^https?:\/\/[^/]+(\/.*)?$/i)
  if (absolute) path = absolute[1] ?? '/'
  if (!path.startsWith('/') || path.startsWith('//')) return null
  path = path.split('#')[0].split('?')[0]
  if (path.length > 1) path = path.replace(/\/+$/, '')
  return path || null
}

/** Clean path for a document without a legacy URL. Null when the document has no slug. */
export function getCleanPath(collection: PublicCollection, doc: UrlDoc): string | null {
  const slug = doc.slug?.trim()
  if (!slug) return null
  const encoded = encodeURIComponent(slug)
  switch (collection) {
    case 'products':
      return CLEAN_PATH_PREFIX.products + encoded
    case 'categories':
      return CLEAN_PATH_PREFIX.categories + encoded
    case 'articles':
      return (
        (doc.section === 'academy' ? CLEAN_PATH_PREFIX.academy : CLEAN_PATH_PREFIX.magazine) +
        encoded
      )
    case 'recipes':
      return CLEAN_PATH_PREFIX.recipes + encoded
    case 'pages':
      return CLEAN_PATH_PREFIX.pages + encoded
  }
}

/**
 * Public path of a document: its legacy URL when it has one, otherwise the clean path.
 * Falls back to the section listing when the document has neither (should not happen: slugs are
 * generated automatically), so a link is never broken.
 */
export function getPublicPath(collection: PublicCollection, doc: UrlDoc): string {
  return (
    normalizeLegacyPath(doc.legacyUrl) ??
    getCleanPath(collection, doc) ??
    (collection === 'articles'
      ? doc.section === 'academy'
        ? LISTING_PATHS.academy
        : LISTING_PATHS.magazine
      : collection === 'recipes'
        ? LISTING_PATHS.recipes
        : collection === 'pages'
          ? LISTING_PATHS.home
          : LISTING_PATHS.products)
  )
}

/** True for academy articles imported from the old glossary (`/pojmy/…`). */
export function isGlossaryTerm(doc: UrlDoc): boolean {
  return normalizeLegacyPath(doc.legacyUrl)?.startsWith(GLOSSARY_PREFIX) ?? false
}

/** Site origin without a trailing slash, from NEXT_PUBLIC_SERVER_URL. */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
  return raw.replace(/\/+$/, '')
}

/** Absolute URL for a path (canonical, sitemap, Open Graph, JSON-LD). */
export function absoluteUrl(path: string, siteUrl: string = getSiteUrl()): string {
  if (/^https?:\/\//i.test(path)) return path
  return siteUrl + (path.startsWith('/') ? path : `/${path}`)
}

/**
 * Path from route segments as Next.js passes them (already decoded), e.g. ['produkty', 'x-12'] →
 * '/produkty/x-12'. Used to look a document up by its legacy URL.
 */
export function pathFromSegments(segments: string[]): string {
  return (
    '/' +
    segments
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join('/')
  )
}

/**
 * Old category URLs look like `/produkty/<slug>-<id>` (products: `/produkty/<slug>-detail-<id>`).
 * Returns the last segment for such a path, otherwise null. Used by `src/proxy.ts` to send
 * category paths to the category route (which reads filter parameters and is rendered per
 * request), while product paths stay statically generated.
 */
export function legacyCategorySegment(pathname: string): string | null {
  const match = pathname.match(/^\/produkty\/([^/]+)\/?$/)
  if (!match) return null
  const segment = match[1]
  if (/-detail-\d+$/.test(segment) || !/-\d+$/.test(segment)) return null
  return segment
}

/** Request header the proxy uses to pass the original legacy category path to the route. */
export const LEGACY_CATEGORY_HEADER = 'x-terrys-legacy-category'
