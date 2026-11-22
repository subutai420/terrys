import type { PlanRow } from './redirectPlan'

/**
 * Checker of the redirect plan against a RUNNING new site (stage 8b). Requests every planned old
 * address with `redirect: manual` and asserts:
 *   - 200 rows: status 200 (no redirect),
 *   - 308 rows: exactly one 301/308 hop, Location on the same site, equal to the planned target,
 *     and the target answers 200 itself (no chain),
 * plus, for a sample of redirects, that tracking parameters survive the hop, and that every URL of
 * the site's own /sitemap.xml answers 200 directly.
 *
 * Safety: requests go only to the given base URL; the old live site (terrys.cz) is refused unless
 * explicitly allowed (after the launch, when terrys.cz IS the new site). Redirect targets on other
 * hosts are reported, never requested.
 */

export type FetchLike = (url: string, init: { redirect: 'manual'; signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  status: number
  headers: { get(name: string): string | null }
  text(): Promise<string>
}>

export type CheckFailure = { url: string; expected: string; got: string; kind: 'plan' | 'tracking' | 'sitemap' }

export type CheckResult = {
  checked: number
  direct: number
  redirected: number
  /** URLs of /sitemap.xml checked for a direct 200. */
  sitemapChecked: number
  failures: CheckFailure[]
}

const LIVE_HOSTS = new Set(['terrys.cz', 'www.terrys.cz'])
export const TRACKING_PROBE = 'utm_source=kontrola-presmerovani'

/** Validates the base URL; throws a Czech message for anything unsafe. */
export function assertSafeBase(base: string, allowLiveHost = false): URL {
  let url: URL
  try {
    url = new URL(base)
  } catch {
    throw new Error(`Neplatná adresa webu: ${base}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Adresa musí začínat http:// nebo https://')
  if (LIVE_HOSTS.has(url.hostname.toLowerCase()) && !allowLiveHost) {
    throw new Error(
      'terrys.cz je (do spuštění) STARÝ web – kontrola se proti němu nespouští. Po spuštění nového ' +
        'webu použijte --allow-live-host.',
    )
  }
  return new URL(url.origin)
}

/** Path + query of a Location header relative to the base, or null when it leaves the site. */
export function sameSiteLocation(location: string | null, base: URL): string | null {
  if (!location) return null
  // A redirect rendered by an ISR page on its first render repeats the header with the same value
  // (fetch joins them with ", "); identical copies are harmless, different ones are not.
  const values = [...new Set(location.split(', '))]
  if (values.length > 1) return null
  const url = new URL(values[0], base)
  if (url.origin !== base.origin) return null
  return url.pathname + url.search
}

/** Appends the tracking probe to a path + query. */
export function withProbe(pathAndQuery: string): string {
  return pathAndQuery + (pathAndQuery.includes('?') ? '&' : '?') + TRACKING_PROBE
}

async function request(fetchImpl: FetchLike, url: string, timeoutMs: number) {
  const response = await fetchImpl(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'TerrysRedirectCheck/1.0', accept: 'text/html' },
  })
  // Drain the body so connections are reused.
  await response.text().catch(() => '')
  return { status: response.status, location: response.headers.get('location') }
}

/** Checks one planned address. Returns the failure, or null when it behaves as planned. */
export async function checkRow(
  row: Pick<PlanRow, 'old_url' | 'expected_status' | 'expected_target'>,
  base: URL,
  fetchImpl: FetchLike,
  opts: { timeoutMs?: number; probe?: boolean } = {},
): Promise<CheckFailure | null> {
  const timeoutMs = opts.timeoutMs ?? 60_000
  const oldUrl = opts.probe ? withProbe(row.old_url) : row.old_url
  const expectedTarget = opts.probe ? withProbe(row.expected_target) : row.expected_target
  const kind = opts.probe ? 'tracking' : 'plan'
  const fail = (expected: string, got: string): CheckFailure => ({ url: oldUrl, expected, got, kind })
  let first
  try {
    first = await request(fetchImpl, new URL(oldUrl, base).toString(), timeoutMs)
  } catch (error) {
    return fail(row.expected_status, `chyba požadavku: ${String(error)}`)
  }

  if (row.expected_status === '200') {
    return first.status === 200 ? null : fail('200', `${first.status}${first.location ? ` → ${first.location}` : ''}`)
  }
  if (row.expected_status === '404') return fail('(cíl neurčen)', String(first.status))

  if (first.status !== 301 && first.status !== 308) {
    return fail(`308 → ${expectedTarget}`, `${first.status}${first.location ? ` → ${first.location}` : ''}`)
  }
  const target = sameSiteLocation(first.location, base)
  if (!target) return fail(`308 → ${expectedTarget}`, `přesměrování mimo web: ${first.location}`)
  if (target !== expectedTarget) return fail(`308 → ${expectedTarget}`, `${first.status} → ${target}`)
  let second
  try {
    second = await request(fetchImpl, new URL(target, base).toString(), timeoutMs)
  } catch (error) {
    return fail(`200 na ${target}`, `chyba požadavku na cíl: ${String(error)}`)
  }
  if (second.status !== 200) {
    return fail(`200 na ${target}`, `${second.status}${second.location ? ` → ${second.location} (řetězec)` : ''}`)
  }
  return null
}

/** Runs `worker` over `items` with at most `concurrency` at once. */
async function pool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) await worker(items[next++])
    }),
  )
}

/** URLs of a sitemap.xml body. */
export function sitemapUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'))
}

export async function runRedirectCheck(options: {
  base: URL
  rows: PlanRow[]
  fetchImpl: FetchLike
  concurrency?: number
  timeoutMs?: number
  /** How many redirect rows also get the tracking-parameter probe. */
  trackingSample?: number
  sitemap?: boolean
  onProgress?: (done: number, total: number) => void
}): Promise<CheckResult> {
  const { base, rows, fetchImpl } = options
  const concurrency = options.concurrency ?? 4
  const failures: CheckFailure[] = []
  let done = 0
  let sitemapChecked = 0
  const total = rows.length

  await pool(rows, concurrency, async (row) => {
    const failure = await checkRow(row, base, fetchImpl, { timeoutMs: options.timeoutMs })
    if (failure) failures.push(failure)
    options.onProgress?.(++done, total)
  })

  const probes = rows.filter((r) => r.expected_status === '308').slice(0, options.trackingSample ?? 25)
  await pool(probes, concurrency, async (row) => {
    const failure = await checkRow(row, base, fetchImpl, { timeoutMs: options.timeoutMs, probe: true })
    if (failure) failures.push(failure)
  })

  if (options.sitemap !== false) {
    try {
      const response = await fetchImpl(new URL('/sitemap.xml', base).toString(), { redirect: 'manual' })
      const urls = response.status === 200 ? sitemapUrls(await response.text()) : []
      if (response.status !== 200) {
        failures.push({ url: '/sitemap.xml', expected: '200', got: String(response.status), kind: 'sitemap' })
      }
      // The sitemap holds absolute URLs of NEXT_PUBLIC_SERVER_URL; check the same paths on `base`.
      const paths = urls.map((u) => {
        const url = new URL(u)
        return url.pathname + url.search
      })
      sitemapChecked = paths.length
      await pool(paths, concurrency, async (path) => {
        const failure = await checkRow(
          { old_url: path, expected_status: '200', expected_target: path },
          base,
          fetchImpl,
          { timeoutMs: options.timeoutMs },
        )
        if (failure) failures.push({ ...failure, kind: 'sitemap' })
      })
    } catch (error) {
      failures.push({ url: '/sitemap.xml', expected: '200', got: String(error), kind: 'sitemap' })
    }
  }

  return {
    checked: rows.length,
    direct: rows.filter((r) => r.expected_status === '200').length,
    redirected: rows.filter((r) => r.expected_status === '308').length,
    sitemapChecked,
    failures,
  }
}
