import type { Payload } from 'payload'

import type { IntegrationStatus } from '@/collections/Orders'
import { itemId } from '@/lib/measurement/ids'
import { buildPurchaseEvent, type CapiRequestContext } from '@/lib/measurement/metaCapi'
import { getSiteUrl } from '@/lib/urls'
import type { Order } from '@/payload-types'

import { ecomailConfig, heurekaConfig, metaCapiConfig } from './config'

async function heurekaForVoucherOrders(payload: Payload): Promise<boolean> {
  try {
    const marketing = await payload.findGlobal({
      slug: 'marketing',
      depth: 0,
      overrideAccess: true,
    })
    return Boolean(marketing.vouchers?.heurekaForVoucherOrders)
  } catch {
    return false
  }
}
import { enqueue, processJobs, runAfterResponse, setOrderIntegration } from './jobs'
import type { EcomailJobPayload, HeurekaJobPayload, MetaJobPayload } from './senders'

/**
 * Stage 6: what a new order sends to marketing services (called by `placeOrder()` after the order
 * and its e-mails are done). Decisions per service, recorded on the order (`integrations.*`):
 *
 * | Service                     | Sent when                                        | Otherwise                 |
 * | --------------------------- | ------------------------------------------------ | ------------------------- |
 * | Meta CAPI `Purchase`        | marketing consent in the `terrys_consent` cookie | `skipped` (no consent)    |
 * | Heureka Ověřeno zákazníky   | customer did NOT tick the opt-out                | `skipped` (opt-out)       |
 * | Ecomail subscribe           | customer ticked the newsletter consent           | `skipped` (no consent)    |
 * | any of them, keys missing   |                                                  | `disabled`                |
 *
 * Heureka timing: Heureka's API docs say to report the order when it is created; Heureka itself
 * waits before sending its questionnaire (set in the Heureka admin).
 */

export type OrderRequestContext = CapiRequestContext & {
  marketingConsent: boolean
  /** `await` – process before returning (integration tests); default `after` the response. */
  mode?: 'after' | 'await' | 'none'
}

export async function enqueueOrderIntegrations(
  payload: Payload,
  order: Order,
  context: OrderRequestContext,
): Promise<number[]> {
  const ids: number[] = []
  const now = new Date()
  const record = (
    prefix: 'meta' | 'heureka' | 'ecomail',
    status: IntegrationStatus,
    note: string,
  ) => setOrderIntegration(payload, order.id, prefix, status, note, now)

  const lines = (order.lines ?? []).map((line) => ({
    productId:
      typeof line.product === 'object' && line.product
        ? line.product.id
        : typeof line.product === 'number'
          ? line.product
          : null,
    variantId: line.variantId ?? null,
    quantity: line.quantity,
    estimatedPrice: line.estimatedPrice,
  }))

  // Meta Conversions API
  if (!metaCapiConfig())
    await record('meta', 'disabled', 'Chybí META_PIXEL_ID / META_CAPI_ACCESS_TOKEN.')
  else if (!context.marketingConsent)
    await record('meta', 'skipped', 'Bez souhlasu s marketingovými cookies.')
  else {
    const event = buildPurchaseEvent(
      {
        orderNumber: order.orderNumber,
        eventId: order.eventId ?? order.orderNumber,
        createdAt: order.createdAt,
        goodsEstimate: order.totals.goodsEstimate,
        customer: order.customer,
        address: {
          city: order.shippingAddress?.city ?? null,
          postcode: order.shippingAddress?.postcode ?? order.delivery?.postcode ?? null,
        },
        lines,
        attribution: order.attribution ?? null,
      },
      context,
      getSiteUrl(),
    )
    ids.push(
      await enqueue(payload, {
        kind: 'meta-capi-purchase',
        order: order.id,
        payload: { event } satisfies MetaJobPayload,
      }),
    )
    await record('meta', 'pending', '')
  }

  // Heureka Ověřeno zákazníky
  if (order.consents?.heurekaOptOut)
    await record('heureka', 'skipped', 'Zákazník nesouhlasí s dotazníkem.')
  // Stage 7: voucher-only orders (no delivery experience yet) are skipped unless the setting
  // Marketing → Dárkové poukazy → "Posílat Heurece … i objednávky jen s poukazy" is on.
  else if (order.kind === 'voucher' && !(await heurekaForVoucherOrders(payload)))
    await record('heureka', 'skipped', 'Objednávka jen s dárkovými poukazy (nastavení).')
  else if (!heurekaConfig()) await record('heureka', 'disabled', 'Chybí HEUREKA_OVERENO_API_KEY.')
  else {
    const job: HeurekaJobPayload = {
      email: order.customer.email,
      orderId: order.orderNumber,
      productItemIds: [
        ...new Set(
          lines
            .filter((line) => line.productId !== null)
            .map((line) => itemId(line.productId as number, line.variantId)),
        ),
      ],
    }
    ids.push(await enqueue(payload, { kind: 'heureka-order', order: order.id, payload: job }))
    await record('heureka', 'pending', '')
  }

  // Ecomail (newsletter consent at checkout)
  if (!order.consents?.newsletter)
    await record('ecomail', 'skipped', 'Bez souhlasu s newsletterem.')
  else if (!ecomailConfig())
    await record('ecomail', 'disabled', 'Chybí ECOMAIL_API_KEY / ECOMAIL_LIST_ID.')
  else {
    const job: EcomailJobPayload = {
      email: order.customer.email,
      name: order.customer.firstName,
      surname: order.customer.lastName,
      source: 'objednavka',
      updateExisting: true,
      consentText:
        'Chci dostávat e-maily s novinkami, recepty a tipy od řezníků (odhlásit se lze kdykoli).',
      consentAt: order.consents?.newsletterAt ?? now.toISOString(),
    }
    ids.push(await enqueue(payload, { kind: 'ecomail-subscribe', order: order.id, payload: job }))
    await record('ecomail', 'pending', '')
  }

  if (ids.length > 0) {
    if (context.mode === 'await') await processJobs(payload, ids)
    else if (context.mode !== 'none')
      await runAfterResponse(payload, () => processJobs(payload, ids))
  }
  return ids
}
