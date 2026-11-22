import path from 'path'
import type { Payload } from 'payload'
import { fileURLToPath } from 'url'

import { displayVoucherCode, generateVoucherCode, normalizeVoucherCode } from '@/lib/vouchers/code'
import { VOUCHER_VALUES } from '@/lib/vouchers/constants'

/**
 * Stage 7 seed part `vouchers`.
 *
 * 1. ALWAYS (also on the imported catalog): maps existing products named "Dárkový poukaz
 *    1 000 Kč" (the four products imported from the old shop, category "Dárkové poukazy + set")
 *    onto the voucher model – `voucher.enabled`, value from the name, both formats. Nothing is
 *    duplicated; the VAT rate is NOT touched (accountant decides). Only products not mapped yet.
 * 2. NON-PRODUCTION only (demo / tests):
 *    - four demo voucher products when the database has none,
 *    - an active demo batch (letter T, valid to the end of next year) when there is no batch,
 *    - a clearly FAKE bank account (the example account of the QR Platba specification) when the
 *      setting is empty – never in production: there the account stays empty until the owner
 *      enters the real one, and electronic vouchers cannot be ordered until then,
 *    - two demo voucher records (one paid electronic, one old-shop) marked "UKÁZKOVÝ".
 */

type Stats = { created: number; existing: number }
type Log = (message: string) => void

const dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * TEST ONLY – the example account of https://qr-platba.cz/pro-vyvojare/specifikace-formatu/
 * (123/0600 = CZ91 0600 0000 0000 0000 0123). Never a real Terrys account.
 */
export const DEMO_TEST_BANK_ACCOUNT = 'CZ9106000000000000000123'

const VOUCHER_TITLE = /^Dárkový poukaz\s+([\d\s .]+)\s*Kč$/i

export function voucherValueFromTitle(title: string): number | null {
  const match = title.trim().match(VOUCHER_TITLE)
  if (!match) return null
  const value = Number(match[1].replace(/[\s .]/g, ''))
  return Number.isInteger(value) && value > 0 ? value : null
}

