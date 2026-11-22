/**
 * Redirects from the old terrys.cz addresses (stage 8b). Pure module: no Payload, no Next, no
 * network – used by `src/proxy.ts`, by the storefront's not-found fallback, by the admin
 * validation of the `redirects` collection, by the redirect report and by the checker.
 *
 * How the old site worked: EasyWeb resolved a page by the trailing numeric ID, so several
 * spellings led to the same page (`/produkty/rib-eye-106` and `/produkty/vysoky-rostenec-rib-eye-106`),
 * listing and side-list state was kept in query parameters (`?page=4&catId=101&list=hide`,
 * `?Id=807`, `/produkty?Page=3`) and category pages had a page suffix (`/produkty/x-23/1`).
 *
 * The new site serves every imported document at its old address (`legacyUrl`, see
 * `src/lib/urls.ts`), so only the aliases need a redirect. The decision for a request is:
 *
 *   1. Normalise the address: lower case, no trailing or double slash, no old host glued into the
 *      path (`/magazin/terrys.cz/magazin/…`), no category page suffix (`/1`, `/2` …), and drop the
 *      old alias parameters (`page`, `catId`, `Id`, `list`, `Lang`, `druh_masa`). Every other
 *      parameter is kept (utm_*, gclid, fbclid, varianta, …) so attribution survives.
 *   2. A page that exists (`served`) always wins – a redirect can never hide a published page.
 *   3. Otherwise a redirect entered by the owner in the admin (`redirects` collection).
 *   4. Otherwise automatic rules: a non-public product → its category; the same old ID under
 *      another slug → that document; a rubric or an unknown article/recipe → the section
 *      listing; old cart/account addresses → cart/homepage. Unknown product/category IDs → 404.
 *
 * The result is always the FINAL address (chains are followed here, loops are detected), so a
 * visitor gets exactly one 308 hop. Status 308 (permanent) everywhere: it is what Next.js uses
 * for permanent redirects (`permanentRedirect`, `redirects` with `permanent: true`), search
 * engines treat it exactly like 301, and one status keeps the checker simple.
 */

/** Status of every redirect issued by this module. */
export const REDIRECT_STATUS = 308

/**
 * What the server knows about the site, built by `src/redirects/legacyIndex.ts` from the database
 * (public documents, non-public products, owner redirects). Plain JSON so it can be cached and
 * sent to the proxy.
 */
export type LegacyIndexData = {
  /** Public path of every public document (its legacy URL, or the clean path when it has none). */
  served: string[]
  /** Legacy path of every NON-public product (draft or hidden) → where to send visitors. */
  retired: Record<string, string>
  /** Active redirects from the admin: normalised source path → target (path, maybe with query). */
  redirects: Record<string, string>
}

/** Listing and system pages of the new storefront that always exist (fixed routes). */
export const FIXED_ROUTES = [
  '/',
  '/produkty',
  '/magazin',
  '/academy',
  '/pojmy',
  '/recepty',
  '/prodejny',
  '/vyhledavani',
  '/kosik',
  '/objednavka',
  '/odstoupeni-od-smlouvy',
] as const

/**
 * Query parameters of the OLD site that only changed listing or side-list state. Compared in
 * lower case. Dropped from old addresses; the new site uses other names (`strana`, `druh`, …).
 */
export const OLD_ALIAS_PARAMS = new Set(['page', 'catid', 'id', 'list', 'lang', 'druh_masa'])

/** Rules that can produce a redirect (the report and the checker print them). */
export type RedirectRule =
  /** The address only needed normalising (alias parameters, case, slashes, page suffix). */
  | 'normalized'
  /** Redirect entered by the owner in the admin. */
  | 'owner'
  /** Product exists but is not public (draft / hidden) → its first public category. */
  | 'retired-product'
  /** The old site resolved pages by ID: same ID, other slug → that document. */
  | 'same-id'
  /** Old rubric (article / recipe / glossary category) → the section listing. */
  | 'rubric'
  /** Old article, recipe, glossary term or store page that does not exist here → section listing. */
  | 'unknown-content'
  /** Old cart → new cart. */
  | 'old-cart'
  /** Old customer account / login → homepage (the new shop has no accounts). */
  | 'old-account'
  /** The restaurant/shop menu PDF of the old site → the Prague store page. */
  | 'menu-pdf'

