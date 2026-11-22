import { randomBytes, randomUUID } from 'crypto'
import type { Payload } from 'payload'

import type { PriceUnit } from '@/lib/catalog'
import { addDays } from '@/lib/delivery/calendar'
import { computeTotals, computeFinalTotals, lineEstimate, lineFinalPrice } from '@/lib/orders/money'
import { shopToday } from '@/fulfilment/queries'
import { nextOrderNumber } from '@/orders/orderNumber'
import type { Order, Product, ShippingMethod } from '@/payload-types'

/**
 * Stage 5 demo orders for development (`pnpm seed`, part `orders`): a handful of orders in
 * different states for today and tomorrow, so the Expedice / weighing screens are not empty.
 *
 * NEVER in production (the seed refuses NODE_ENV=production anyway, and this part checks again).
 * Idempotent: each demo order has a fixed `idempotencyKey` ("seed-demo-N"); existing ones are
 * left alone. Customers use the reserved domain example.test – e-mails can never reach anyone.
 * Remove them: Objednávky → filter e-mail "example.test" → delete (admin).
 */

type Log = (message: string) => void
type Stats = { created: number; existing: number }

type Demo = {
  key: string
  method: string
  day: 0 | 1
  first: string
  last: string
  note?: string
  voucherCode?: string
  lines: { product: number; qty: number }[]
  /** Actual weight factor per line (1.05 = 5 % more than the estimate) → weighed order. */
  weigh?: number[]
  toleranceNote?: string
  finalise?: boolean
  invoice?: string
  status?: Order['status']
}

