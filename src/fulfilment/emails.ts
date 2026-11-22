import type { Payload, PayloadRequest } from 'payload'

import {
  cancelledEmail,
  type FulfilmentEmailData,
  finalPriceEmail,
  readyForPickupEmail,
  shippedEmail,
} from '@/email/templates/fulfilment'
import type { RenderedEmail } from '@/email/templates/order'
import type { PriceUnit } from '@/lib/catalog'
import type { ShippingMethodType } from '@/lib/delivery/constants'
import type { FulfilmentEmailKind, LineResolution } from '@/lib/orders/constants'
import { addressLine } from '@/lib/orders/format'
import { publicText, weeklyRows } from '@/lib/openingHours'
import { send, shopInfo } from '@/orders/emails'
import type { Order, Setting } from '@/payload-types'

/**
 * Stage 5 customer e-mails and their record on the order (`sentEmails`).
 *
 * E-MAIL-ONCE: automatic sends (`force: false`) skip a kind that was already sent or saved to the
 * outbox for this order; a failed attempt does not count, so the next trigger tries again. The
 * "Poslat znovu" button sends with `force: true`. Every attempt (also failures) is recorded.
 * Nothing here throws: a failing e-mail never blocks the status change that triggered it.
 */

const TEMPLATES: Record<FulfilmentEmailKind, (data: FulfilmentEmailData) => RenderedEmail> = {
  'final-price': finalPriceEmail,
  shipped: shippedEmail,
  'ready-for-pickup': readyForPickupEmail,
  cancelled: cancelledEmail,
}

export function alreadySent(order: Pick<Order, 'sentEmails'>, kind: FulfilmentEmailKind): boolean {
  return (order.sentEmails ?? []).some(
    (row) => row.kind === kind && (row.status === 'sent' || row.status === 'outbox'),
  )
}

async function pickupInfo(payload: Payload, order: Order, req?: PayloadRequest) {
  const snap = order.delivery?.pickupLocation
  if (order.delivery?.methodType !== 'pickup' || !snap?.name) return null
  let openingHours: string[] = []
  // Live opening hours of the place (the snapshot only has a note).
  const methodId =
    typeof order.delivery.method === 'object' ? order.delivery.method?.id : order.delivery.method
  if (methodId) {
    try {
      const method = await payload.findByID({
        collection: 'shipping-methods',
        id: methodId,
        depth: 1,
        req,
      })
      const location = typeof method.location === 'object' ? method.location : null
      openingHours = weeklyRows(location?.openingHours).map((row) => `${row.label}: ${row.text}`)
      const note = publicText(location?.openingHours?.note)
      if (note) openingHours.push(note)
    } catch {
      // method deleted – fall back to the snapshot note
    }
  }
  if (!openingHours.length && publicText(snap.openingHoursNote))
    openingHours = [snap.openingHoursNote!]
  return { name: snap.name, address: addressLine(snap), openingHours }
}

export async function fulfilmentEmailData(
  payload: Payload,
  order: Order,
  settings: Setting,
  req?: PayloadRequest,
): Promise<FulfilmentEmailData> {
  const shop = shopInfo(settings)
  return {
    orderNumber: order.orderNumber,
    firstName: order.customer.firstName,
    lines: (order.lines ?? []).map((line) => ({
      title: line.productTitle,
      variantLabel: line.variantLabel,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      priceUnit: line.priceUnit as PriceUnit,
      actualWeightGrams: line.actualWeightGrams,
      finalPrice: line.finalPrice,
      resolution: line.resolution as LineResolution | null,
      weighNote: line.weighNote,
    })),
    goodsFinal: order.totals.goodsFinal ?? 0,
    deliveryPrice: order.totals.deliveryPrice,
    totalFinal: order.totals.totalFinal ?? 0,
    vouchers: (order.voucherRedemptions ?? []).map((v) => ({ code: v.code, amount: v.amount })),
    amountDue: order.totals.amountDue ?? order.totals.totalFinal ?? 0,
    delivery:
      order.delivery?.methodName && order.delivery.methodType && order.delivery.date
        ? {
            methodName: order.delivery.methodName,
            methodType: order.delivery.methodType as ShippingMethodType,
            date: order.delivery.date,
          }
        : null,
    address: order.shippingAddress?.street ? addressLine(order.shippingAddress) : null,
    pickup: await pickupInfo(payload, order, req),
    tracking: order.trackingNumber
      ? { number: order.trackingNumber, url: order.trackingUrl ?? null }
      : null,
    cancellationReason: order.cancellation?.reason ?? null,
    shop: {
      siteUrl: shop.siteUrl,
      contactEmail: shop.contactEmail,
      contactPhone: shop.contactPhone,
      companyLine: shop.companyLine,
    },
  }
}

export type EmailOutcome =
  | { sent: true; status: string; error: string | null }
  | { sent: false; skipped: 'already-sent' | 'no-recipient' }

/**
 * Sends one fulfilment e-mail and appends the attempt to `order.sentEmails`.
 * Returns what happened; the order document is updated in place by the caller's next read.
 */
export async function sendFulfilmentEmail(
  payload: Payload,
  order: Order,
  kind: FulfilmentEmailKind,
  {
    force = false,
    userId,
    req,
  }: { force?: boolean; userId?: number | null; req?: PayloadRequest } = {},
): Promise<EmailOutcome> {
  if (!force && alreadySent(order, kind)) return { sent: false, skipped: 'already-sent' }
  const to = order.customer?.email
  if (!to) return { sent: false, skipped: 'no-recipient' }
  const settings = await payload.findGlobal({ slug: 'settings', depth: 0, req })
  const email = TEMPLATES[kind](await fulfilmentEmailData(payload, order, settings, req))
  const result = await send(
    payload,
    to,
    email,
    process.env.EMAIL_REPLY_TO || shopInfo(settings).contactEmail,
  )
  const row = {
    kind,
    status: result.status,
    at: result.at ?? new Date().toISOString(),
    by: userId ?? null,
    to,
    subject: email.subject.slice(0, 300),
    error: result.error,
  }
  try {
    const fresh = await payload.findByID({ collection: 'orders', id: order.id, depth: 0, req })
    await payload.update({
      collection: 'orders',
      id: order.id,
      overrideAccess: true,
      depth: 0,
      req,
      context: { disableRevalidate: true },
      data: {
        sentEmails: [...(fresh.sentEmails ?? []), row],
        // A failed customer e-mail puts the order on the "ke kontrole" list (dashboard).
        ...(result.status === 'failed'
          ? {
              needsReview: true,
              reviewReasons: [
                fresh.reviewReasons,
                `E-mail „${email.subject}“ se nepodařilo odeslat.`,
              ]
                .filter(Boolean)
                .join('\n'),
            }
          : {}),
      },
    })
  } catch (error) {
    payload.logger.error(
      `[fulfilment] could not record e-mail ${kind} of ${order.orderNumber}: ${String(error)}`,
    )
  }
  return { sent: true, status: result.status, error: result.error }
}