export type LegacyResolution = {
  /** Final address on the new site: a path, owner targets may carry a query string. */
  target: string
  rule: RedirectRule | 'served'
  /** The target is a best guess that the owner should confirm (listed in the report). */
  needsOwner?: boolean
}

// ------------------------------------------------------------------------------------- index

type Sections = {
  product: Map<number, string>
  category: Map<number, string>
  article: Map<number, string>
  recipe: Map<number, string>
  store: Map<number, string>
}

/** Fast lookups over `LegacyIndexData` (built once per data object). */
export class LegacyIndex {
  readonly served: Set<string>
  readonly retired: Map<string, string>
  readonly redirects: Map<string, string>
  readonly byId: Sections
  readonly retiredById: Map<number, string>

  constructor(readonly data: LegacyIndexData) {
    this.served = new Set<string>([...FIXED_ROUTES, ...data.served])
    this.retired = new Map(Object.entries(data.retired))
    this.redirects = new Map(Object.entries(data.redirects))
    this.byId = {
      product: new Map(),
      category: new Map(),
      article: new Map(),
      recipe: new Map(),
      store: new Map(),
    }
    for (const path of data.served) {
      const id = oldIdOf(path)
      // The first document wins when two share an ID (should not happen).
      if (id && !this.byId[id.section].has(id.id)) this.byId[id.section].set(id.id, path)
    }
    this.retiredById = new Map()
    for (const [path, target] of this.retired) {
      const id = oldIdOf(path)
      if (id?.section === 'product') this.retiredById.set(id.id, target)
    }
  }

  isServed(path: string): boolean {
    return this.served.has(path)
  }
}

const indexCache = new WeakMap<LegacyIndexData, LegacyIndex>()

/** Memoised `new LegacyIndex(data)`. */
export function legacyIndex(data: LegacyIndexData): LegacyIndex {
  let index = indexCache.get(data)
  if (!index) {
    index = new LegacyIndex(data)
    indexCache.set(data, index)
  }
  return index
}

/** Old ID and kind of an old-style path, e.g. `/produkty/x-detail-406` → product 406. */
export function oldIdOf(path: string): { section: keyof Sections; id: number } | null {
  let m = /^\/produkty\/[^/]+-detail-(\d+)$/.exec(path)
  if (m) return { section: 'product', id: Number(m[1]) }
  m = /^\/produkty\/[^/]+-(\d+)$/.exec(path)
  if (m) return { section: 'category', id: Number(m[1]) }
  m = /^\/(?:magazin|academy-magazin|pojmy)\/[^/]+-detail-(\d+)$/.exec(path)
  if (m) return { section: 'article', id: Number(m[1]) }
  m = /^\/recepty\/[^/]+-detail-(\d+)$/.exec(path)
  if (m) return { section: 'recipe', id: Number(m[1]) }
  m = /^\/prodejny\/[^/]+-detail-(\d+)$/.exec(path)
  if (m) return { section: 'store', id: Number(m[1]) }
  return null
}

// ----------------------------------------------------------------------------- normalising

/**
 * Path shape fixes that never depend on the database: duplicate and trailing slashes, the old
 * host glued into a relative link (`/magazin/terrys.cz/magazin/x-detail-1` → `/magazin/x-detail-1`),
 * the category page suffix (`/produkty/wagyu-98/3` → `/produkty/wagyu-98`; the old pages had
 * other sizes, so the first page is the honest target). Case is NOT changed here.
 */
export function normalizePathShape(pathname: string): string {
  let path = pathname.replace(/\/{2,}/g, '/')
  const glued = /\/(?:www\.)?terrys\.cz(\/.*)?$/i.exec(path)
  if (glued) path = glued[1] ?? '/'
  if (path.length > 1) path = path.replace(/\/+$/, '')
  const paged = /^(\/produkty\/[^/]+-\d+)\/\d+$/i.exec(path)
  if (paged && !/-detail-\d+$/i.test(paged[1])) path = paged[1]
  return path || '/'
}