export async function seedDemoOrders(payload: Payload, stats: Stats, log: Log) {
  if (process.env.NODE_ENV === 'production') {
    log('Ukázkové objednávky: přeskočeno (produkce)')
    return
  }
  const products = (
    await payload.find({
      collection: 'products',
      where: {
        and: [{ _status: { equals: 'published' } }, { availability: { equals: 'in-stock' } }],
      },
      limit: 40,
      depth: 0,
      overrideAccess: true,
    })
  ).docs.filter(
    (p) => p.priceUnit === 'piece' || (p.variants ?? []).some((v) => (v.weightGrams ?? 0) > 0),
  )
  const methods = (
    await payload.find({
      collection: 'shipping-methods',
      limit: 20,
      depth: 1,
      overrideAccess: true,
    })
  ).docs
  const bySlug = (slug: string) => methods.find((m) => m.slug === slug)
  const weightProducts = products.filter((p) => p.priceUnit !== 'piece')
  if (
    weightProducts.length < 2 ||
    !bySlug('rozvoz-terrys') ||
    !bySlug('kuryr-ppl') ||
    !bySlug('osobni-odber-italska')
  ) {
    log(
      'Ukázkové objednávky: přeskočeno (chybí produkty nebo způsoby dopravy – spusťte seed catalog/delivery)',
    )
    return
  }
  const [a, b, c] = [weightProducts[0], weightProducts[1], weightProducts[2] ?? weightProducts[0]]
  const today = shopToday()

  const demos: Demo[] = [
    {
      key: 'seed-demo-1',
      method: 'rozvoz-terrys',
      day: 0,
      first: 'Jana',
      last: 'Ukázková',
      note: 'Prosím nakrájet na plátky 2 cm, bez kosti.',
      lines: [
        { product: a.id, qty: 2 },
        { product: b.id, qty: 1 },
      ],
    },
    {
      key: 'seed-demo-2',
      method: 'kuryr-ppl',
      day: 0,
      first: 'Petr',
      last: 'Vzorový',
      lines: [{ product: c.id, qty: 1 }],
    },
    {
      key: 'seed-demo-3',
      method: 'osobni-odber-italska',
      day: 1,
      first: 'Eva',
      last: 'Testovací',
      voucherCode: 'DEMO-500',
      lines: [
        { product: a.id, qty: 1 },
        { product: c.id, qty: 3 },
      ],
    },
    {
      key: 'seed-demo-4',
      method: 'rozvoz-terrys',
      day: 0,
      first: 'Karel',
      last: 'Příkladný',
      lines: [
        { product: b.id, qty: 1 },
        { product: a.id, qty: 1 },
      ],
      weigh: [1.22, 0.97],
      toleranceNote: 'Celý kus nejde rozdělit',
    },
    {
      key: 'seed-demo-5',
      method: 'kuryr-ppl',
      day: 0,
      first: 'Lucie',
      last: 'Demo',
      lines: [{ product: a.id, qty: 2 }],
      weigh: [1.04],
      finalise: true,
      invoice: '2026900001',
    },
    {
      key: 'seed-demo-6',
      method: 'osobni-odber-italska',
      day: 0,
      first: 'Tomáš',
      last: 'Ukázka',
      lines: [{ product: c.id, qty: 1 }],
      weigh: [0.95],
      finalise: true,
      invoice: '2026900002',
      status: 'ready-for-pickup',
    },
  ]

  let created = 0
  for (const demo of demos) {
    const existing = await payload.find({
      collection: 'orders',
      where: { idempotencyKey: { equals: demo.key } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.docs[0]) {
      stats.existing++
      continue
    }
    const method = bySlug(demo.method) as ShippingMethod
    const date = addDays(today, demo.day)
    const lines = demo.lines.map(({ product: id, qty }, i) => {
      const product = products.find((p) => p.id === id) as Product
      const variant = (product.variants ?? []).find((v) => (v.weightGrams ?? 0) > 0)
      const priceUnit = product.priceUnit as PriceUnit
      const weightGrams = priceUnit === 'piece' ? null : (variant?.weightGrams ?? null)
      const estimatedPrice =
        lineEstimate({ unitPrice: product.price, priceUnit, weightGrams, quantity: qty }) ?? 0
      const factor = demo.weigh?.[i]
      const actual = factor && weightGrams ? Math.round(weightGrams * qty * factor) : null
      const resolution = factor ? (priceUnit === 'piece' ? 'piece' : 'weighed') : null
      const finalPrice = factor
        ? lineFinalPrice({
            unitPrice: product.price,
            priceUnit,
            quantity: qty,
            vatRate: product.vatRate ?? '12',
            actualWeightGrams: actual,
            resolution,
          })
        : null
      const over = factor ? Math.abs(factor - 1) > 0.15 : false
      return {
        product: product.id,
        productTitle: product.title,
        variantId: priceUnit === 'piece' ? null : (variant?.id ?? null),
        variantLabel: priceUnit === 'piece' ? null : (variant?.label ?? null),
        sku: product.sku ?? null,
        quantity: qty,
        unitPrice: product.price,
        priceUnit,
        vatRate: (product.vatRate ?? '12') as '12' | '21' | '0',
        estimatedWeightGrams: weightGrams,
        estimatedPrice,
        actualWeightGrams: actual,
        finalPrice,
        resolution: resolution as 'weighed' | 'piece' | null,
        overTolerance: over,
        toleranceNote: over ? (demo.toleranceNote ?? null) : null,
      }
    })
    const deliveryPrice = method.type === 'pickup' ? 0 : 229
    const est = computeTotals(
      lines.map((l) => ({
        unitPrice: l.unitPrice,
        priceUnit: l.priceUnit,
        weightGrams: l.estimatedWeightGrams,
        quantity: l.quantity,
        vatRate: l.vatRate,
      })),
      deliveryPrice,
    )
    const fin = demo.weigh
      ? computeFinalTotals(
          lines.map((l) => ({
            unitPrice: l.unitPrice,
            priceUnit: l.priceUnit,
            quantity: l.quantity,
            vatRate: l.vatRate,
            actualWeightGrams: l.actualWeightGrams,
            resolution: l.resolution,
          })),
          deliveryPrice,
        )
      : null
    const location = typeof method.location === 'object' ? method.location : null
    const reasons = lines
      .filter((l) => l.overTolerance)
      .map((l) => `${l.productTitle}: odchylka nad limit – ${l.toleranceNote ?? ''}`)
    const now = new Date().toISOString()
    const orderNumber = await nextOrderNumber(payload)
    await payload.create({
      collection: 'orders',
      overrideAccess: true,
      depth: 0,
      context: { disableRevalidate: true },
      data: {
        orderNumber,
        status: demo.status ?? (demo.weigh ? 'weighed' : 'received'),
        kind: 'goods',
        customerName: `${demo.first} ${demo.last}`,
        contactEmail: `${demo.key}@example.test`,
        contactPhone: '602 000 00' + demo.key.slice(-1),
        scheduledDate: date,
        shippingLabel: method.name,
        totalEstimate: est.totalEstimate,
        amountDue: fin?.amountDue ?? null,
        needsReview: reasons.length > 0,
        reviewReasons: reasons.join('\n') || null,
        lines,
        totals: {
          goodsEstimate: est.goodsEstimate,
          deliveryPrice,
          totalEstimate: est.totalEstimate,
          vat: est.vat,
          goodsFinal: fin?.goodsFinal ?? null,
          totalFinal: fin?.totalFinal ?? null,
          voucherTotal: fin ? 0 : null,
          amountDue: fin?.amountDue ?? null,
          vatFinal: fin?.vat ?? [],
        },
        voucherCode: demo.voucherCode ?? null,
        invoiceNumber: demo.invoice ?? null,
        customer: {
          firstName: demo.first,
          lastName: demo.last,
          email: `${demo.key}@example.test`,
          phone: '602 000 00' + demo.key.slice(-1),
        },
        shippingAddress:
          method.type === 'pickup'
            ? {}
            : method.type === 'courier'
              ? { street: 'Masarykova 12', city: 'Brno', postcode: '60200', checkStatus: 'skipped' }
              : {
                  street: 'Italská 30',
                  city: 'Praha 2',
                  postcode: '12000',
                  checkStatus: 'skipped',
                },
        delivery: {
          method: method.id,
          methodSlug: method.slug,
          methodName: method.name,
          methodType: method.type,
          price: deliveryPrice,
          date,
          postcode: method.type === 'courier' ? '60200' : '12000',
          pickupLocation: location
            ? {
                name: location.name,
                street: location.address?.street,
                city: location.address?.city,
                zip: location.address?.zip,
                openingHoursNote: location.openingHours?.note,
              }
            : {},
        },
        customerNote: demo.note ?? null,
        fulfilment: demo.weigh ? { weighedAt: now, finalisedAt: demo.finalise ? now : null } : {},
        statusHistory: demo.weigh
          ? [
              { status: 'weighed', at: now, note: 'Ukázková data' },
              ...(demo.status ? [{ status: demo.status, at: now, note: 'Ukázková data' }] : []),
            ]
          : [],
        internalNote: 'UKÁZKOVÁ OBJEDNÁVKA (pnpm seed) – smažte před spuštěním.',
        consents: {
          termsAcceptedAt: now,
          privacyNoticeAt: now,
          newsletter: false,
          heurekaOptOut: true,
        },
        eventId: randomUUID(),
        emails: { customerStatus: 'skipped', shopStatus: 'skipped' },
        accessToken: randomBytes(24).toString('base64url'),
        idempotencyKey: demo.key,
      },
    })
    created++
    stats.created++
  }
  log(`Ukázkové objednávky: ${created} nových (${demos.length - created} už existovalo)`)
}
