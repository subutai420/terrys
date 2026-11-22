/**
 * `pnpm migrate:import` – loads the crawled old terrys.cz (migration/.cache, created by
 * `pnpm migrate:crawl`) into Payload and writes migration/report.md + the target columns of
 * migration/url-inventory.csv.
 *
 * Options:
 *   --dry-run                 nothing is written (no documents, no images, no network)
 *   --only=products,articles  only some types: categories, products, articles, recipes, pages
 *   --limit=N                 at most N items per type (quick test)
 *   --force                   also overwrite documents edited in the admin (never locked ones)
 *
 * Target database: MIGRATION_DATABASE_URL when set (recommended, e.g. …/terrys_migration),
 * otherwise DATABASE_URL. The database must have the schema (`pnpm payload migrate`).
 */
import fs from 'fs/promises'

import { parseArgs } from './args'
import { INVENTORY_FILE, REPORT_FILE } from './config'
import { readCrawlState } from './crawlState'
import { readInventory, writeInventory } from './inventory'
import { applyTargetsToInventory, IMPORT_KINDS, type ImportKind, runImport } from './loader'
import { renderReport } from './report'

const args = parseArgs(process.argv.slice(2))
const only = (args.string('only') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean) as ImportKind[]
const invalid = only.filter((k) => !IMPORT_KINDS.includes(k))
if (invalid.length) {
  console.error(`Neznámý typ v --only: ${invalid.join(', ')}. Povolené: ${IMPORT_KINDS.join(', ')}`)
  process.exit(1)
}

if (process.env.MIGRATION_DATABASE_URL) process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL
const databaseName = new URL(process.env.DATABASE_URL ?? 'postgres://x/unknown').pathname.replace(/^\//, '')
console.log(`Cílová databáze: ${databaseName}${args.flag('dry-run') ? ' (zkušební běh, nic se nezapíše)' : ''}`)

const state = await readCrawlState()
if (!state) {
  console.error('Chybí migration/.cache/crawl-state.json – nejdřív spusťte pnpm migrate:crawl.')
  process.exit(1)
}

// Never let Payload's development "schema push" touch the target database: its schema comes from
// migrations (`pnpm payload migrate`). PAYLOAD_MIGRATING=true is the adapter's switch for that.
process.env.PAYLOAD_MIGRATING = 'true'

// The config reads DATABASE_URL when imported, so import it only after the override above.
const { getPayload } = await import('payload')
const { default: config } = await import('@payload-config')
const payload = await getPayload({ config })

const result = await runImport(payload, state, {
  dryRun: args.flag('dry-run'),
  only,
  limit: args.number('limit'),
  force: args.flag('force'),
  log: (m) => console.log(m),
})

let inventory = await readInventory(INVENTORY_FILE)
if (!result.dryRun) {
  inventory = applyTargetsToInventory(inventory, result.targets)
  await writeInventory(INVENTORY_FILE, inventory)
}
await fs.writeFile(REPORT_FILE, renderReport(result, inventory, databaseName), 'utf8')

const summary: Record<string, Record<string, number>> = {}
for (const item of result.items) {
  summary[item.kind] ??= {}
  summary[item.kind][item.action] = (summary[item.kind][item.action] ?? 0) + 1
}
console.log('\nVýsledek:')
for (const kind of IMPORT_KINDS) {
  console.log(`  ${kind.padEnd(11)} nalezeno ${String(result.found[kind]).padStart(4)}  ${JSON.stringify(summary[kind] ?? {})}`)
}
console.log(`Obrázky: nahráno ${result.mediaUploaded}, znovu použito ${result.mediaReused}, problémů ${result.mediaProblems.length}`)
console.log('Report: migration/report.md')
// The Payload CLI closes the database connection and exits after this script.
