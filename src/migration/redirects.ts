/**
 * `pnpm migrate:redirects` – writes the redirect plan of the old addresses (stage 8b):
 *   migration/redirect-plan.csv     every old URL → expected status + final address + rule
 *   migration/redirects-report.md   the same for people: summary, owner decisions, all redirects
 *
 * Inputs: migration/url-inventory.csv (the crawl) + the database (which pages exist, hidden
 * products, redirects from the admin) + internal links inside imported texts. Offline: no HTTP
 * at all. The rules themselves live in src/lib/redirects/legacy.ts (the running site uses the
 * same code), so the plan shows exactly what the site will do with today's data.
 *
 * Database: MIGRATION_DATABASE_URL when set (e.g. …/terrys_migration), otherwise DATABASE_URL.
 */
import fs from 'fs/promises'
import path from 'path'

import { legacyIndex } from '@/lib/redirects/legacy'
import { getPublicPath, type PublicCollection } from '@/lib/urls'

import { INVENTORY_FILE, MIGRATION_DIR } from './config'
import { readInventory } from './inventory'
import { crossCheck, planFor, planToCsv, type PlanRow, renderRedirectReport } from './redirectPlan'

export const PLAN_FILE = path.join(MIGRATION_DIR, 'redirect-plan.csv')
export const REDIRECT_REPORT_FILE = path.join(MIGRATION_DIR, 'redirects-report.md')

if (process.env.MIGRATION_DATABASE_URL) process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL
const database = new URL(process.env.DATABASE_URL ?? 'postgres://x/unknown').pathname.replace(/^\//, '')
// Read-only script: never let Payload's development schema push touch the database.
process.env.PAYLOAD_MIGRATING = 'true'

const { getPayload } = await import('payload')
const { default: config } = await import('@payload-config')
const { buildLegacyIndexData } = await import('@/redirects/legacyIndex')
const payload = await getPayload({ config })

const rows = await readInventory(INVENTORY_FILE)
if (!rows.length) {
  console.error('Chybí migration/url-inventory.csv – nejdřív pnpm migrate:crawl.')
  process.exit(1)
}

const data = await buildLegacyIndexData(payload)
const index = legacyIndex(data)

// Public path of every imported document by (collection, slug), null when not public.
const collections: PublicCollection[] = ['products', 'categories', 'articles', 'recipes', 'pages']
const docPaths = new Map<string, string | null>()
const texts: { collection: string; legacyUrl: string; json: unknown }[] = []
for (const collection of collections) {
  const result = await payload.find({
    collection,
    depth: 0,
    limit: 0,
    pagination: false,
    draft: false,
    overrideAccess: true,
  })
  for (const doc of result.docs as unknown as Record<string, unknown>[]) {
    const publicPath = getPublicPath(collection, doc)
    docPaths.set(`${collection}:${String(doc.slug)}`, index.isServed(publicPath) ? publicPath : null)
    texts.push({ collection, legacyUrl: publicPath, json: doc })
  }
}

const plan: PlanRow[] = rows.map((row) => {
  const planned = planFor(row.old_url, index)
  // The old listings answered 302 → their newest article; the new site has real listings there,
  // so the importer's "imported into" record of those rows is not a target to compare with.
  const oldListingRedirect = row.http_status.startsWith('30') && /listing|^academy$/.test(row.type)
  const docPath =
    row.new_collection && row.new_slug && !oldListingRedirect
      ? docPaths.get(`${row.new_collection}:${row.new_slug}`)
      : undefined
  const notes = [crossCheck(planned, docPath)]
  if (oldListingRedirect) notes.push('starý web dočasně (302) přesměrovával na nejnovější článek; nový web má výpis')
  if (row.type === 'file') notes.push('soubor (PDF) se nepřenáší')
  if (planned.rule === 'unknown-content' && !row.new_collection && /^(article|recipe)$/.test(row.type)) {
    // Found only with side-list parameters, so the crawl never fetched the page itself (fixed in
    // crawl.ts – the next crawl + import brings it in and the redirect switches off by itself).
    notes.push('stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení')
  }
  return { ...planned, source: 'inventory', note: notes.filter(Boolean).join('; ') }
})

// Internal links inside imported rich texts (Lexical link nodes: fields.url).
const inventoryUrls = new Set(rows.map((r) => r.old_url))
const linkUrls = new Map<string, string>()
const walk = (node: unknown, foundIn: string) => {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, foundIn))
  if (!node || typeof node !== 'object') return
  const record = node as Record<string, unknown>
  const fields = record.fields as Record<string, unknown> | undefined
  const url = (record.type === 'link' || record.type === 'autolink') && typeof fields?.url === 'string' ? fields.url : null
  if (url && url.startsWith('/') && !url.startsWith('//') && !linkUrls.has(url)) linkUrls.set(url, foundIn)
  for (const value of Object.values(record)) walk(value, foundIn)
}
for (const text of texts) walk(text.json, text.legacyUrl)
for (const [url, foundIn] of [...linkUrls.entries()].sort()) {
  const known = inventoryUrls.has(url) ? 'adresa je i v inventuře; ' : ''
  plan.push({ ...planFor(url, index), source: 'text', note: `${known}odkaz na ${foundIn}` })
}

await fs.writeFile(PLAN_FILE, planToCsv(plan), 'utf8')
await fs.writeFile(
  REDIRECT_REPORT_FILE,
  renderRedirectReport(plan, { generatedAt: new Date().toISOString(), database }),
  'utf8',
)

const inv = plan.filter((r) => r.source === 'inventory')
const n = (s: string) => inv.filter((r) => r.expected_status === s).length
console.log(
  `Plán: ${inv.length} adres z inventury – 200: ${n('200')}, 308: ${n('308')}, 404: ${n('404')}; ` +
    `k rozhodnutí: ${inv.filter((r) => r.needs_owner === 'ano').length}; ` +
    `nesouhlasí s importem: ${inv.filter((r) => r.note.includes('NESOUHLASÍ')).length}; ` +
    `odkazy v textech: ${plan.length - inv.length}.`,
)
console.log(`Zapsáno: ${path.relative(process.cwd(), PLAN_FILE)}, ${path.relative(process.cwd(), REDIRECT_REPORT_FILE)}`)
process.exit(0)
