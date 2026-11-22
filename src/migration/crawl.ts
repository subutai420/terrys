/**
 * `pnpm migrate:crawl` – discovers every public URL of the old terrys.cz, saves the pages (and
 * the images used by migrated content) into the git-ignored cache migration/.cache and writes
 * migration/url-inventory.csv.
 *
 * Polite and read-only (see fetcher.ts): sequential GET requests with a pause, descriptive
 * User-Agent, cache (a re-run requests only what is not cached yet), back-off on errors.
 * Never submits forms, never touches the cart, never logs in, never leaves www.terrys.cz.
 *
 * Options (after `--` when run through pnpm is not needed; pnpm passes them through):
 *   --max-pages=N   stop discovering after N fetched pages (for a quick test)
 *   --no-images     skip the image phase
 *   --offline       use only the cache (rebuild inventory without network)
 */
import fs from 'fs/promises'

import { INVENTORY_FILE, MIGRATION_DIR, OLD_ORIGIN } from './config'
import { type CrawlEntry, type CrawlState, readCrawlState, writeCrawlState } from './crawlState'
import { collectImageUrls } from './extract'
import { CrawlAbortedError, PoliteFetcher } from './fetcher'
import { extractInternalLinks, extractPageMeta, loadHtml } from './html'
import { buildInventoryRows } from './inventoryRows'
import { readInventory, writeInventory } from './inventory'
import { parseArgs } from './args'
import { aliasBaseUrl, classifyUrl, crawlDecision, normalizeUrl, toAbsolute } from './urls'

const args = parseArgs(process.argv.slice(2))
const maxPages = args.number('max-pages') ?? Infinity
const log = (message: string) => console.log(message)
const fetcher = new PoliteFetcher({ offline: args.flag('offline'), log })

const previous = await readCrawlState()
const state: CrawlState = {
  startedAt: new Date().toISOString(),
  entries: {},
  images: previous?.images ?? {},
}

const queue: string[] = []
function enqueue(url: string | null, foundOn?: string, fromSitemap = false) {
  if (!url) return
  // Links to image files / system resources are not pages: leave them out of the inventory.
  if (/^\/(ew|templates)\/|\.axd$/i.test(new URL(url).pathname)) return
  const existing = state.entries[url]
  if (existing) {
    if (fromSitemap) existing.fromSitemap = true
    return
  }
  const decision = crawlDecision(url)
  state.entries[url] = {
    url,
    type: classifyUrl(url).type,
    foundOn,
    fromSitemap: fromSitemap || undefined,
    skipReason: decision.crawl ? undefined : decision.reason,
  }
  if (decision.crawl) queue.push(url)
  // Stage 8b: also fetch the plain address of a detail page seen only with list parameters.
  else if (decision.reason === 'query') enqueue(aliasBaseUrl(url), foundOn, false)
}

// ------------------------------------------------------------------ 1. robots.txt + sitemap
const sitemapUrls = new Set<string>([toAbsolute('/sitemap.xml')])
const robots = await fetcher.getPage(toAbsolute('/robots.txt'))
for (const line of (robots?.body ?? '').split(/\r?\n/)) {
  const m = /^\s*sitemap:\s*(\S+)/i.exec(line)
  if (m) {
    const url = normalizeUrl(m[1])
    if (url) sitemapUrls.add(url)
  }
  if (/^\s*disallow:\s*\S/i.test(line)) log(`robots.txt: ${line.trim()}`)
}
let sitemapCount = 0
for (const sitemapUrl of sitemapUrls) {
  const sitemap = await fetcher.getPage(sitemapUrl)
  for (const m of (sitemap?.body ?? '').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    const loc = m[1].replace(/&amp;/g, '&')
    if (/\.xml$/i.test(loc)) {
      const nested = normalizeUrl(loc)
      if (nested) sitemapUrls.add(nested)
      continue
    }
    enqueue(normalizeUrl(loc), 'sitemap.xml', true)
    sitemapCount++
  }
}
log(`Sitemap: ${sitemapCount} URL`)

// ------------------------------------------------------------------ 2. pages (breadth first)
for (const seed of ['/', '/produkty', '/magazin', '/recepty', '/academy', '/academy-magazin', '/pojmy', '/prodejny', '/doprava-a-platba']) {
  enqueue(toAbsolute(seed), 'seed')
}

