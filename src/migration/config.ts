import path from 'path'
import { fileURLToPath } from 'url'

/**
 * Settings of the stage 8 migration from the old terrys.cz (EasyWeb) to Payload.
 * Everything that touches the live site goes through `PoliteFetcher` (fetcher.ts), which uses
 * these values: one request at a time, a pause between requests, a descriptive User-Agent and an
 * on-disk cache so re-runs never fetch the same URL twice.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url))

/** Project root (two levels up from src/migration). */
export const ROOT_DIR = path.resolve(dirname, '../..')

/** Committed outputs (inventory CSV, report, fixtures). */
export const MIGRATION_DIR = path.join(ROOT_DIR, 'migration')
export const INVENTORY_FILE = path.join(MIGRATION_DIR, 'url-inventory.csv')
export const REPORT_FILE = path.join(MIGRATION_DIR, 'report.md')
export const FIXTURES_DIR = path.join(MIGRATION_DIR, 'fixtures')

/** Git-ignored cache of everything fetched from the old site. Delete it to force a re-fetch. */
export const CACHE_DIR = path.join(MIGRATION_DIR, '.cache')
/** Crawl state written by `pnpm migrate:crawl` and read by `pnpm migrate:import`. */
export const CRAWL_STATE_FILE = path.join(CACHE_DIR, 'crawl-state.json')

/** The only host we ever request. `terrys.cz` without www is normalised to it. */
export const OLD_HOST = 'www.terrys.cz'
export const OLD_ORIGIN = `https://${OLD_HOST}`

/** Generic, descriptive User-Agent (no personal data). */
export const USER_AGENT =
  'Mozilla/5.0 (compatible; TerrysSiteMigration/1.0; one-off read-only content migration crawler)'

/** Minimum pause between two requests to the live shop, in milliseconds. */
export const REQUEST_DELAY_MS = 700

/** Waits before retrying a failed request (network error, HTTP 429 or 5xx). */
export const RETRY_DELAYS_MS = [10_000, 30_000, 90_000]

/** Stop the crawl when this many URLs in a row failed even after retries (site in trouble). */
export const MAX_CONSECUTIVE_FAILURES = 5

/** Request timeout. */
export const REQUEST_TIMEOUT_MS = 30_000
