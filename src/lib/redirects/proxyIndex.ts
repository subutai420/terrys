import { legacyIndex, type LegacyIndex, type LegacyIndexData } from './legacy'

/**
 * The redirect table as the proxy sees it (stage 8b). The proxy must not use Payload or the
 * database (Next.js docs: it runs before routing and is "not intended for slow data fetching";
 * fetch caching does not work there), so it loads the table from the app's own endpoint
 * `GET /api/legacy-redirects/index` and keeps it in memory:
 *
 * - fresh for 60 s; after that the old table is still used while a new one loads in the
 *   background (`waitUntil`), so a normal request never waits;
 * - only the very first request of a fresh server process waits, at most `FIRST_LOAD_TIMEOUT_MS`;
 * - when loading fails the proxy simply lets requests through: pages still work, and the
 *   storefront's not-found fallback still redirects old addresses (without the speed-up).
 *
 * The table changes only when an editor saves something; a minute of delay is fine.
 */

const FRESH_MS = 60_000
const FIRST_LOAD_TIMEOUT_MS = 2_500
const LOAD_TIMEOUT_MS = 10_000
export const LEGACY_INDEX_PATH = '/api/legacy-redirects/index'

type State = { index: LegacyIndex; loadedAt: number }

let state: State | null = null
let loading: Promise<void> | null = null

async function load(origin: string): Promise<void> {
  const response = await fetch(new URL(LEGACY_INDEX_PATH, origin), {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(LOAD_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = (await response.json()) as LegacyIndexData
  if (!Array.isArray(data?.served)) throw new Error('unexpected response')
  state = { index: legacyIndex(data), loadedAt: Date.now() }
}

function startLoad(origin: string): Promise<void> {
  loading ??= load(origin)
    .catch((error: unknown) => {
      console.warn(`[redirects] Tabulku přesměrování se nepodařilo načíst: ${String(error)}`)
    })
    .finally(() => {
      loading = null
    })
  return loading
}

/**
 * Current table or null. `origin` = where the app is reachable (`INTERNAL_SERVER_URL` or the
 * request's own origin). `waitUntil` keeps a background refresh alive after the response.
 */
export async function getProxyLegacyIndex(
  origin: string,
  waitUntil: (promise: Promise<unknown>) => void,
): Promise<LegacyIndex | null> {
  if (state && Date.now() - state.loadedAt < FRESH_MS) return state.index
  const pending = startLoad(origin)
  if (state) {
    waitUntil(pending)
    return state.index // slightly stale is fine
  }
  await Promise.race([
    pending,
    new Promise((resolve) => setTimeout(resolve, FIRST_LOAD_TIMEOUT_MS)),
  ])
  if (!state) waitUntil(pending)
  return (state as State | null)?.index ?? null
}

/** Tests only. */
export function resetProxyLegacyIndex(): void {
  state = null
  loading = null
}