/**
 * Addresses of the old site's shape (where old links can land). Only these are normalised and
 * resolved; everything else (clean paths, feeds, admin, assets) is left alone.
 */
export function isOldSpace(lowerPath: string): boolean {
  if (lowerPath === '/') return true
  if (
    /^\/(produkty|magazin|academy|academy-magazin|pojmy|recepty|prodejny|obchod|pages)(\/|$)/.test(
      lowerPath,
    )
  ) {
    return true
  }
  // Single-segment pages (/tym, /videa, /jidelni-listek, /muj-ucet …).
  return /^\/[a-z0-9-]+(\.aspx)?$/.test(lowerPath)
}

/** Routes of the new site that read their own query parameters: never strip anything there. */
const OWN_QUERY_ROUTES = new Set([
  '/vyhledavani',
  '/kosik',
  '/objednavka',
  '/odstoupeni-od-smlouvy',
])

/** Splits "path?query" (targets of owner redirects may carry a query). */
export function splitTarget(target: string): { path: string; query: string } {
  const i = target.indexOf('?')
  return i < 0
    ? { path: target, query: '' }
    : { path: target.slice(0, i), query: target.slice(i + 1) }
}

// ------------------------------------------------------------------------------- resolving

const MAX_DEPTH = 5

/**
 * Final address for a normalised, lower-case path (no query). `served` when the page exists as
 * it is; null when nothing fits (the request then ends in a 404).
 */
export function resolveLegacyPath(
  path: string,
  index: LegacyIndex,
  seen: Set<string> = new Set(),
): LegacyResolution | null {
  if (index.isServed(path)) return { target: path, rule: 'served' }
  if (seen.has(path) || seen.size >= MAX_DEPTH) return null // loop or absurd chain
  seen.add(path)

  // ---- owner redirects (admin), chains followed to the final page
  const owner = index.redirects.get(path)
  if (owner !== undefined) {
    const targetPath = splitTarget(owner).path
    if (index.isServed(targetPath)) return { target: owner, rule: 'owner' }
    // The target itself moved (e.g. a product hidden after the redirect was saved): follow it,
    // so the visitor still gets one hop. Its own query string is dropped in that case.
    const next = resolveLegacyPath(targetPath.toLowerCase(), index, seen)
    if (next) return { target: next.target, rule: 'owner', needsOwner: next.needsOwner }
    // Loop or a target that does not exist: ignore the owner redirect, try the rules.
  }

  // ---- non-public products → their category
  const retired = index.retired.get(path)
  if (retired) return { target: retired, rule: 'retired-product' }

  // ---- same old ID under another slug (the old site resolved pages by ID)
  const id = oldIdOf(path)
  if (id) {
    const same = index.byId[id.section].get(id.id)
    if (same) return { target: same, rule: 'same-id' }
    if (id.section === 'product') {
      const retiredTarget = index.retiredById.get(id.id)
      if (retiredTarget) return { target: retiredTarget, rule: 'retired-product' }
    }
  }

  return sectionFallback(path, index)
}

