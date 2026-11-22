import fs from 'fs/promises'

import type { PageType } from './urls'

/**
 * `migration/url-inventory.csv` – every public URL of the old site found by the crawl.
 * It is the input for the 301 redirect map in the second half of stage 8, so it lists aliases,
 * pagination and redirects too, not just the pages that are imported.
 *
 * Columns (comma separated, RFC 4180 quoting, UTF-8):
 * - old_url         path + query on www.terrys.cz
 * - type            page type (see PageType in urls.ts)
 * - http_status     status of the old URL (blank = not requested, e.g. search URLs)
 * - title           <title> of the page
 * - canonical       canonical URL (path) declared by the page
 * - redirect_to     Location of a 3xx response (path)
 * - new_collection  Payload collection the content was imported into (filled by migrate:import)
 * - new_slug        slug of the imported document (filled by migrate:import)
 * - note            why it is not crawled / imported, alias of …, etc.
 */

export interface InventoryRow {
  old_url: string
  type: PageType | string
  http_status: string
  title: string
  canonical: string
  redirect_to: string
  new_collection: string
  new_slug: string
  note: string
}

export const INVENTORY_COLUMNS: (keyof InventoryRow)[] = [
  'old_url',
  'type',
  'http_status',
  'title',
  'canonical',
  'redirect_to',
  'new_collection',
  'new_slug',
  'note',
]

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function toCsv(rows: InventoryRow[]): string {
  const lines = [INVENTORY_COLUMNS.join(',')]
  for (const row of rows) lines.push(INVENTORY_COLUMNS.map((c) => csvCell(row[c] ?? '')).join(','))
  return lines.join('\n') + '\n'
}

/** Minimal RFC 4180 parser (quoted cells, doubled quotes, newlines inside quotes). */
export function parseCsv(text: string): InventoryRow[] {
  const records: string[][] = []
  let record: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      record.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      record.push(cell)
      records.push(record)
      record = []
      cell = ''
    } else cell += ch
  }
  if (cell || record.length) {
    record.push(cell)
    records.push(record)
  }
  const [header, ...rest] = records
  if (!header) return []
  return rest
    .filter((r) => r.some((c) => c))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])) as unknown as InventoryRow)
}

export async function readInventory(file: string): Promise<InventoryRow[]> {
  try {
    return parseCsv(await fs.readFile(file, 'utf8'))
  } catch {
    return []
  }
}

export async function writeInventory(file: string, rows: InventoryRow[]) {
  const sorted = [...rows].sort((a, b) => a.type.localeCompare(b.type) || a.old_url.localeCompare(b.old_url))
  await fs.writeFile(file, toCsv(sorted), 'utf8')
}