let fetched = 0
try {
  while (queue.length && fetched < maxPages) {
    const url = queue.shift() as string
    const entry = state.entries[url] as CrawlEntry
    const page = await fetcher.getPage(url)
    fetched++
    if (!page) {
      entry.skipReason = 'not-in-cache'
      continue
    }
    entry.status = page.status
    if (page.location) {
      const target = normalizeUrl(page.location, url)
      entry.location = target ?? page.location
      enqueue(target, url)
    }
    if (page.status === 200 && !(page.contentType ?? 'text/html').includes('html')) {
      // E.g. /jidelni-listek is a PDF served under a page-like URL.
      entry.type = 'file'
      entry.title = page.contentType
    }
    if (page.status === 200 && (page.contentType ?? 'text/html').includes('html')) {
      const $ = loadHtml(page.body)
      const meta = extractPageMeta($, url)
      entry.title = meta.title
      entry.canonical = meta.canonical
      const productsList = (meta.context?.productsList ?? meta.context?.articlesList) as
        | { viewType?: string }
        | undefined
      entry.viewType = productsList?.viewType
      for (const link of extractInternalLinks($, url)) enqueue(link, url)
      if (meta.canonical) enqueue(normalizeUrl(meta.canonical, url), url)
    }
    if (fetched % 25 === 0) {
      log(`… ${fetched} stránek, ve frontě ${queue.length}, požadavků na web ${fetcher.networkRequests}`)
      await writeCrawlState(state)
    }
  }
} catch (error) {
  if (error instanceof CrawlAbortedError) {
    log(`CHYBA: ${error.message}`)
    await writeCrawlState(state)
    process.exit(1)
  }
  throw error
}
log(`Stránky hotové: ${fetched} zpracováno, ${fetcher.networkRequests} požadavků na web.`)

// ------------------------------------------------------------------ 3. images of migrated content
if (!args.flag('no-images')) {
  const imageUrls = new Map<string, string>()
  for (const entry of Object.values(state.entries)) {
    if (entry.status !== 200) continue
    const page = await fetcher.readCachedPage(entry.url)
    if (!page) continue
    for (const img of collectImageUrls(entry.type, page.body, entry.url)) {
      if (!imageUrls.has(img)) imageUrls.set(img, entry.url)
    }
  }
  log(`Obrázky: ${imageUrls.size} adres`)
  let done = 0
  try {
    for (const [img, foundOn] of imageUrls) {
      const result = await fetcher.getBinary(img)
      state.images[img] = { status: result?.status ?? 0, foundOn }
      if (++done % 50 === 0) {
        log(`… ${done}/${imageUrls.size} obrázků, požadavků na web ${fetcher.networkRequests}`)
        await writeCrawlState(state)
      }
    }
  } catch (error) {
    if (error instanceof CrawlAbortedError) {
      log(`CHYBA: ${error.message}`)
      await writeCrawlState(state)
      process.exit(1)
    }
    throw error
  }
}

// ------------------------------------------------------------------ 4. fonts used by the old CSS
// Only reported (business rule 8: no unlicensed fonts); nothing is copied.
const home = await fetcher.readCachedPage(toAbsolute('/'))
if (home) {
  const $ = loadHtml(home.body)
  const fonts = new Set<string>()
  const stylesheets = $('link[rel="stylesheet"]')
    .map((_, el) => $(el).attr('href'))
    .get()
    .filter(Boolean)
  for (const href of stylesheets) {
    if (/fonts\.googleapis\.com/.test(href)) continue
    const abs = new URL(href.replace(/&amp;/g, '&'), OLD_ORIGIN)
    if (abs.hostname !== 'www.terrys.cz') {
      fonts.add(`externí CSS (nestahováno): ${abs.toString()}`)
      continue
    }
    const css = await fetcher.getPage(abs.toString())
    for (const m of (css?.body ?? '').matchAll(/url\(\s*['"]?([^'")]+\.(?:woff2?|ttf|otf|eot)(?:[?#][^'")]*)?)['"]?\s*\)/gi)) {
      const font = new URL(m[1], abs)
      // Fonts loaded from Google Fonts (fonts.gstatic.com) are fine; list the others.
      fonts.add(font.hostname === 'www.terrys.cz' ? font.pathname : font.toString())
    }
  }
  state.fonts = [...fonts].sort()
}

state.finishedAt = new Date().toISOString()
await writeCrawlState(state)

// ------------------------------------------------------------------ 5. inventory
const existing = await readInventory(INVENTORY_FILE)
const rows = buildInventoryRows(state, existing)
await fs.mkdir(MIGRATION_DIR, { recursive: true })
await writeInventory(INVENTORY_FILE, rows)

const counts = new Map<string, number>()
for (const row of rows) counts.set(row.type, (counts.get(row.type) ?? 0) + 1)
log(`\nInventura URL (${rows.length}) → migration/url-inventory.csv`)
for (const [type, count] of [...counts].sort((a, b) => b[1] - a[1])) log(`  ${type.padEnd(18)} ${count}`)
log(`Požadavků na web v tomto běhu: ${fetcher.networkRequests}`)
