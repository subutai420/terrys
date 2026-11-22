import { createHash } from 'crypto'
import fs from 'fs/promises'
import path from 'path'

import {
  CACHE_DIR,
  MAX_CONSECUTIVE_FAILURES,
  OLD_HOST,
  REQUEST_DELAY_MS,
  REQUEST_TIMEOUT_MS,
  RETRY_DELAYS_MS,
  USER_AGENT,
} from './config'

/**
 * Polite, read-only HTTP client for the old terrys.cz with an on-disk cache.
 *
 * - Only GET requests, only to www.terrys.cz (anything else throws). No cookies, no forms.
 * - Strictly sequential: one request at a time, at least REQUEST_DELAY_MS between requests.
 * - Redirects are NOT followed automatically, so the inventory records 301/302 + Location.
 * - Network errors, HTTP 429 and 5xx are retried after RETRY_DELAYS_MS (10 s, 30 s, 90 s).
 *   After MAX_CONSECUTIVE_FAILURES failed URLs in a row it throws `CrawlAbortedError`.
 * - Every response (including 404) is cached under migration/.cache; a cached URL is never
 *   requested again. Delete the cache folder (or one file) to force a re-fetch.
 */

export interface CachedPage {
  url: string
  status: number
  location?: string
  contentType?: string
  fetchedAt: string
  body: string
}

export interface CachedBinary {
  url: string
  status: number
  contentType?: string
  fetchedAt: string
  /** Absolute path of the cached file (only when status is 200). */
  file?: string
  size?: number
}

export class CrawlAbortedError extends Error {}

/** What the importer needs from the fetcher (lets tests feed fixtures instead of the cache). */
export type CacheReader = Pick<PoliteFetcher, 'readCachedPage' | 'readCachedBinary' | 'getBinary'>

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function sha1(input: string | Buffer): string {
  return createHash('sha1').update(input).digest('hex')
}

export class PoliteFetcher {
  private lastRequestAt = 0
  private consecutiveFailures = 0
  /** Number of real network requests made by this instance (cache hits excluded). */
  networkRequests = 0
  /** When true, never touch the network: a cache miss returns null. */
  offline: boolean
  private log: (message: string) => void

  constructor(options: { offline?: boolean; log?: (message: string) => void } = {}) {
    this.offline = options.offline ?? false
    this.log = options.log ?? (() => {})
  }

  private pagePath(url: string) {
    return path.join(CACHE_DIR, 'pages', `${sha1(url)}.json`)
  }

  private binaryMetaPath(url: string) {
    return path.join(CACHE_DIR, 'images', `${sha1(url)}.json`)
  }

  /** Cached page or null (never hits the network). */
  async readCachedPage(url: string): Promise<CachedPage | null> {
    try {
      return JSON.parse(await fs.readFile(this.pagePath(url), 'utf8')) as CachedPage
    } catch {
      return null
    }
  }

  async readCachedBinary(url: string): Promise<CachedBinary | null> {
    try {
      return JSON.parse(await fs.readFile(this.binaryMetaPath(url), 'utf8')) as CachedBinary
    } catch {
      return null
    }
  }

  /** HTML page (or any text). Returns the cached copy when present. */
  async getPage(url: string): Promise<CachedPage | null> {
    const cached = await this.readCachedPage(url)
    if (cached) return cached
    if (this.offline) return null

    const response = await this.request(url)
    const page: CachedPage = {
      url,
      status: response.status,
      location: response.headers.get('location') ?? undefined,
      contentType: response.headers.get('content-type') ?? undefined,
      fetchedAt: new Date().toISOString(),
      body: response.status === 200 ? await response.text() : '',
    }
    // 599 = network failure after all retries: report it, but do not cache it (retry next run).
    if (page.status === 599) return page
    await fs.mkdir(path.dirname(this.pagePath(url)), { recursive: true })
    await fs.writeFile(this.pagePath(url), JSON.stringify(page))
    return page
  }

  /** Binary file (image). The bytes are stored next to a small JSON with status and type. */
  async getBinary(url: string): Promise<CachedBinary | null> {
    const cached = await this.readCachedBinary(url)
    if (cached) return cached
    if (this.offline) return null

    const response = await this.request(url, { followRedirects: true })
    const meta: CachedBinary = {
      url,
      status: response.status,
      contentType: response.headers.get('content-type') ?? undefined,
      fetchedAt: new Date().toISOString(),
    }
    if (response.status === 599) return meta
    await fs.mkdir(path.join(CACHE_DIR, 'images'), { recursive: true })
    if (response.status === 200) {
      const bytes = Buffer.from(await response.arrayBuffer())
      const file = path.join(CACHE_DIR, 'images', `${sha1(url)}.bin`)
      await fs.writeFile(file, bytes)
      meta.file = file
      meta.size = bytes.length
    } else {
      await response.body?.cancel()
    }
    await fs.writeFile(this.binaryMetaPath(url), JSON.stringify(meta))
    return meta
  }

  private async waitTurn() {
    const wait = this.lastRequestAt + REQUEST_DELAY_MS - Date.now()
    if (wait > 0) await sleep(wait)
    this.lastRequestAt = Date.now()
  }

  private async request(url: string, options: { followRedirects?: boolean } = {}): Promise<Response> {
    const host = new URL(url).hostname
    if (host !== OLD_HOST) throw new Error(`Refusing to fetch a URL outside ${OLD_HOST}: ${url}`)

    let lastError: unknown
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_DELAYS_MS[attempt - 1]
        this.log(`  opakuji za ${delay / 1000} s (${String(lastError)}): ${url}`)
        await sleep(delay)
      }
      await this.waitTurn()
      this.networkRequests++
      try {
        const response = await fetch(url, {
          method: 'GET',
          redirect: options.followRedirects ? 'follow' : 'manual',
          headers: { 'User-Agent': USER_AGENT, Accept: '*/*', 'Accept-Language': 'cs' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        if (response.status === 429 || response.status >= 500) {
          lastError = `HTTP ${response.status}`
          await response.body?.cancel()
          continue
        }
        this.consecutiveFailures = 0
        return response
      } catch (error) {
        lastError = error
      }
    }
    this.consecutiveFailures++
    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      throw new CrawlAbortedError(
        `${MAX_CONSECUTIVE_FAILURES} URL za sebou selhalo, crawl zastaven (poslední: ${url}, ${String(lastError)})`,
      )
    }
    // Return a synthetic response so the failure is cached and reported (status 0 = network error).
    return new Response(null, { status: 599, statusText: String(lastError) })
  }
}
