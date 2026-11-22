import { normalizePostcode, POSTCODE_REGEX } from './constants'

/**
 * CSV import/export of postcodes (pure functions; the database part is in
 * `src/delivery/postcodeImport.ts`).
 *
 * Accepted file:
 * - UTF-8 (with or without BOM) or Windows-1250 (what Czech Excel and Česká pošta files use),
 * - separator `;`, `,` or tab (detected from the header line),
 * - header line with column names; recognised names (case and diacritics do not matter):
 *     PSČ:          psc, kod, postcode, zip
 *     Obec / pošta: obec, nazev, mesto, nazpost, nazev_posty, nazobce, city
 *     Okres:        okres, nazokresu, district, popis
 *     Nedoručujeme: nedorucujeme, blocked  (ano/ne, 1/0, x)
 *   Without a recognisable header, the columns are read as PSČ;obec;okres.
 * - empty lines and lines starting with `#` are ignored.
 *
 * Import rules: rows are matched by PSČ. New postcodes are created, existing ones updated when
 * something changed. Empty cells never erase a stored value. When the file has no
 * "nedorucujeme" column, the stored flag is kept (so re-importing the official list never
 * resets it). Nothing is ever deleted by an import.
 */

export const EXPORT_HEADER = ['psc', 'obec', 'okres', 'nedorucujeme'] as const

export type CsvPostcodeRow = {
  line: number
  code: string
  city: string | null
  district: string | null
  /** undefined = the file has no "nedorucujeme" column (keep the stored value). */
  deliveryBlocked?: boolean
}

export type CsvError = { line: number; message: string }

export type ParsedPostcodeCsv = {
  rows: CsvPostcodeRow[]
  errors: CsvError[]
  /** Rows whose PSČ already appeared earlier in the file (the first occurrence wins). */
  duplicates: number
}

/** Decodes uploaded bytes: UTF-8 when valid, otherwise Windows-1250. Strips a BOM. */
export function decodeCsvBytes(bytes: Uint8Array): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    text = new TextDecoder('windows-1250').decode(bytes)
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/** Splits CSV text into rows of cells. Supports quoted cells ("a;b", "say ""hi"""). */
export function parseCsv(text: string, delimiter: string): { line: number; cells: string[] }[] {
  const rows: { line: number; cells: string[] }[] = []
  let cells: string[] = []
  let cell = ''
  let inQuotes = false
  let line = 1
  let rowStartLine = 1

  const endRow = () => {
    cells.push(cell)
    rows.push({ line: rowStartLine, cells })
    cells = []
    cell = ''
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else {
        if (char === '\n') line++
        cell += char
      }
      continue
    }
    if (char === '"' && cell === '') inQuotes = true
    else if (char === delimiter) {
      cells.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      endRow()
      line++
      rowStartLine = line
    } else cell += char
  }
  if (cell !== '' || cells.length) endRow()

  return rows.filter(
    (row) => row.cells.some((c) => c.trim() !== '') && !row.cells[0].trim().startsWith('#'),
  )
}

function detectDelimiter(text: string): string {
  const firstLine =
    text.split(/\r?\n/).find((l) => l.trim() !== '' && !l.trim().startsWith('#')) ?? ''
  const counts = [';', ',', '\t'].map((d) => ({ d, n: firstLine.split(d).length - 1 }))
  counts.sort((a, b) => b.n - a.n)
  return counts[0].n > 0 ? counts[0].d : ';'
}

/** "Název pošty" -> "nazevposty" */
function headerKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

const HEADER_ALIASES = {
  code: ['psc', 'kod', 'postcode', 'zip', 'kodpsc'],
  city: [
    'obec',
    'nazpost',
    'nazevposty',
    'posta',
    'nazev',
    'mesto',
    'nazobce',
    'nazevobce',
    'city',
  ],
  district: ['okres', 'nazokresu', 'nazevokresu', 'district', 'popis'],
  blocked: ['nedorucujeme', 'nedorucovat', 'bezdoruceni', 'blocked'],
} as const

function findColumn(header: string[], aliases: readonly string[]): number {
  for (const alias of aliases) {
    const index = header.indexOf(alias)
    if (index !== -1) return index
  }
  return -1
}

function parseBoolean(value: string): boolean | null {
  const v = headerKey(value)
  if (['ano', 'a', 'yes', 'y', 'true', '1', 'x'].includes(v)) return true
  if (['ne', 'n', 'no', 'false', '0', ''].includes(v)) return false
  return null
}

