import { OLD_HOST, OLD_ORIGIN } from './config'

/**
 * URL rules of the old terrys.cz (EasyWeb). Pure functions, unit-tested in urls.test.ts.
 *
 * Known patterns (the old site resolves pages by the trailing numeric ID, so several slugs can
 * lead to the same page – the canonical URL tells which one is the "real" one):
 * - product        /produkty/<slug>-detail-<id>
 * - category       /produkty/<slug>-<id>       (+ pagination /produkty/<slug>-<id>/<n>)
 * - all products   /produkty                   (+ ?Page=<n>)
 * - magazine       /magazin/<slug>-detail-<id> (article), /magazin/<slug>-<id> (rubric)
 * - Terrys Academy /academy, /academy-magazin/<slug>-detail-<id>
 * - glossary       /pojmy/<slug>-detail-<id>, /pojmy/<slug>-<id>
 * - recipes        /recepty/<slug>-detail-<id>, /recepty/<slug>-<id>
 * - shops          /prodejny/<slug>-detail-<id>
 * - search         /vyhledavani?ProductsSearch=…
 * - static pages   /doprava-a-platba, /obchodni-podminky, …
 */

export type PageType =
  | 'home'
  | 'product'
  | 'category'
  | 'category-page'
  | 'product-listing'
  | 'article'
  | 'article-listing'
  | 'academy'
  | 'academy-article'
  | 'glossary-term'
  | 'glossary-listing'
  | 'recipe'
  | 'recipe-listing'
  | 'store'
  | 'store-listing'
  | 'static'
  | 'search'
  /** Not an HTML page (PDF etc.), found by its Content-Type. */
  | 'file'
  | 'unknown'

/** Query parameters the old site uses for real content (pagination, rubric context). */
const ALLOWED_QUERY_PARAMS = new Set(['page', 'catid', 'id'])

/**
 * Paths we never request: shopping cart, checkout, customer account, login, system files.
 * The crawler is strictly read-only; none of these are needed for the migration.
 */
const BLOCKED_PATH_PATTERNS: RegExp[] = [
  /^\/ew\//i, // images and EasyWeb system handlers (images are fetched separately)
  /^\/templates\//i,
  /\.axd$/i,
  /^\/api\//i,
  /kosik/i,
  /objednavk/i, // objednavka, objednavky (but /prubeh-objednavky is a static info page, see below)
  /prihlas/i,
  /odhlas/i,
  /registrac/i,
  /muj-ucet/i,
  /zapomenute-heslo/i,
  /login/i,
  /logout/i,
  /cart/i,
  /basket/i,
  /checkout/i,
  /\.(jpe?g|png|gif|webp|svg|pdf|zip|docx?|xlsx?|css|js|ico|xml|txt|mp4)$/i,
]

/** Static info pages whose path happens to match a blocked word but are plain content. */
const ALWAYS_ALLOWED_PATHS = new Set(['/prubeh-objednavky'])

/**
 * Resolves `href` against `base` and returns a normalised absolute URL of the old site, or
 * `null` for anything that is not an http(s) link to www.terrys.cz / terrys.cz
 * (mailto:, tel:, javascript:, other domains incl. terrys.live).
 * Normalisation: https, host www.terrys.cz, no fragment, no default port.
 */
