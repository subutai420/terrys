// Minimal, dependency-free reader of the first worksheet of an .xlsx file.
//
// Why hand-written: the analysis must not add packages to package.json and Python's openpyxl is
// not installed. An .xlsx file is a ZIP archive of XML files; we only need the shared strings
// table and the first sheet. Node's built-in zlib inflates the ZIP entries.
//
// Every cell value is treated as plain data (strings or numbers), never evaluated.

import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

/** Reads all entries of a ZIP archive via its central directory → Map<name, Buffer>. */
function readZip(buf) {
  // End of central directory record: signature 0x06054b50, search backwards.
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP/XLSX file (no end of central directory).')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const files = new Map()
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Broken central directory.')
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + commentLen
    // Local file header: 30 bytes + name + extra, then the data.
    const lNameLen = buf.readUInt16LE(localOffset + 26)
    const lExtraLen = buf.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + lNameLen + lExtraLen
    const data = buf.subarray(start, start + compSize)
    files.set(name, method === 0 ? data : inflateRawSync(data))
  }
  return files
}

const decodeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')

/** Concatenated text of all <t> elements (rich text runs included). */
function textOf(xml) {
  let out = ''
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) {
    out += m[1] ? decodeXml(m[1]) : ''
  }
  return out
}

function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0]
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/**
 * Returns { header: string[], rows: Array<Record<string, string|number|null>> }.
 * Numbers stay numbers; strings are returned exactly as stored (no trimming – the analysis
 * reports leading/trailing spaces as a data-quality finding).
 */
export function readXlsx(path) {
  const files = readZip(readFileSync(path))
  const shared = []
  const sst = files.get('xl/sharedStrings.xml')
  if (sst) {
    for (const m of sst.toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]))
  }
  // First sheet: resolve via workbook rels would be most correct; sheet1.xml is the first sheet
  // in files written by Excel and by the EasyWeb export.
  const sheetName =
    [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0] ?? null
  if (!sheetName) throw new Error('No worksheet found.')
  const xml = files.get(sheetName).toString('utf8')
  const grid = []
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = []
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]
      const inner = cm[2] ?? ''
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1]
      const type = attrs.match(/\bt="([^"]+)"/)?.[1]
      const idx = ref ? colIndex(ref) : row.length
      let value = null
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      if (type === 's') value = v != null ? shared[Number(v)] : null
      else if (type === 'inlineStr') value = textOf(inner)
      else if (type === 'str' || type === 'e') value = v != null ? decodeXml(v) : null
      else if (type === 'b') value = v === '1'
      else if (v != null) value = Number(v)
      row[idx] = value
    }
    grid.push(row)
  }
  const header = (grid[0] ?? []).map((h) => (h == null ? '' : String(h)))
  const rows = grid
    .slice(1)
    .filter((r) => r.some((c) => c != null && c !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? null])))
  return { header, rows }
}

/** Excel serial date (1900 system) → ISO date 'YYYY-MM-DD'. */
export function excelDate(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return null
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  return new Date(ms).toISOString().slice(0, 10)
}
