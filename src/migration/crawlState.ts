import fs from 'fs/promises'
import path from 'path'

import { CRAWL_STATE_FILE } from './config'
import type { PageType } from './urls'

/** One URL known to the crawler. Stored in migration/.cache/crawl-state.json. */
export interface CrawlEntry {
  url: string
  type: PageType
  /** Not requested: search page, unknown query parameter, blocked path. */
  skipReason?: string
  status?: number
  location?: string
  title?: string
  canonical?: string
  /** EasyWeb page context `viewType`, e.g. "itemDetail", "categoryList". */
  viewType?: string
  /** First page where the link was found (for debugging broken links). */
  foundOn?: string
  fromSitemap?: boolean
}

export interface CrawlState {
  startedAt: string
  finishedAt?: string
  entries: Record<string, CrawlEntry>
  /** Image URLs referenced by migrated content → HTTP status (filled by the image phase). */
  images: Record<string, { status: number; foundOn: string }>
  /** Font files referenced by the old site's CSS (reported, never copied). */
  fonts?: string[]
}

export async function readCrawlState(): Promise<CrawlState | null> {
  try {
    return JSON.parse(await fs.readFile(CRAWL_STATE_FILE, 'utf8')) as CrawlState
  } catch {
    return null
  }
}

export async function writeCrawlState(state: CrawlState) {
  await fs.mkdir(path.dirname(CRAWL_STATE_FILE), { recursive: true })
  await fs.writeFile(CRAWL_STATE_FILE, JSON.stringify(state, null, 1))
}
