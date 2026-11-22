import type { CrawlState } from './crawlState'
import type { InventoryRow } from './inventory'
import { toPathAndQuery } from './urls'

const SKIP_NOTES: Record<string, string> = {
  search: 'vyhledávání – neprocházeno',
  query: 'parametr v URL (řazení/filtr) – neprocházeno',
  'blocked-path': 'košík/účet/systémová adresa – neprocházeno',
  'not-in-cache': 'není v cache (offline běh)',
}

function pathOrEmpty(url: string | undefined): string {
  if (!url) return ''
  try {
    return toPathAndQuery(url)
  } catch {
    return url
  }
}

/** Builds inventory rows from the crawl state; keeps the import columns of an existing file. */
export function buildInventoryRows(state: CrawlState, existing: InventoryRow[]): InventoryRow[] {
  const previous = new Map(existing.map((row) => [row.old_url, row]))
  return Object.values(state.entries).map((entry) => {
    const oldUrl = toPathAndQuery(entry.url)
    const canonical = pathOrEmpty(entry.canonical)
    const notes: string[] = []
    if (entry.skipReason) notes.push(SKIP_NOTES[entry.skipReason] ?? entry.skipReason)
    if (entry.type === 'file') notes.push(`soubor (${entry.title ?? 'ne HTML'}) – přenést ručně`)
    if (canonical && canonical !== oldUrl && entry.status === 200) notes.push(`alias, kanonická ${canonical}`)
    if (entry.status && entry.status >= 400) notes.push(`chyba na starém webu (nalezeno na ${pathOrEmpty(entry.foundOn) || entry.foundOn})`)
    if (!entry.fromSitemap && entry.status === 200 && !entry.skipReason) notes.push('není v sitemap.xml')
    const prev = previous.get(oldUrl)
    return {
      old_url: oldUrl,
      type: entry.type,
      http_status: entry.status ? String(entry.status) : '',
      title: entry.title ?? '',
      canonical,
      redirect_to: pathOrEmpty(entry.location),
      new_collection: prev?.new_collection ?? '',
      new_slug: prev?.new_slug ?? '',
      note: notes.join('; '),
    }
  })
}
