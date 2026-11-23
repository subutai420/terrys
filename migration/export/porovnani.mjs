// Compares the product export from the OLD e-shop admin (EasyWeb, .xlsx) with the catalog that
// stage 8 imported into the new shop by crawling the old public website.
//
// READ-ONLY: the script only runs SELECT queries. It writes three CSV files next to itself
// (UTF-8 with BOM, semicolon separated – opens directly in Czech Excel) and prints a summary
// (JSON) to stdout that the report `porovnani-exportu.md` was written from.
//
// Usage (from the repo root, the database must be the imported catalog, e.g. terrys_migration):
//   EXPORT_COMPARE_DATABASE_URL=postgres://user:pass@127.0.0.1:5433/terrys_migration \
//     node migration/export/porovnani.mjs "E:\Klienti\Terrys\Produkty.xlsx"
// Falls back to MIGRATION_DATABASE_URL. The URL is never printed.
//
// Matching: export "Short Id" = the old product id = the number at the end of the imported
// product's legacyUrl (`/produkty/<slug>-detail-<id>`, also stored as `sku`). Rows without an id
// match fall back to the normalised title (only when the title is unique on both sides).

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { readXlsx, excelDate } from './xlsx.mjs'

const here = dirname(fileURLToPath(import.meta.url))
// `pg` is already a dependency of the repo (Payload's Postgres adapter) – no new package.
const require = createRequire(join(here, '..', '..', 'package.json'))
const pg = require('pg')

const xlsxPath = process.argv[2]
const dbUrl = process.env.EXPORT_COMPARE_DATABASE_URL || process.env.MIGRATION_DATABASE_URL
if (!xlsxPath || !dbUrl) {
  console.error('Použití: EXPORT_COMPARE_DATABASE_URL=… node migration/export/porovnani.mjs <cesta k Produkty.xlsx>')
  process.exit(1)
}

// ------------------------------------------------------------------ helpers

const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const tags = (s) =>
  [...String(s ?? '').matchAll(/#([^#]+)#/g)].map((m) => clean(m[1])).filter(Boolean)
const empty = (v) => v == null || (typeof v === 'string' && v.trim() === '')

function count(map, key, n = 1) {
  map.set(key, (map.get(key) ?? 0) + n)
}
const sorted = (map) => Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1]))