export function parsePostcodeCsv(text: string): ParsedPostcodeCsv {
  const rows = parseCsv(text, detectDelimiter(text))
  const errors: CsvError[] = []
  const result: CsvPostcodeRow[] = []
  let duplicates = 0
  if (!rows.length) {
    return { rows: [], errors: [{ line: 0, message: 'Soubor je prázdný.' }], duplicates: 0 }
  }

  const header = rows[0].cells.map(headerKey)
  let columns = {
    code: findColumn(header, HEADER_ALIASES.code),
    city: findColumn(header, HEADER_ALIASES.city),
    district: findColumn(header, HEADER_ALIASES.district),
    blocked: findColumn(header, HEADER_ALIASES.blocked),
  }
  let dataRows = rows.slice(1)
  if (columns.code === -1) {
    if (POSTCODE_REGEX.test(normalizePostcode(rows[0].cells[0] ?? ''))) {
      // No header: PSČ;obec;okres
      columns = { code: 0, city: 1, district: 2, blocked: -1 }
      dataRows = rows
    } else {
      return {
        rows: [],
        errors: [
          {
            line: rows[0].line,
            message:
              'V záhlaví chybí sloupec „psc“. První řádek musí obsahovat názvy sloupců, ' +
              'např. psc;obec;okres;nedorucujeme.',
          },
        ],
        duplicates: 0,
      }
    }
  }

  const seen = new Set<string>()
  const cellAt = (cells: string[], index: number) =>
    index === -1 ? null : (cells[index] ?? '').trim() || null

  for (const { line, cells } of dataRows) {
    const rawCode = cellAt(cells, columns.code) ?? ''
    const code = normalizePostcode(rawCode)
    if (!POSTCODE_REGEX.test(code)) {
      errors.push({
        line,
        message: `Neplatné PSČ „${rawCode}“ (musí mít 5 číslic a začínat 1–7).`,
      })
      continue
    }
    let deliveryBlocked: boolean | undefined
    if (columns.blocked !== -1) {
      const parsed = parseBoolean(cells[columns.blocked] ?? '')
      if (parsed === null) {
        errors.push({
          line,
          message: `Sloupec „nedorucujeme“ má neznámou hodnotu „${cells[columns.blocked]}“ (použijte ano/ne).`,
        })
        continue
      }
      deliveryBlocked = parsed
    }
    if (seen.has(code)) {
      duplicates++
      continue
    }
    seen.add(code)
    result.push({
      line,
      code,
      city: cellAt(cells, columns.city),
      district: cellAt(cells, columns.district),
      deliveryBlocked,
    })
  }

  return { rows: result, errors, duplicates }
}

export type StoredPostcode = {
  code: string
  city: string | null
  district: string | null
  deliveryBlocked: boolean
}

export type PostcodeImportPlan = {
  toCreate: StoredPostcode[]
  toUpdate: StoredPostcode[]
  unchanged: number
}

/**
 * Decides what to create and update. `createOnly` (used by the seed) never touches existing
 * postcodes.
 */
export function planPostcodeImport(
  rows: CsvPostcodeRow[],
  existing: Map<string, StoredPostcode>,
  options: { createOnly?: boolean } = {},
): PostcodeImportPlan {
  const plan: PostcodeImportPlan = { toCreate: [], toUpdate: [], unchanged: 0 }
  for (const row of rows) {
    const current = existing.get(row.code)
    if (!current) {
      plan.toCreate.push({
        code: row.code,
        city: row.city,
        district: row.district,
        deliveryBlocked: row.deliveryBlocked ?? false,
      })
      continue
    }
    if (options.createOnly) {
      plan.unchanged++
      continue
    }
    const next: StoredPostcode = {
      code: row.code,
      city: row.city ?? current.city,
      district: row.district ?? current.district,
      deliveryBlocked: row.deliveryBlocked ?? current.deliveryBlocked,
    }
    const changed =
      next.city !== current.city ||
      next.district !== current.district ||
      next.deliveryBlocked !== current.deliveryBlocked
    if (changed) plan.toUpdate.push(next)
    else plan.unchanged++
  }
  return plan
}

function csvCell(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Export file: UTF-8 with BOM (so Excel shows diacritics), `;` separated, CRLF lines. */
export function buildPostcodeCsv(postcodes: StoredPostcode[]): string {
  const lines = [EXPORT_HEADER.join(';')]
  for (const p of postcodes) {
    lines.push(
      [p.code, p.city ?? '', p.district ?? '', p.deliveryBlocked ? 'ano' : 'ne']
        .map(csvCell)
        .join(';'),
    )
  }
  return `﻿${lines.join('\r\n')}\r\n`
}