function sectionFallback(path: string, index: LegacyIndex): LegacyResolution | null {
  const one = (section: string) => new RegExp(`^/${section}/[^/]+$`).test(path)
  const isDetail = /-detail-\d+$/.test(path)
  const isRubric = !isDetail && /-\d+$/.test(path)

  // A product or category ID the database does not know at all (never imported, or deleted)
  // stays a real 404: a mass redirect of random IDs to /produkty would be a "soft 404" for
  // search engines, and every product of the old site was imported (hidden ones → category).
  if (one('produkty')) return null
  if (one('magazin') && (isDetail || isRubric)) {
    return isDetail
      ? { target: '/magazin', rule: 'unknown-content', needsOwner: true }
      : { target: '/magazin', rule: 'rubric' }
  }
  if (path === '/academy-magazin' || one('academy-magazin')) {
    return { target: '/academy', rule: isDetail ? 'unknown-content' : 'rubric' }
  }
  if (one('pojmy') && (isDetail || isRubric)) {
    return { target: '/pojmy', rule: isDetail ? 'unknown-content' : 'rubric' }
  }
  if (one('recepty') && (isDetail || isRubric)) {
    return isDetail
      ? { target: '/recepty', rule: 'unknown-content', needsOwner: true }
      : { target: '/recepty', rule: 'rubric' }
  }
  if (one('prodejny')) return { target: '/prodejny', rule: 'unknown-content' }

  if (/^\/(obchod\/)?kosik(\/.*)?$/.test(path)) return { target: '/kosik', rule: 'old-cart' }
  if (
    /^\/obchod(\/.*)?$/.test(path) ||
    /^\/(prihlaseni|prihlasit|odhlaseni|registrace|muj-ucet|zapomenute-heslo|objednavky|login|logout)$/.test(
      path,
    )
  ) {
    return { target: '/', rule: 'old-account' }
  }
  if (path === '/jidelni-listek') {
    const store = '/prodejny/prodejna-terrys-steak-praha-detail-382'
    return {
      target: index.isServed(store) ? store : '/prodejny',
      rule: 'menu-pdf',
      needsOwner: true,
    }
  }
  return null
}

// --------------------------------------------------------------------------- whole request

/** True for parameters to drop from an old address. */
export function isOldAliasParam(key: string): boolean {
  return OLD_ALIAS_PARAMS.has(key.toLowerCase())
}

/**
 * Target path(+query) merged with the parameters to keep from the request. The target's own
 * parameters come first; request parameters with the same name are not duplicated.
 */
