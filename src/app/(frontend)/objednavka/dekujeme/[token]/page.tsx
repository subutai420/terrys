import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'

import { PurchaseEvent } from '@/components/storefront/checkout/PurchaseEvent'
import { formatPostcode } from '@/lib/delivery/constants'
import { orderDeliveryId } from '@/lib/feeds/delivery'
import { formatCzk, formatUnitPrice } from '@/lib/format'
import { buildUserData, purchase } from '@/lib/measurement/ecommerce'
import { buildGa4Item, categoryPath } from '@/lib/measurement/items'
import { publicText } from '@/lib/openingHours'
import {
  addressLine,
  dateMeaning,
  formatDateInSentence,
  formatDateLong,
  UNIT_LABEL,
  weightText,
} from '@/lib/orders/format'
import { WEIGHT_TOLERANCE } from '@/lib/productView'
import type { Order } from '@/payload-types'
import { categoryNodes } from '@/storefront/analytics'
import { getPayloadClient, getSettings } from '@/storefront/data'

/**
 * Thank-you page (stage 4): `/objednavka/dekujeme/<token>`. The token is a random 32-character
 * value stored on the order (never the order number, so nobody can browse other orders).
 * noindex, rendered per request, never cached.
 */

export const metadata: Metadata = {
  title: 'Děkujeme za objednávku',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

const percent = Math.round(WEIGHT_TOLERANCE * 100)

async function findOrder(token: string): Promise<Order | null> {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'orders',
    where: { accessToken: { equals: token } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return (result.docs[0] as Order | undefined) ?? null
}

/**
 * Stage 6: the GA4 `purchase` message of the order (`src/lib/measurement/ecommerce.ts`) and the
 * enhanced-conversions data (added in the browser only with marketing consent).
 */
async function purchaseMessage(order: Order) {
  const lines = order.lines ?? []
  const productIdOf = (line: (typeof lines)[number]): number | null => {
    const value = typeof line.product === 'object' && line.product ? line.product.id : line.product
    return typeof value === 'number' ? value : null
  }
  const productIds = lines.map(productIdOf).filter((id): id is number => id !== null)
  const payload = await getPayloadClient()
  const [products, nodes] = await Promise.all([
    productIds.length
      ? payload
          .find({
            collection: 'products',
            where: { id: { in: productIds } },
            depth: 0,
            limit: productIds.length,
            pagination: false,
            select: { categories: true, brand: true },
            overrideAccess: true,
          })
          .then((result) => result.docs)
      : Promise.resolve([]),
    categoryNodes(),
  ])
  const facts = new Map(products.map((doc) => [doc.id, doc]))
  const items = lines.map((line) => {
    const productId = productIdOf(line) ?? 0
    const doc = facts.get(productId)
    return buildGa4Item({
      productId,
      variantId: line.variantId ?? null,
      title: line.productTitle,
      variantLabel: line.variantLabel,
      categories: categoryPath(doc?.categories, nodes),
      brand: doc?.brand,
      // Haléře per piece, so Σ price × quantity equals the stored line estimates exactly.
      price: line.estimatedPrice / line.quantity,
      quantity: line.quantity,
      weightGrams: line.estimatedWeightGrams,
      priceUnit: line.priceUnit,
      unitPrice: line.unitPrice,
    })
  })
  const message = purchase({
    eventId: order.eventId ?? order.orderNumber,
    orderNumber: order.orderNumber,
    items,
    lines: lines.map((line) => ({
      estimatedPrice: line.estimatedPrice,
      quantity: line.quantity,
      vatRate: line.vatRate,
    })),
    goodsEstimate: order.totals.goodsEstimate,
    deliveryPrice: order.totals.deliveryPrice,
    totalEstimate: order.totals.totalEstimate,
    vat: order.totals.vat ?? [],
    shippingTier: order.delivery?.methodName ?? '',
    deliveryType: orderDeliveryId(order.delivery?.methodType),
  })
  const userData = buildUserData({
    email: order.customer.email,
    phone: order.customer.phone,
    firstName: order.customer.firstName,
    lastName: order.customer.lastName,
    street: order.shippingAddress?.street,
    city: order.shippingAddress?.city,
    postcode: order.shippingAddress?.postcode ?? order.delivery?.postcode,
  })
  return { message, userData }
}

export default async function ThankYouPage({ params }: { params: Promise<{ token: string }> }) {
  await connection()
  const { token } = await params
  const [order, settings] = await Promise.all([findOrder(token), getSettings()])
  if (!order) notFound()

  const delivery = order.delivery
  const isPickup = delivery?.methodType === 'pickup'
  const phone = publicText(settings.contact?.phone)
  const email = publicText(settings.contact?.email)
  const lines = order.lines ?? []

  const { message, userData } = await purchaseMessage(order)

  return (
    <div className="wrap max-w-3xl pb-16 pt-8">
      <PurchaseEvent message={message} userData={userData} token={token} />
      <div className="card text-center">
        <p
          aria-hidden="true"
          className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-ok text-3xl text-white"
        >
          ✓
        </p>
        <h1 className="text-[1.75rem] sm:text-[2.25rem]" data-testid="thank-you-heading">
          Děkujeme, objednávku č.&nbsp;<span data-testid="order-number">{order.orderNumber}</span>{' '}
          jsme přijali
        </h1>
        <p className="mt-3 text-muted">
          Potvrzení jsme poslali na <strong className="text-ink">{order.customer.email}</strong>.
          Pokud ho nenajdete, podívejte se do složky s hromadnou poštou.
        </p>
      </div>

      <section className="card mt-6" aria-labelledby="next-heading">
        <h2 id="next-heading" className="mb-3 text-xl">
          Co bude dál
        </h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Řezník maso naporcuje a každou položku zváží.</li>
          <li>
            {isPickup ? 'Objednávku si vyzvednete' : 'Objednávku vám dovezeme'}
            {delivery?.date ? (
              <>
                {' '}
                <strong>{formatDateInSentence(delivery.date)}</strong>
              </>
            ) : null}
            {isPickup && delivery?.pickupLocation?.name
              ? ` – ${[delivery.pickupLocation.name, addressLine(delivery.pickupLocation)].filter(Boolean).join(', ')}`
              : ''}
            .
          </li>
          <li>
            Zaplatíte až při převzetí, hotově nebo kartou – částku podle skutečné hmotnosti
            {order.totals.deliveryPrice > 0 ? ' včetně dopravy' : ''}. Obvykle se od odhadu liší do
            ±{percent} %.
          </li>
        </ol>
        {phone || email ? (
          <p className="mt-4 text-sm text-muted">
            Potřebujete něco změnit? Zavolejte nebo napište:{' '}
            {[phone, email].filter(Boolean).join(', ')}.
          </p>
        ) : null}
      </section>

      <section className="card mt-6" aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="mb-3 text-xl">
          Shrnutí
        </h2>
        <ul className="divide-y divide-line">
          {lines.map((line) => {
            const weight = weightText(line.estimatedWeightGrams, line.quantity)
            return (
              <li key={line.id ?? line.productTitle} className="flex justify-between gap-4 py-2.5">
                <span>
                  <span className="font-semibold">{line.productTitle}</span>
                  {line.variantLabel ? ` – ${line.variantLabel}` : ''}
                  <span className="block text-sm text-muted">
                    {line.quantity}× · {formatUnitPrice(line.unitPrice)} /{' '}
                    {UNIT_LABEL[line.priceUnit]}
                    {weight ? ` · odhad ${weight}` : ''}
                  </span>
                </span>
                <span className="whitespace-nowrap font-semibold">
                  {line.priceUnit === 'piece' ? '' : '≈ '}
                  {formatCzk(line.estimatedPrice)}
                </span>
              </li>
            )
          })}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-line pt-3">
          <div className="flex justify-between">
            <dt>{delivery?.methodName ?? 'Doprava'}</dt>
            <dd>
              {order.totals.deliveryPrice > 0 ? formatCzk(order.totals.deliveryPrice) : 'zdarma'}
            </dd>
          </div>
          <div className="flex justify-between text-lg font-bold">
            <dt>Odhad celkem vč. DPH</dt>
            <dd className="text-brand-red" data-testid="thank-you-total">
              ≈ {formatCzk(order.totals.totalEstimate)}
            </dd>
          </div>
        </dl>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold">{dateMeaning(delivery?.methodType as never)}</dt>
            <dd>
              {delivery?.date ? formatDateLong(delivery.date) : ''}
              <br />
              {isPickup
                ? [
                    delivery?.pickupLocation?.name,
                    delivery?.pickupLocation ? addressLine(delivery.pickupLocation) : '',
                  ]
                    .filter(Boolean)
                    .join(', ')
                : order.shippingAddress?.street
                  ? addressLine(order.shippingAddress)
                  : delivery?.postcode
                    ? `PSČ ${formatPostcode(delivery.postcode)}`
                    : ''}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Kontakt</dt>
            <dd>
              {order.customer.firstName} {order.customer.lastName}
              <br />
              {order.customer.phone}
            </dd>
          </div>
        </dl>
        {order.voucherCode ? (
          <p className="mt-4 text-sm">
            Dárkový poukaz <strong>{order.voucherCode}</strong> ověříme a jeho hodnotu odečteme při
            vážení.
          </p>
        ) : null}
      </section>

      <p className="mt-8 text-center">
        <Link href="/" className="btn btn-ghost">
          Zpět do obchodu
        </Link>
      </p>
    </div>
  )
}
