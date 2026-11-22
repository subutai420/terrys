import { readFile } from 'fs/promises'
import path from 'path'
import type { Payload } from 'payload'
import { fileURLToPath } from 'url'

import { prefillHolidayExceptions } from '@/delivery/holidayPrefill'
import { importPostcodesCsv } from '@/delivery/postcodeImport'
import { toShopDateTime } from '@/lib/delivery/calendar'
import { DEFAULT_WEEKDAYS } from '@/lib/delivery/constants'

import { TODO } from './data'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/** Marker for values nobody has confirmed yet (cut-off times, days, which postcodes go where). */
export const PROVISIONAL = 'PROVIZORNÍ'

const provisionalNote = (extra: string) =>
  `${PROVISIONAL}: uzávěrka 12:00, příprava 1 den a dny út–pá jsou jen výchozí odhad. ` +
  `${extra} ${TODO}: ověřit s majitelem a upravit.`

type Log = (message: string) => void
type Stats = { created: number; existing: number }

/**
 * Delivery part of `pnpm seed` (stage 2). Create-only and idempotent like the rest of the seed:
 * shipping methods are looked up by slug, the zone by name, postcodes by PSČ, holidays by date.
 * Existing records are never changed.
 */
export async function seedDelivery(
  payload: Payload,
  stats: Stats,
  log: Log,
  { now = new Date() }: { now?: Date } = {},
) {
  async function findLocation(slug: string) {
    const found = await payload.find({
      collection: 'locations',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
    })
    return found.docs[0]?.id
  }

  async function ensureMethod(slug: string, data: Record<string, unknown>) {
    const found = await payload.find({
      collection: 'shipping-methods',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
    })
    if (found.docs[0]) {
      stats.existing++
      return found.docs[0].id
    }
    const created = await payload.create({
      collection: 'shipping-methods',
      data: { slug, ...data } as never,
    })
    stats.created++
    return created.id
  }

  const common = {
    weekdays: DEFAULT_WEEKDAYS,
    cutoffTime: '12:00',
    leadDays: 1,
    active: true,
  }

  const vanId = await ensureMethod('rozvoz-terrys', {
    ...common,
    name: 'Rozvoz chladicím vozem Terrys',
    type: 'own-delivery',
    coverage: 'zones',
    sortOrder: 10,
    internalNote: provisionalNote('Oblast rozvozu je zatím jen Praha (PSČ 1*).'),
  })
  await ensureMethod('kuryr-ppl', {
    ...common,
    name: 'Kurýr PPL (chlazená zásilka)',
    type: 'courier',
    coverage: 'fallback',
    balikobot: { carrierCode: 'ppl', serviceCode: '' },
    sortOrder: 20,
    internalNote: provisionalNote(
      'Kurýr je nastaven jako záložní doprava všude, kam nejezdí vlastní vůz. Kód služby ' +
        'Balíkobotu doplnit v etapě 5.',
    ),
  })
  const shopId = await findLocation('prodejna-praha-vinohrady')
  const warehouseId = await findLocation('sklad-slivinko')
  await ensureMethod('osobni-odber-italska', {
    ...common,
    name: 'Osobní odběr – prodejna Praha 2, Italská 17',
    type: 'pickup',
    location: shopId,
    sortOrder: 30,
    internalNote: provisionalNote('Výdejní dny prodejny nejsou potvrzené.'),
  })
  await ensureMethod('osobni-odber-slivinko', {
    ...common,
    name: 'Osobní odběr – sklad Slivínko',
    type: 'pickup',
    location: warehouseId,
    sortOrder: 40,
    internalNote: provisionalNote('Výdejní dny skladu nejsou potvrzené.'),
  })
  log('Způsoby dopravy: 4 (PROVIZORNÍ nastavení)')

  // ------------------------------------------------------------------ zone
  const zoneName = `Praha (${PROVISIONAL})`
  const zone = await payload.find({
    collection: 'delivery-zones',
    where: { name: { equals: zoneName } },
    limit: 1,
    depth: 0,
  })
  if (zone.docs[0]) stats.existing++
  else {
    await payload.create({
      collection: 'delivery-zones',
      data: {
        name: zoneName,
        method: vanId,
        postcodes: '1*',
        note: `${PROVISIONAL}: celá Praha (PSČ začínající 1). ${TODO}: doplnit okolí, kam vůz jezdí.`,
        active: true,
      },
    })
    stats.created++
  }
  log('Rozvozové oblasti: 1')

  // ------------------------------------------------------------------ postcodes (sample)
  const csv = await readFile(path.join(dirname, 'postcodes-sample.csv'), 'utf-8')
  const imported = await importPostcodesCsv(payload, csv, { createOnly: true })
  stats.created += imported.created
  stats.existing += imported.unchanged
  log(
    `PSČ (UKÁZKA, ne úplný seznam): nových ${imported.created}, existujících ${imported.unchanged}`,
  )

  // ------------------------------------------------------------------ holidays
  const today = toShopDateTime(now).date
  const year = Number(today.slice(0, 4))
  for (const y of [year, year + 1]) {
    const result = await prefillHolidayExceptions(payload, { year: y, today })
    stats.created += result.created.length
    stats.existing += result.skipped
    log(`Svátky ${y}: přidáno ${result.created.length}, přeskočeno ${result.skipped}`)
  }
}
