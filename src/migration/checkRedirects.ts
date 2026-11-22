/**
 * `pnpm migrate:check-redirects` – asks a RUNNING new site whether every old address behaves as
 * planned in migration/redirect-plan.csv (stage 8b; create the plan with `pnpm migrate:redirects`).
 *
 *   pnpm migrate:check-redirects                         against http://localhost:3000
 *   pnpm migrate:check-redirects --base=https://staging.example.cz
 *   options: --concurrency=4  --timeout=60000  --no-sitemap  --tracking-sample=25
 *            --allow-live-host  (only after the launch, when terrys.cz is the NEW site)
 *
 * Base URL: --base, else REDIRECT_CHECK_BASE_URL, else http://localhost:3000. Requests go ONLY
 * there (never to the old live site unless --allow-live-host). Failures are written to
 * migration/redirect-check-failures.csv (git-ignored); exit code 1 when anything failed.
 */
import fs from 'fs/promises'
import path from 'path'

import { parseArgs } from './args'
import { MIGRATION_DIR } from './config'
import { assertSafeBase, type FetchLike, runRedirectCheck } from './redirectCheck'
import { parsePlanCsv } from './redirectPlan'

const args = parseArgs(process.argv.slice(2))
const FAILURES_FILE = path.join(MIGRATION_DIR, 'redirect-check-failures.csv')
const PLAN_FILE = path.join(MIGRATION_DIR, 'redirect-plan.csv')

let base: URL
try {
  base = assertSafeBase(
    args.string('base') ?? process.env.REDIRECT_CHECK_BASE_URL ?? 'http://localhost:3000',
    args.flag('allow-live-host'),
  )
} catch (error) {
  console.error((error as Error).message)
  process.exit(2)
}

const rows = parsePlanCsv(await fs.readFile(PLAN_FILE, 'utf8').catch(() => ''))
if (!rows.length) {
  console.error('Chybí migration/redirect-plan.csv – nejdřív pnpm migrate:redirects.')
  process.exit(2)
}

console.log(`Kontroluji ${rows.length} adres proti ${base.origin} …`)
// Warm-up: the first request of a fresh server compiles/loads things and fills the proxy's
// redirect table; without it the first few answers could come from the cold path.
await fetch(new URL('/', base), { redirect: 'manual' }).catch(() => undefined)
await fetch(new URL('/produkty/kontrola-presmerovani-detail-0', base), { redirect: 'manual' }).catch(() => undefined)

const started = Date.now()
const result = await runRedirectCheck({
  base,
  rows,
  fetchImpl: fetch as unknown as FetchLike,
  concurrency: args.number('concurrency') ?? 4,
  timeoutMs: args.number('timeout') ?? 60_000,
  trackingSample: args.number('tracking-sample') ?? 25,
  sitemap: !args.flag('no-sitemap'),
  onProgress: (done, total) => {
    if (done % 100 === 0 || done === total) console.log(`  … ${done}/${total}`)
  },
})

const lines = ['kind,url,expected,got']
const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
for (const f of result.failures) lines.push([f.kind, f.url, f.expected, f.got].map(cell).join(','))
await fs.writeFile(FAILURES_FILE, lines.join('\n') + '\n', 'utf8')

const planFailures = result.failures.filter((f) => f.kind === 'plan').length
console.log('')
const fromInventory = rows.filter((r) => r.source === 'inventory')
console.log(
  `Adres v plánu: ${result.checked} (200: ${result.direct}, 308: ${result.redirected}); z inventury ` +
    `${fromInventory.length} (200: ${fromInventory.filter((r) => r.expected_status === '200').length}, ` +
    `308: ${fromInventory.filter((r) => r.expected_status === '308').length}); URL ze sitemap.xml: ${result.sitemapChecked}`,
)
console.log(`Chyby: ${result.failures.length} (plán ${planFailures}, utm ${result.failures.filter((f) => f.kind === 'tracking').length}, sitemap ${result.failures.filter((f) => f.kind === 'sitemap').length})`)
console.log(`Hotovo za ${Math.round((Date.now() - started) / 1000)} s. Chyby: ${path.relative(process.cwd(), FAILURES_FILE)}`)
for (const f of result.failures.slice(0, 20)) console.log(`  ✗ [${f.kind}] ${f.url}\n      čekáno ${f.expected}, dostali ${f.got}`)
process.exit(result.failures.length ? 1 : 0)