export async function seedVouchers(payload: Payload, stats: Stats, log: Log) {
  const production = process.env.NODE_ENV === 'production'

  // 1. Map imported voucher products.
  const candidates = await payload.find({
    collection: 'products',
    where: { title: { like: 'Dárkový poukaz' } },
    limit: 50,
    depth: 0,
    draft: true,
  })
  let mapped = 0
  for (const product of candidates.docs) {
    const value = voucherValueFromTitle(product.title)
    if (!value || product.voucher?.enabled) continue
    await payload.update({
      collection: 'products',
      id: product.id,
      data: { voucher: { enabled: true, value, formats: ['electronic', 'printed'] } },
      context: { disableRevalidate: true },
    })
    mapped++
    log(
      `Poukaz namapován: ${product.title} (id ${product.id}, hodnota ${value} Kč, DPH ${product.vatRate} % beze změny)`,
    )
  }
  if (mapped) stats.created += mapped

  if (production) {
    log('Poukazy: produkce – ukázkové šarže, účet ani poukazy se nevytváří.')
    return
  }

  // 2a. Demo voucher products (fresh database only).
  const existing = await payload.count({
    collection: 'products',
    where: { 'voucher.enabled': { equals: true } },
  })
  if (existing.totalDocs === 0) {
    const category = await payload.find({
      collection: 'categories',
      where: { slug: { equals: 'darkove-poukazy-a-krabicky' } },
      limit: 1,
      depth: 0,
    })
    const image = await payload.create({
      collection: 'media',
      data: { alt: 'Dárkový poukaz Terrys' },
      filePath: path.join(dirname, 'assets', 'voucher-800.webp'),
    })
    for (const value of VOUCHER_VALUES) {
      const label = value.toLocaleString('cs-CZ').replace(/ /g, ' ')
      await payload.create({
        collection: 'products',
        data: {
          title: `Dárkový poukaz ${label} Kč`,
          slug: `darkovy-poukaz-${value}-kc`,
          price: value,
          priceUnit: 'piece',
          // DEMO: the VAT rate of vouchers is an open question for the accountant.
          vatRate: '0',
          availability: 'in-stock',
          mainImage: image.id,
          categories: category.docs[0] ? [category.docs[0].id] : [],
          voucher: { enabled: true, value, formats: ['electronic', 'printed'] },
          _status: 'published',
        },
        context: { disableRevalidate: true },
      })
      stats.created++
    }
    log('Ukázkové poukazy: 500 / 1 000 / 2 000 / 5 000 Kč (DPH 0 % jen ukázka – určí účetní)')
  }

  // 2b. Demo batch.
  const batches = await payload.count({ collection: 'voucher-batches' })
  let batchId: number | null = null
  if (batches.totalDocs === 0) {
    const nextYear = new Date().getFullYear() + 1
    const batch = await payload.create({
      collection: 'voucher-batches',
      data: {
        letter: 'T',
        expiresOn: `${nextYear}-12-31T12:00:00.000Z`,
        active: true,
        note: 'UKÁZKOVÁ ŠARŽE (seed) – v ostrém provozu založte vlastní.',
      },
      context: { disableRevalidate: true },
    })
    batchId = batch.id
    stats.created++
    log(`Ukázková šarže T, platnost do 31. 12. ${nextYear}`)
  }

  // 2c. Fake test bank account (only when empty).
  const settings = await payload.findGlobal({ slug: 'settings' })
  if (!settings.vouchers?.bankAccount) {
    await payload.updateGlobal({
      slug: 'settings',
      data: { vouchers: { ...settings.vouchers, bankAccount: DEMO_TEST_BANK_ACCOUNT } },
      context: { disableRevalidate: true },
    })
    log(
      `Bankovní účet pro poukazy: TESTOVACÍ ${DEMO_TEST_BANK_ACCOUNT} (příklad ze specifikace QR Platba, NE skutečný účet)`,
    )
  }

  // 2d. Two demo voucher records.
  const demo = await payload.count({
    collection: 'vouchers',
    where: { note: { like: 'UKÁZKOVÝ' } },
  })
  if (demo.totalDocs === 0) {
    const batch =
      batchId ??
      (
        await payload.find({
          collection: 'voucher-batches',
          where: { active: { equals: true } },
          limit: 1,
          depth: 0,
        })
      ).docs[0]?.id ??
      null
    const batchDoc = batch
      ? await payload.findByID({ collection: 'voucher-batches', id: batch, depth: 0 })
      : null
    const now = new Date().toISOString()
    if (batchDoc) {
      const code = generateVoucherCode(batchDoc.letter)
      await payload.create({
        collection: 'vouchers',
        context: { voucherService: true },
        data: {
          code,
          codeNormalized: normalizeVoucherCode(code),
          type: 'electronic',
          status: 'paid',
          value: 1000,
          balance: 1000,
          expiresOn: batchDoc.expiresOn,
          batch: batchDoc.id,
          paidAt: now,
          note: 'UKÁZKOVÝ POUKAZ (seed)',
          history: [{ event: 'issued', at: now, note: 'Ukázkový poukaz ze seedu' }],
        },
      })
      stats.created++
    }
    const legacy = 'STARY-2026-0001'
    await payload.create({
      collection: 'vouchers',
      context: { voucherService: true },
      data: {
        code: displayVoucherCode(legacy),
        codeNormalized: normalizeVoucherCode(legacy),
        type: 'legacy',
        status: 'partially-redeemed',
        value: 2000,
        balance: 1200,
        expiresOn: `${new Date().getFullYear() + 1}-06-30T12:00:00.000Z`,
        paidAt: now,
        note: 'UKÁZKOVÝ POUKAZ (seed) – starý poukaz ze starého e-shopu',
        history: [{ event: 'issued', at: now, note: 'Ukázkový starý poukaz ze seedu' }],
      },
    })
    stats.created++
    log('Ukázkové poukazy v evidenci: 2 (označené UKÁZKOVÝ)')
  }
}