export function normalizeUrl(href: string | undefined | null, base: string = OLD_ORIGIN): string | null {
  if (!href) return null
  const trimmed = href.trim()
  if (!trimmed || /^(mailto|tel|javascript|data|sms|whatsapp|fb-messenger):/i.test(trimmed)) return null
  let url: URL
  try {
    url = new URL(trimmed, base)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase()
  if (host !== OLD_HOST && host !== 'terrys.cz') return null
  url.protocol = 'https:'
  url.hostname = OLD_HOST
  url.port = ''
  url.hash = ''
  return url.toString()
}

/** Path + query of an absolute old-site URL ("/produkty/x-1?Page=2"). */
export function toPathAndQuery(url: string): string {
  const u = new URL(url)
  return u.pathname + u.search
}

/** Absolute URL from a path ("/produkty" → "https://www.terrys.cz/produkty"). */
export function toAbsolute(pathOrUrl: string): string {
  return new URL(pathOrUrl, OLD_ORIGIN).toString()
}

export interface CrawlDecision {
  crawl: boolean
  /** Why the URL is not crawled (for the report). */
  reason?: 'blocked-path' | 'query' | 'search'
}

/**
 * Should the crawler request this (already normalised) URL?
 * Search result pages and URLs with unknown query parameters (sorting, filters, …) are listed in
 * the inventory but not fetched: they are endless variations of pages we already have.
 */
export function crawlDecision(url: string): CrawlDecision {
  const u = new URL(url)
  const path = u.pathname
  if (/^\/vyhledavani/i.test(path)) return { crawl: false, reason: 'search' }
  if (!ALWAYS_ALLOWED_PATHS.has(path.toLowerCase())) {
    if (BLOCKED_PATH_PATTERNS.some((re) => re.test(path))) return { crawl: false, reason: 'blocked-path' }
  }
  for (const key of u.searchParams.keys()) {
    if (!ALLOWED_QUERY_PARAMS.has(key.toLowerCase())) return { crawl: false, reason: 'query' }
  }
  return { crawl: true }
}

const DETAIL_RE = /^\/([a-z0-9-]+)\/(.+)-detail-(\d+)\/?$/i
const LISTING_RE = /^\/([a-z0-9-]+)\/(.+)-(\d+)(?:\/(\d+))?\/?$/i

export interface ClassifiedUrl {
  type: PageType
  /** Numeric ID of the old site (product item ID, category ID, article ID, …). */
  oldId?: number
  /** Slug part of the URL (without the ID). */
  slug?: string
  /** Pagination number for category pages ("/produkty/x-106/2" → 2, "?Page=3" → 3). */
  pageNumber?: number
}

/** Page type from the URL alone. The crawler may refine it from the page content. */
export function classifyUrl(url: string): ClassifiedUrl {
  const u = new URL(url)
  const path = u.pathname.replace(/\/+$/, '') || '/'
  const queryPage = Number(u.searchParams.get('Page') ?? u.searchParams.get('page') ?? '') || undefined

  if (path === '/') return { type: 'home' }
  if (/^\/vyhledavani/i.test(path)) return { type: 'search' }

  const detail = DETAIL_RE.exec(path)
  if (detail) {
    const [, section, slug, id] = detail
    const base = { oldId: Number(id), slug, pageNumber: queryPage }
    switch (section.toLowerCase()) {
      case 'produkty':
        return { type: 'product', ...base }
      case 'magazin':
        return { type: 'article', ...base }
      case 'academy-magazin':
        return { type: 'academy-article', ...base }
      case 'pojmy':
        return { type: 'glossary-term', ...base }
      case 'recepty':
        return { type: 'recipe', ...base }
      case 'prodejny':
        return { type: 'store', ...base }
      default:
        return { type: 'unknown', ...base }
    }
  }

  const sectionOnly = path.split('/').filter(Boolean)
  if (sectionOnly.length === 1) {
    switch (sectionOnly[0].toLowerCase()) {
      case 'produkty':
        return { type: 'product-listing', pageNumber: queryPage }
      case 'magazin':
        return { type: 'article-listing', pageNumber: queryPage }
      case 'academy':
      case 'academy-magazin':
        return { type: 'academy', pageNumber: queryPage }
      case 'pojmy':
        return { type: 'glossary-listing', pageNumber: queryPage }
      case 'recepty':
        return { type: 'recipe-listing', pageNumber: queryPage }
      case 'prodejny':
        return { type: 'store-listing' }
      default:
        return { type: 'static' }
    }
  }

  const listing = LISTING_RE.exec(path)
  if (listing) {
    const [, section, slug, id, pageNo] = listing
    const pageNumber = pageNo ? Number(pageNo) : queryPage
    const base = { oldId: Number(id), slug, pageNumber }
    switch (section.toLowerCase()) {
      case 'produkty':
        return { type: pageNo ? 'category-page' : 'category', ...base }
      case 'magazin':
      case 'academy-magazin':
        return { type: 'article-listing', ...base }
      case 'pojmy':
        return { type: 'glossary-listing', ...base }
      case 'recepty':
        return { type: 'recipe-listing', ...base }
      default:
        return { type: 'unknown', ...base }
    }
  }

  if (/^\/pages\//i.test(path)) return { type: 'static' }
  return { type: 'unknown' }
}