export function buildLocation(target: string, kept: URLSearchParams): string {
  const { path, query } = splitTarget(target)
  const params = new URLSearchParams(query)
  for (const [key, value] of kept) if (!params.has(key)) params.append(key, value)
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

export type RedirectDecision = {
  /** Path + query to redirect to (same origin). */
  location: string
  rule: LegacyResolution['rule'] | 'slash'
  needsOwner?: boolean
}

/**
 * Decides one request: a redirect (exactly one hop to the final page) or null = let it through.
 * `index` may be null when the redirect table is not available yet (cold proxy): then only the
 * database-free fixes are applied, and only when they cannot create a chain.
 */
export function decideRedirect(
  pathname: string,
  search: string,
  index: LegacyIndex | null,
): RedirectDecision | null {
  const shaped = normalizePathShape(pathname)
  const lower = shaped.toLowerCase()

  if (!isOldSpace(lower)) {
    // Not an old address: only the trailing/duplicate slash (what Next.js does by default).
    return shaped !== pathname ? { location: shaped + search, rule: 'slash' } : null
  }

  const params = new URLSearchParams(search)
  const kept = new URLSearchParams()
  let dropped = false
  for (const [key, value] of params) {
    if (!OWN_QUERY_ROUTES.has(lower) && isOldAliasParam(key)) dropped = true
    else kept.append(key, value)
  }
  const changed = dropped || lower !== pathname

  if (!index) {
    // Without the table we cannot know whether `lower` exists or redirects further; fix only the
    // slashes (as Next.js would) and leave the rest to the storefront's not-found fallback.
    return shaped !== pathname ? { location: shaped + search, rule: 'slash' } : null
  }

  const resolution = resolveLegacyPath(lower, index)
  if (!resolution) {
    // Unknown address: fix only the slashes (one hop to the 404 Next.js would show anyway).
    return shaped !== pathname ? { location: shaped + search, rule: 'slash' } : null
  }
  if (resolution.rule === 'served' && !changed) return null

  const location = buildLocation(resolution.target, kept)
  const original = search
    ? `${pathname}${search.startsWith('?') ? search : `?${search}`}`
    : pathname
  if (location === original) return null
  return {
    location,
    rule: resolution.rule === 'served' ? 'normalized' : resolution.rule,
    needsOwner: resolution.needsOwner,
  }
}

// ------------------------------------------------------------------------- admin validation

/** Path prefixes that are never redirect sources (admin, API, Next internals, previews). */
const RESERVED_PREFIXES = ['/admin', '/api', '/_next', '/next/', '/feeds/']

/**
 * Normalises what an editor typed as a redirect source: a full old URL or a path. Returns the
 * lower-case path, or an error message (Czech, shown in the admin).
 */
export function normalizeRedirectSource(value: unknown): { path: string } | { error: string } {
  if (typeof value !== 'string' || !value.trim()) return { error: 'Vyplňte starou adresu.' }
  let raw = value.trim()
  const absolute = /^https?:\/\/[^/?#]+(.*)$/i.exec(raw)
  if (absolute) raw = absolute[1] || '/'
  if (!raw.startsWith('/'))
    return { error: 'Adresa musí začínat lomítkem, např. /produkty/neco-detail-123.' }
  raw = raw.split('#')[0]
  if (raw.includes('?')) {
    return {
      error:
        'Zadejte adresu bez otazníku a parametrů. Staré parametry (?page=, ?catId=, ?list=…) web ' +
        'odstraňuje sám, sledovací parametry (utm_…) se přenesou na cíl.',
    }
  }
  const path = normalizePathShape(raw).toLowerCase()
  if (path === '/') return { error: 'Úvodní stránku nelze přesměrovat.' }
  if (
    RESERVED_PREFIXES.some(
      (p) => path === p.replace(/\/$/, '') || path.startsWith(p.endsWith('/') ? p : `${p}/`),
    )
  ) {
    return { error: 'Tuto systémovou adresu nelze přesměrovat.' }
  }
  return { path }
}

/**
 * Normalises a redirect target: a path on this site (with an optional query) or a full URL of
 * this site / of terrys.cz (shortened to the path). Other websites are refused.
 */
export function normalizeRedirectTarget(
  value: unknown,
  ownHosts: string[] = [],
): { target: string } | { error: string } {
  if (typeof value !== 'string' || !value.trim()) return { error: 'Vyplňte cílovou adresu.' }
  let raw = value.trim().split('#')[0]
  const absolute = /^https?:\/\/([^/?#]+)(.*)$/i.exec(raw)
  if (absolute) {
    const host = absolute[1].toLowerCase()
    const allowed = ['terrys.cz', 'www.terrys.cz', ...ownHosts.map((h) => h.toLowerCase())]
    if (!allowed.includes(host)) {
      return { error: 'Přesměrovat lze jen na stránku tohoto webu (adresa začínající lomítkem).' }
    }
    raw = absolute[2] || '/'
  }
  if (!raw.startsWith('/') || raw.startsWith('//')) {
    return { error: 'Cílová adresa musí začínat lomítkem, např. /produkty/kategorie/wagyu.' }
  }
  const { path, query } = splitTarget(raw)
  const shaped = normalizePathShape(path)
  return { target: query ? `${shaped}?${query}` : shaped }
}

/**
 * Checks a redirect against the site (Czech messages for the admin). Rules:
 * - the source must not be a page that exists (it would never apply – a page always wins);
 * - the target must be a page that exists (so there is never a chain or a loop when saving);
 * - source and target differ.
 */
export function validateRedirect(
  from: string,
  to: string,
  index: LegacyIndex,
): { field: 'from' | 'to'; message: string } | null {
  const target = splitTarget(to).path
  if (target === from) return { field: 'to', message: 'Cíl je stejný jako stará adresa.' }
  if (index.isServed(from)) {
    return {
      field: 'from',
      message:
        'Na této adrese je zveřejněná stránka, přesměrování by se nikdy neuplatnilo. Nejdřív ' +
        'stránku skryjte (nebo jí změňte adresu) a pak přesměrování uložte.',
    }
  }
  if (!index.isServed(target)) {
    const via = resolveLegacyPath(target.toLowerCase(), index)
    if (via && via.rule !== 'served') {
      return {
        field: 'to',
        message: `Cílová adresa se sama přesměrovává na ${via.target}. Zadejte rovnou ${via.target}.`,
      }
    }
    return {
      field: 'to',
      message:
        'Na cílové adrese není žádná zveřejněná stránka. Zkontrolujte ji (otevřete ji na webu).',
    }
  }
  return null
}