function csvCell(v) {
  const s = v == null ? '' : String(v)
  return /[;"\n\r]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function writeCsv(name, header, rows) {
  const text = [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n'
  writeFileSync(join(here, name), '\uFEFF' + text, 'utf8')
}
const fmtNum = (n) => (n == null || n === '' ? '' : String(n).replace('.', ','))

// Mapping old export values → new model values (same rules as the stage 8 importer where one exists).
const PRICE_UNIT = { '1_kg': 'kg', '100_g': '100g', '1_kus': 'piece', '1_baleni': 'piece' }
/** Same table as AVAILABILITY_MAP in src/migration/extract/product.ts (+ unknown texts). */
function mapAvailability(text) {
  const t = fold(text)
  if (!t) return null
  if (/^skladem/.test(t)) return 'in-stock'
  if (/dle aktualni zasoby/.test(t)) return 'in-stock'
  if (/na objednavku/.test(t)) return 'in-stock'
  if (/na\s+cest/.test(t)) return 'in-transit'
  if (/vyprod|nedostup|neni skladem|momentalne ne|docasne ne/.test(t)) return 'sold-out'
  return 'unknown' // "Na dotaz", "ve výrobě": the importer has no rule (→ in-stock with a warning)
}
/** Shelf-life code list name ("Chlazené, trvanlivost 2 měsíce, 10 °C") → days. */
function shelfDays(name) {
  const m = fold(name).match(/trvanlivost (\d+) (den|dny|dnu|tyden|tydny|tydnu|mesic|mesice|mesicu|rok|roky|let)/)
  if (!m) return null
  const n = Number(m[1])
  if (m[2].startsWith('rok') || m[2] === 'let') return n * 365
  if (m[2].startsWith('mesic')) return n * 30
  if (m[2].startsWith('tyd')) return n * 7
  return n
}
const shelfParts = (name) => {
  const parts = clean(name).split(',').map((p) => p.trim())
  const type = parts[0] && /^(chlazen|mra[zž]en)/i.test(parts[0]) ? parts[0] : null
  const storage = parts.length > 1 && !/^trvanlivost/i.test(parts[parts.length - 1]) ? parts[parts.length - 1] : null
  return { type, storage }
}
const normTemp = (s) => fold(s).replace(/\s+/g, '').replace(/anizsi$/, '')

// ------------------------------------------------------------------ load

const { header, rows: exportRows } = readXlsx(xlsxPath)

const client = new pg.Client({ connectionString: dbUrl })
await client.connect()
await client.query('SET default_transaction_read_only = on')
const q = async (sql) => (await client.query(sql)).rows

const products = await q(`
  select p.id, p.title, p.legacy_url, p.sku, p.price::float as price, p.price_unit::text as price_unit,
         p.availability::text as availability, p._status::text as status, p.vat_rate::text as vat_rate,
         p.voucher_enabled, p.voucher_value::float as voucher_value, p.updated_at, p.migration_imported_at,
         p.main_image_id,
         o.name as origin, c.name as cut, mt.name as meat_type, sl.name as shelf_life
  from products p
  left join origins o on o.id = p.origin_id
  left join cuts c on c.id = p.cut_id
  left join meat_types mt on mt.id = p.meat_type_id
  left join shelf_lives sl on sl.id = p.shelf_life_id
  order by p.id`)
const rels = await q(`
  select r.parent_id, r.path, cat.title as category, u.name as usage, r.media_id
  from products_rels r
  left join categories cat on cat.id = r.categories_id
  left join usages u on u.id = r.usages_id
  order by r.parent_id, r.path, r."order"`)
const variants = await q(`
  select _parent_id as parent_id, label, kind::text as kind, weight_grams::float as weight_grams
  from products_variants order by _parent_id, _order`)
const categoryTitles = (await q('select title from categories')).map((r) => r.title)
const voucherFormats = await q('select parent_id, value::text as format from products_voucher_formats')
await client.end()

for (const p of products) {
  p.oldId = Number(String(p.legacy_url ?? '').match(/-detail-(\d+)$/)?.[1] ?? NaN)
  p.categories = rels.filter((r) => r.parent_id === p.id && r.path === 'categories').map((r) => r.category)
  p.usages = rels.filter((r) => r.parent_id === p.id && r.path === 'usages').map((r) => r.usage)
  p.images = (p.main_image_id ? 1 : 0) + rels.filter((r) => r.parent_id === p.id && r.path === 'gallery').length
  p.variants = variants.filter((v) => v.parent_id === p.id)
  p.formats = voucherFormats.filter((f) => f.parent_id === p.id).map((f) => f.format)
}

// ------------------------------------------------------------------ matching

const byOldId = new Map(products.filter((p) => Number.isFinite(p.oldId)).map((p) => [p.oldId, p]))
const skuMismatch = products.filter((p) => String(p.sku) !== String(p.oldId)).length
const matched = [] // { row, p, how }
const unmatchedRows = []
for (const row of exportRows) {
  const p = byOldId.get(Number(row['Short Id']))
  if (p) matched.push({ row, p, how: 'short-id' })
  else unmatchedRows.push(row)
}
// Title fallback (unique on both sides only).
const usedIds = new Set(matched.map((m) => m.p.id))
const titleCount = (list, get) => {
  const m = new Map()
  for (const x of list) count(m, fold(get(x)))
  return m
}
const restProducts = products.filter((p) => !usedIds.has(p.id))
const tcRows = titleCount(exportRows, (r) => r.Title)
const tcProd = titleCount(restProducts, (p) => p.title)
const titleMatched = []
for (const row of [...unmatchedRows]) {
  const key = fold(row.Title)
  if (tcRows.get(key) !== 1 || tcProd.get(key) !== 1) continue
  const p = restProducts.find((x) => fold(x.title) === key)
  titleMatched.push({ row, p, how: 'title' })
  unmatchedRows.splice(unmatchedRows.indexOf(row), 1)
  usedIds.add(p.id)
}
matched.push(...titleMatched)
const notInExport = products.filter((p) => !usedIds.has(p.id))

// Verification sample of the id rule: titles equal after normalising?
const idTitleEqual = matched.filter((m) => m.how === 'short-id' && fold(m.row.Title) === fold(m.p.title)).length

// ------------------------------------------------------------------ export overview

const summary = {
  exportFile: xlsxPath.split(/[\\/]/).pop(),
  exportColumns: header.length,
  exportRows: exportRows.length,
  exportLatestModified: excelDate(Math.max(...exportRows.map((r) => r.Modified).filter((n) => typeof n === 'number'))),
  exportLatestCreated: excelDate(Math.max(...exportRows.map((r) => r.Created).filter((n) => typeof n === 'number'))),
  exportActive: sorted(exportRows.reduce((m, r) => (count(m, r.Active), m), new Map())),
  dbProducts: products.length,
  dbByStatus: sorted(products.reduce((m, p) => (count(m, `${p.status}/${p.availability}`), m), new Map())),
  dbSkuEqualsLegacyId: products.length - skuMismatch,
  matchedByShortId: matched.filter((m) => m.how === 'short-id').length,
  matchedByShortIdTitleEqual: idTitleEqual,
  matchedByTitle: titleMatched.length,
  matchedByTitleList: titleMatched.map((m) => `${m.row['Short Id']} „${clean(m.row.Title)}“ → ${m.p.legacy_url}`),
  exportNotImported: unmatchedRows.length,
  dbNotInExport: notInExport.length,
}

// Unmatched export rows, split.
const split = (list, key) => sorted(list.reduce((m, r) => (count(m, key(r)), m), new Map()))
summary.notImportedByActive = split(unmatchedRows, (r) => r.Active)
summary.notImportedByDostupnost = split(unmatchedRows, (r) => r.Dostupnost ?? '(prázdné)')
summary.notImportedActiveByDostupnost = split(unmatchedRows.filter((r) => r.Active === 'Checked'), (r) => r.Dostupnost ?? '(prázdné)')
summary.notImportedByCategory = split(unmatchedRows, (r) => r.Category ?? '(prázdné)')
summary.notImportedActiveByCategory = split(unmatchedRows.filter((r) => r.Active === 'Checked'), (r) => r.Category ?? '(prázdné)')
summary.notImportedActivePrice0 = unmatchedRows.filter((r) => r.Active === 'Checked' && !r['Selling price']).length
summary.notImportedActiveList = unmatchedRows
  .filter((r) => r.Active === 'Checked')
  .map((r) => `${r['Short Id']}|${clean(r.Title)}|${r.Category ?? ''}|${r.Dostupnost ?? ''}|${r['Selling price']}|mod ${excelDate(r.Modified)}|views ${r['Web display count']}`)
summary.matchedByActive = split(matched, (m) => m.row.Active)
summary.matchedUncheckedDetail = split(
  matched.filter((m) => m.row.Active === 'Unchecked'),
  (m) => `${m.p.status}/${m.p.availability}`,
)

writeCsv(
  'chybi-v-novem-eshopu.csv',
  ['Short Id', 'Název', 'Aktivní (Active)', 'Dostupnost', 'Kategorie', 'Prodejní cena', 'Cena za', 'Upraveno', 'Zobrazení na webu', 'Obrázků'],
  unmatchedRows
    .slice()
    .sort((a, b) => (a.Active === b.Active ? (b['Web display count'] ?? 0) - (a['Web display count'] ?? 0) : a.Active === 'Checked' ? -1 : 1))
    .map((r) => [
      r['Short Id'],
      clean(r.Title),
      r.Active === 'Checked' ? 'ano' : 'ne',
      r.Dostupnost ?? '',
      r.Category ?? '',
      fmtNum(r['Selling price']),
      r['Cena za'] ?? '',
      excelDate(r.Modified),
      r['Web display count'] ?? '',
      r.Images ?? '',
    ]),
)
writeCsv(
  'chybi-v-exportu.csv',
  ['Staré ID (z adresy)', 'Název', 'Stav (_status)', 'Dostupnost', 'Cena', 'Jednotka', 'Kategorie', 'Stará adresa'],
  notInExport.map((p) => [p.oldId, p.title, p.status, p.availability, fmtNum(p.price), p.price_unit, p.categories.join(', '), p.legacy_url]),
)

// ------------------------------------------------------------------ field comparison

const diffs = [] // [shortId, title, field, exportValue, shopValue, note]
const stats = {} // field → { same, different, exportEmpty, shopEmpty, bothEmpty, ... }
const stat = (field, key) => {
  stats[field] ??= {}
  stats[field][key] = (stats[field][key] ?? 0) + 1
}
const addDiff = (m, field, ev, sv, note = '') => diffs.push([m.row['Short Id'], clean(m.row.Title), field, ev ?? '', sv ?? '', note])
const priceExamples = []

for (const m of matched) {
  const { row, p } = m

  // Title
  if (row.Title === p.title) stat('název', 'shodné')
  else if (clean(row.Title) === clean(p.title)) stat('název', 'liší se jen mezerami')
  else if (fold(row.Title) === fold(p.title)) {
    stat('název', 'liší se jen velikostí písmen/diakritikou')
    addDiff(m, 'název', clean(row.Title), p.title, 'jen velká/malá písmena nebo diakritika')
  } else {
    stat('název', 'jiný')
    addDiff(m, 'název', clean(row.Title), p.title)
  }

  // Price unit
  const unitExport = row['Cena za'] ? (PRICE_UNIT[row['Cena za']] ?? `?${row['Cena za']}`) : null
  if (!unitExport) stat('jednotka ceny', 'v exportu prázdné')
  else if (unitExport === p.price_unit) stat('jednotka ceny', 'shodné')
  else {
    stat('jednotka ceny', 'jiné')
    addDiff(m, 'jednotka ceny (Cena za / priceUnit)', row['Cena za'], p.price_unit)
  }

  // Price
  const ep = row['Selling price']
  const disc = Number(row['Discount %'] ?? 0)
  const orig = row['Price original']
  if (p.price == null) {
    stat('cena', 'v novém e-shopu chybí')
    addDiff(m, 'cena', fmtNum(ep), '', 'nový e-shop nemá cenu (koncept)')
  } else if (Math.abs(Number(ep) - p.price) < 0.005) stat('cena', 'shodné')
  else {
    stat('cena', 'jiné')
    let note = ''
    if (!ep) note = 'v exportu 0 (na webu se cena brala z varianty nebo nebyla)'
    else if (disc || (orig != null && Number(orig) !== Number(ep))) note = `v exportu sleva ${disc} %, původní cena ${fmtNum(orig)}`
    else if (row.Modified && excelDate(row.Modified) > '2026-11-22') note = 'v exportu změněno po stažení webu'
    else if (Number(ep) > 0 && Math.abs(Number(ep) / p.price - 10) < 0.05) note = 'poměr 10 : 1 (cena za kg vs za 100 g?)'
    else if (Number(ep) > 0 && Math.abs(p.price / Number(ep) - 10) < 0.05) note = 'poměr 1 : 10 (cena za 100 g vs za kg?)'
    addDiff(m, 'cena', fmtNum(ep), fmtNum(p.price), `${note}${note ? '; ' : ''}upraveno v exportu ${excelDate(row.Modified)}; jednotka export ${row['Cena za'] ?? '–'} / e-shop ${p.price_unit}`)
    priceExamples.push({ id: row['Short Id'], title: clean(row.Title), export: ep, shop: p.price, unitExport: row['Cena za'], unitShop: p.price_unit, modified: excelDate(row.Modified), note })
  }

  // Active / visibility
  const visible = p.status === 'published' && p.availability !== 'hidden'
  const active = row.Active === 'Checked'
  stat('aktivní vs. viditelnost', `${active ? 'aktivní' : 'neaktivní'} → ${visible ? 'veřejný' : `neveřejný (${p.status}/${p.availability})`}`)
  if (active !== visible)
    addDiff(m, 'aktivní / viditelnost', row.Active, `${p.status} / ${p.availability}`, active ? 'v exportu aktivní, v novém e-shopu skrytý nebo koncept' : 'v exportu neaktivní, v novém e-shopu veřejný')

  // Availability
  const avExport = mapAvailability(row.Dostupnost)
  if (!avExport) stat('dostupnost', 'v exportu prázdné')
  else if (p.availability === 'hidden') stat('dostupnost', 'v e-shopu skryto (hidden)')
  else if (avExport === 'unknown') {
    stat('dostupnost', `export „${row.Dostupnost}“ (bez pravidla) → e-shop ${p.availability}`)
    addDiff(m, 'dostupnost', row.Dostupnost, p.availability, 'pro tento text nemá nový e-shop stav')
  } else if (avExport === p.availability) stat('dostupnost', 'shodné')
  else {
    stat('dostupnost', 'jiné')
    addDiff(m, 'dostupnost', row.Dostupnost, p.availability)
  }

  // Category (export has one, new shop may have several)
  if (empty(row.Category)) stat('kategorie', 'v exportu prázdné')
  else if (p.categories.some((c) => fold(c) === fold(row.Category))) stat('kategorie', 'kategorie z exportu je mezi kategoriemi produktu')
  else {
    const exists = categoryTitles.some((c) => fold(c) === fold(row.Category))
    stat('kategorie', exists ? 'jiná (kategorie v e-shopu existuje)' : 'jiná (kategorie v e-shopu neexistuje)')
    addDiff(m, 'kategorie', clean(row.Category), p.categories.join(', '), exists ? '' : 'taková kategorie v novém e-shopu není')
  }

  // Origin
  const simpleField = (field, ev, sv) => {
    if (empty(ev) && !sv) return stat(field, 'obojí prázdné')
    if (empty(ev)) {
      stat(field, 'jen v e-shopu')
      return addDiff(m, field, '', sv, 'v exportu prázdné')
    }
    if (!sv) {
      stat(field, 'jen v exportu')
      return addDiff(m, field, clean(ev), '', 'v novém e-shopu prázdné')
    }
    if (fold(ev) === fold(sv)) return stat(field, 'shodné (po sjednocení diakritiky/velikosti písmen)')
    stat(field, 'jiné')
    addDiff(m, field, clean(ev), sv)
  }
  simpleField('původ', row['Původ'], p.origin)
  simpleField('druh / výsek (cut)', row['Druh'], p.cut)

  // Meat type: export hovezi/veprove/drubezi/zverina/ostatni; new list adds Wagyu, Telecí, Jehněčí.
  {
    // Export keys are adjectives without diacritics ("drubezi"); the new code list has nouns ("Drůbež").
    const MEAT = { hovezi: 'hovezi', veprove: 'veprove', drubezi: 'drubez', zverina: 'zverina', ostatni: 'ostatni' }
    const ev = MEAT[fold(row['Kategorie masa'])] ?? fold(row['Kategorie masa'])
    const sv = p.meat_type
    if (!ev && !sv) stat('druh masa', 'obojí prázdné')
    else if (!ev) {
      stat('druh masa', 'jen v e-shopu')
      addDiff(m, 'druh masa', '', sv, 'v exportu prázdné')
    } else if (!sv) {
      stat('druh masa', 'jen v exportu')
      addDiff(m, 'druh masa', row['Kategorie masa'], '', 'v novém e-shopu prázdné')
    } else if (ev === fold(sv)) stat('druh masa', 'shodné')
    else if (ev === 'hovezi' && ['wagyu', 'teleci'].includes(fold(sv))) stat('druh masa', 'slučitelné (hovězí → Wagyu/Telecí)')
    else {
      stat('druh masa', 'jiné')
      addDiff(m, 'druh masa', row['Kategorie masa'], sv, ev === 'ostatni' ? 'export „ostatni“ – v novém číselníku nic takového není' : '')
    }
  }

  // Usages
  {
    const ev = new Set(tags(row['Vhodné pro']).map(fold))
    const sv = new Set(p.usages.map(fold))
    if (!ev.size && !sv.size) stat('vhodné pro (usages)', 'obojí prázdné')
    else if (ev.size === sv.size && [...ev].every((x) => sv.has(x))) stat('vhodné pro (usages)', 'shodné')
    else {
      stat('vhodné pro (usages)', !sv.size ? 'jen v exportu' : !ev.size ? 'jen v e-shopu' : 'jiné')
      addDiff(m, 'vhodné pro', tags(row['Vhodné pro']).join(', '), p.usages.join(', '))
    }
  }

  // Shelf life (days) + chilled/frozen + storage, all three live in the shelf-life code list name.
  {
    const ed = empty(row['Trvanlivost']) ? null : Number(String(row['Trvanlivost']).trim())
    const sd = p.shelf_life ? shelfDays(p.shelf_life) : null
    if (ed == null && sd == null) stat('trvanlivost (dny)', 'obojí prázdné')
    else if (ed === sd) stat('trvanlivost (dny)', 'shodné')
    else {
      stat('trvanlivost (dny)', ed == null ? 'jen v e-shopu' : sd == null ? 'jen v exportu' : 'jiné')
      addDiff(m, 'trvanlivost (dny)', ed ?? '', p.shelf_life ?? '', 'e-shop: název položky číselníku Trvanlivost')
    }
    const { type, storage } = shelfParts(p.shelf_life ?? '')
    const et = empty(row['Typ']) ? null : fold(row['Typ']).slice(0, 6)
    const st = type ? fold(type).slice(0, 6) : null
    if (!et && !st) stat('typ (chlazené/mražené)', 'obojí prázdné')
    else if (et === st) stat('typ (chlazené/mražené)', 'shodné')
    else {
      stat('typ (chlazené/mražené)', !st ? 'jen v exportu' : !et ? 'jen v e-shopu' : 'jiné')
      addDiff(m, 'typ (chlazené/mražené)', row['Typ'] ?? '', p.shelf_life ?? '')
    }
    const es = empty(row['Skladování']) ? null : normTemp(row['Skladování'])
    const ss = storage ? normTemp(storage) : null
    if (!es && !ss) stat('skladování', 'obojí prázdné')
    else if (es === ss) stat('skladování', 'shodné')
    else {
      stat('skladování', !ss ? 'jen v exportu' : !es ? 'jen v e-shopu' : 'jiné')
      addDiff(m, 'skladování', row['Skladování'] ?? '', p.shelf_life ?? '')
    }
  }

  // Images (count only, informative)
  const ei = Number(row.Images ?? 0)
  if (ei === p.images) stat('počet obrázků', 'shodné')
  else stat('počet obrázků', ei > p.images ? 'v exportu víc' : 'v e-shopu víc')

  // Voucher flag
  const ev = row['Dárkový poukaz'] === 'Checked'
  if (ev || p.voucher_enabled) stat('dárkový poukaz', `${ev ? 'export ano' : 'export ne'} / e-shop ${p.voucher_enabled ? 'ano' : 'ne'}`)
}

writeCsv(
  'rozdily.csv',
  ['Short Id', 'Název (export)', 'Pole', 'Hodnota v exportu', 'Hodnota v novém e-shopu', 'Poznámka'],
  diffs.sort((a, b) => (a[2] === b[2] ? a[0] - b[0] : a[2].localeCompare(b[2], 'cs'))),
)
summary.fieldStats = stats
summary.diffCount = diffs.length
summary.diffByField = sorted(diffs.reduce((m, d) => (count(m, d[2]), m), new Map()))
summary.priceDiffNotes = sorted(priceExamples.reduce((m, x) => (count(m, x.note.split(';')[0] || '(bez vysvětlení)'), m), new Map()))
summary.priceDiffModifiedYears = sorted(priceExamples.reduce((m, x) => (count(m, (x.modified ?? '').slice(0, 4)), m), new Map()))
summary.priceExamples = priceExamples.slice(0, 400)
summary.availabilityPairs = sorted(
  matched.reduce((m, x) => (count(m, `${x.row.Dostupnost ?? '(prázdné)'} → ${x.p.status}/${x.p.availability}`), m), new Map()),
)

// ------------------------------------------------------------------ variants vs. export columns

const variantInfo = new Map()
for (const m of matched) {
  const vs = m.p.variants
  const key = `${vs.length ? 'má varianty' : 'bez variant'} | porce ${m.row['Velikost porce'] ?? '–'}`
  count(variantInfo, key)
}
summary.variantsVsPortion = sorted(variantInfo)
// "Velikost kusu" (kg) vs. the weight of a "whole piece" variant.
{
  let same = 0
  let diff = 0
  let noWhole = 0
  const ex = []
  for (const m of matched) {
    const kus = Number(m.row['Velikost kusu'])
    if (!kus) continue
    const whole = m.p.variants.find((v) => /cel[ýy]\s*kus|^1\s*ks$|^1\s*kus$/i.test(clean(v.label)))
    if (!whole) {
      noWhole++
      continue
    }
    if (Math.abs(whole.weight_grams - kus * 1000) < 1) same++
    else {
      diff++
      if (ex.length < 15) ex.push(`${m.row['Short Id']} ${clean(m.row.Title)}: kus ${kus} kg, varianta „${whole.label}“ ${whole.weight_grams} g`)
    }
  }
  summary.pieceSizeVsWholeVariant = { same, diff, noWholeVariant: noWhole, examples: ex }
}
summary.matchedWithVariants = matched.filter((m) => m.p.variants.length).length
summary.variantsTotal = matched.reduce((n, m) => n + m.p.variants.length, 0)
summary.typRozdeleniVsDruh = (() => {
  let filled = 0
  let equalDruh = 0
  for (const r of exportRows) {
    if (empty(r['Typ rozdělení'])) continue
    filled++
    if (fold(r['Typ rozdělení']) === fold(r['Druh'])) equalDruh++
  }
  return { filled, equalDruh }
})()

// ------------------------------------------------------------------ columns without a field

const colInfo = (col, splitTags = false) => {
  const vals = new Map()
  let filled = 0
  let filledActive = 0
  for (const r of exportRows) {
    const v = r[col]
    if (empty(v) || v === 'Unchecked') continue
    filled++
    if (r.Active === 'Checked') filledActive++
    if (splitTags) for (const t of tags(v)) count(vals, t)
    else count(vals, typeof v === 'string' ? v : String(v))
  }
  return { filled, filledActive, distinct: vals.size, top: Object.fromEntries([...vals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) }
}
summary.columns = {
  'Alergeny': colInfo('Alergeny', true),
  'Alergeny (celé hodnoty)': colInfo('Alergeny'),
  'Typ': colInfo('Typ'),
  'Skladování': colInfo('Skladování'),
  'Zrání masa': colInfo('Zrání masa'),
  'Bezlepkový': colInfo('Bezlepkový'),
  'Velikost porce': colInfo('Velikost porce', true),
  'Velikost kusu': colInfo('Velikost kusu'),
  'Tags': colInfo('Tags', true),
  'Cat. number': colInfo('Cat. number'),
  'Ext. Id': colInfo('Ext. Id'),
  'Index pozice': colInfo('Index pozice'),
  'Web display count': colInfo('Web display count'),
  'Složení - odkaz': colInfo('Složení - odkaz'),
  'Bocus - odkaz': colInfo('Bocus - odkaz'),
  'Podrobnější informace - titulek': colInfo('Podrobnější informace - titulek'),
  'Skrýt informace k masu': colInfo('Skrýt informace k masu'),
  'Typ rozdělení': colInfo('Typ rozdělení'),
  'filtr - cena': colInfo('filtr - cena'),
  'filtr - mnozstvi': colInfo('filtr - mnozstvi'),
  'Weight': colInfo('Weight'),
  'Sale class': colInfo('Sale class'),
  'Rounding type': colInfo('Rounding type'),
  'Discount type': colInfo('Discount type'),
  'Dostupnost - s řazením': colInfo('Dostupnost - s řazením'),
}
summary.allergenRows = exportRows
  .filter((r) => !empty(r.Alergeny))
  .map((r) => `${r['Short Id']}|${clean(r.Title)}|${r.Alergeny}|${r.Active}|${byOldId.has(Number(r['Short Id'])) ? 'importováno' : 'neimportováno'}`)
summary.tagRows = exportRows.filter((r) => !empty(r.Tags)).map((r) => `${r['Short Id']}|${clean(r.Title)}|${r.Tags}|${r.Active}`)
summary.slozeniRows = exportRows
  .filter((r) => !empty(r['Složení - odkaz']))
  .map((r) => `${r['Short Id']}|${clean(r.Title)}|${r['Složení - odkaz']}|${r.Category}|${r.Active}`)
summary.web_display_top = exportRows
  .slice()
  .sort((a, b) => (b['Web display count'] ?? 0) - (a['Web display count'] ?? 0))
  .slice(0, 10)
  .map((r) => `${r['Short Id']}|${clean(r.Title)}|${r['Web display count']}|${r.Active}`)

// Discounts (business rule 1)
const discountRows = exportRows.filter((r) => Number(r['Discount %'] ?? 0) !== 0)
const origDiffRows = exportRows.filter((r) => r['Price original'] != null && Number(r['Price original']) !== Number(r['Selling price']))
summary.discounts = {
  discountNonZero: discountRows.length,
  priceOriginalDiffers: origDiffRows.length,
  discountTypePercent: exportRows.filter((r) => r['Discount type'] === 'percent').length,
  rows: [...new Set([...discountRows, ...origDiffRows])].map(
    (r) => `${r['Short Id']}|${clean(r.Title)}|sell ${r['Selling price']}|disc ${r['Discount %']}|orig ${r['Price original']}|${r.Active}|${r['Discount type']}|imported ${byOldId.has(Number(r['Short Id'])) ? fmtNum(byOldId.get(Number(r['Short Id'])).price) : '-'}`,
  ),
}

// ------------------------------------------------------------------ vouchers

summary.vouchers = {
  export: exportRows
    .filter((r) => r['Dárkový poukaz'] === 'Checked')
    .map((r) => {
      const p = byOldId.get(Number(r['Short Id']))
      return `${r['Short Id']}|${clean(r.Title)}|${r['Selling price']}|${r.Active}|${r.Category}|VAT? n/a|${p ? `${p.title} / ${p.status} / voucher ${p.voucher_enabled} ${p.voucher_value ?? ''} ${p.formats.join('+')} / price ${p.price} / vat ${p.vat_rate}` : 'neimportováno'}`
    }),
  shop: products.filter((p) => p.voucher_enabled).map((p) => `${p.oldId}|${p.title}|${p.voucher_value}|${p.formats.join('+')}|${p.status}`),
  exportTitlesWithPoukaz: exportRows.filter((r) => /poukaz/i.test(r.Title)).map((r) => `${r['Short Id']}|${clean(r.Title)}|${r['Dárkový poukaz']}|${r.Active}|${r['Selling price']}`),
}

// ------------------------------------------------------------------ data quality

const dupTitles = [...titleCount(exportRows, (r) => r.Title).entries()].filter(([, n]) => n > 1)
summary.quality = {
  duplicateTitles: dupTitles.map(([t]) =>
    exportRows
      .filter((r) => fold(r.Title) === t)
      .map((r) => `${r['Short Id']} „${r.Title}“ ${r.Active} ${r.Dostupnost ?? ''} ${r['Selling price']}`)
      .join(' || '),
  ),
  titlesWithOuterSpaces: exportRows.filter((r) => typeof r.Title === 'string' && r.Title !== r.Title.trim()).length,
  titlesWithOuterSpacesActive: exportRows.filter((r) => r.Active === 'Checked' && r.Title !== r.Title.trim()).length,
  titlesWithDoubleSpaces: exportRows.filter((r) => /\s{2,}/.test(r.Title.trim())).length,
  activePrice0: exportRows.filter((r) => r.Active === 'Checked' && !Number(r['Selling price'])).map((r) => `${r['Short Id']}|${clean(r.Title)}|${r.Dostupnost ?? ''}|${r['Cena za'] ?? ''}|${byOldId.get(Number(r['Short Id']))?.price ?? 'neimp.'}`),
  allPrice0: exportRows.filter((r) => !Number(r['Selling price'])).length,
  activeNoCategory: exportRows.filter((r) => r.Active === 'Checked' && empty(r.Category)).map((r) => `${r['Short Id']}|${clean(r.Title)}`),
  activeNoAvailability: exportRows.filter((r) => r.Active === 'Checked' && empty(r.Dostupnost)).map((r) => `${r['Short Id']}|${clean(r.Title)}`),
  activeNoPriceUnit: exportRows.filter((r) => r.Active === 'Checked' && empty(r['Cena za'])).map((r) => `${r['Short Id']}|${clean(r.Title)}|${r['Selling price']}`),
  activeNoImage: exportRows.filter((r) => r.Active === 'Checked' && !Number(r.Images)).length,
  activeNoImageList: exportRows.filter((r) => r.Active === 'Checked' && !Number(r.Images)).map((r) => `${r['Short Id']}|${clean(r.Title)}`),
  spellingVariants: {},
  activeSoldOut: exportRows.filter((r) => r.Active === 'Checked' && /vyprod|nedostup/i.test(fold(r.Dostupnost))).length,
  inactiveInStock: exportRows.filter((r) => r.Active === 'Unchecked' && /^skladem/i.test(fold(r.Dostupnost))).length,
  trvanlivostNonNumeric: exportRows.filter((r) => !empty(r.Trvanlivost) && !/^\d+$/.test(String(r.Trvanlivost).trim())).map((r) => r.Trvanlivost),
  piece100gSuspicious: exportRows
    .filter((r) => r['Cena za'] === '1_kg' && Number(r['Selling price']) > 0 && Number(r['Selling price']) < 60)
    .map((r) => `${r['Short Id']}|${clean(r.Title)}|${r['Selling price']}/kg`),
  modifiedByMonth: sorted(exportRows.reduce((m, r) => (count(m, (excelDate(r.Modified) ?? '').slice(0, 7)), m), new Map())),
  notImportedModifiedByYear: sorted(unmatchedRows.reduce((m, r) => (count(m, (excelDate(r.Modified) ?? '').slice(0, 4)), m), new Map())),
  notImportedRecent: unmatchedRows
    .filter((r) => (excelDate(r.Modified) ?? '') >= '2025-06-01')
    .map((r) => `${r['Short Id']}|${clean(r.Title)}|${r.Category}|${r.Dostupnost}|${r['Selling price']}|${excelDate(r.Modified)}`),
  notImportedSameTitleAsImported: unmatchedRows
    .filter((r) => products.some((p) => fold(p.title) === fold(r.Title)))
    .map((r) => `${r['Short Id']}|${clean(r.Title)}`),
  draftsActiveWithoutImage: matched.filter((m) => m.row.Active === 'Checked' && m.p.status === 'draft' && !m.p.images).length,
  draftsActiveTotal: matched.filter((m) => m.row.Active === 'Checked' && m.p.status === 'draft').length,
  availabilityDiffModified: matched
    .filter((m) => /na cest/i.test(fold(m.row.Dostupnost)) && m.p.availability !== 'in-transit')
    .map((m) => `${m.row['Short Id']}|${excelDate(m.row.Modified)}|${m.p.migration_imported_at?.toISOString?.()}`),
  meatTypeEmptyInShop: matched.filter((m) => !m.p.meat_type).map((m) => `${m.row['Short Id']}|${clean(m.row.Title)}|${m.row['Kategorie masa'] ?? ''}`),
}
for (const col of ['Původ', 'Druh', 'Skladování', 'Dostupnost', 'Kategorie masa', 'Typ', 'Typ rozdělení', 'Category']) {
  const groups = new Map()
  for (const r of exportRows) {
    if (empty(r[col])) continue
    const key = fold(r[col]).replace(/[\s°]/g, '')
    groups.set(key, groups.get(key) ?? new Map())
    count(groups.get(key), r[col])
  }
  const multi = [...groups.values()].filter((g) => g.size > 1).map((g) => [...g.entries()].map(([v, n]) => `„${v}“×${n}`).join(' / '))
  const noDia = [...new Set(exportRows.map((r) => r[col]).filter((v) => typeof v === 'string' && fold(v) === v.toLowerCase().trim() && /[a-z]/.test(v)))]
  summary.quality.spellingVariants[col] = { sameAfterNormalising: multi, withoutDiacriticsOrLowercaseSample: noDia.slice(0, 25), distinct: new Set(exportRows.map((r) => r[col]).filter((v) => !empty(v))).size }
}

console.log(JSON.stringify(summary, null, 2))
