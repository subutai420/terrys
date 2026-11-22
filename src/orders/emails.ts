import type { Payload } from 'payload'

import { OUTBOX_ADAPTER_NAME } from '@/email/adapter'
import {
  type OrderEmailData,
  orderConfirmationEmail,
  orderInternalEmail,
} from '@/email/templates/order'
import type { RenderedEmail } from '@/email/templates/order'
import type { ShippingMethodType } from '@/lib/delivery/constants'
import type { PriceUnit } from '@/lib/catalog'
import type { EmailStatus } from '@/lib/orders/constants'
import { THANK_YOU_PATH, WITHDRAWAL_PATH } from '@/lib/orders/constants'
import { publicText } from '@/lib/openingHours'
import { absoluteUrl, getSiteUrl } from '@/lib/urls'
import type { Order, Setting } from '@/payload-types'

/**
 * Sending the order e-mails (stage 4) and recording the result on the order.
 *
 * The order is ALWAYS saved before any e-mail is attempted; a failing e-mail only marks
 * `emails.customerStatus = failed` (+ error text) so the staff see it in the admin and call the
 * customer. Nothing here throws.
 */

export type ShopInfo = OrderEmailData['shop']

export function shopInfo(settings: Setting): ShopInfo {
  const company = settings.company
  const companyLine = [
    publicText(company?.name),
    publicText(company?.ico) ? `IČO ${publicText(company?.ico)}` : null,
    publicText(company?.address)?.replace(/\s*\n\s*/g, ', '),
  ]
    .filter(Boolean)
    .join(', ')
  return {
    siteUrl: getSiteUrl(),
    contactEmail: publicText(settings.contact?.email),
    contactPhone: publicText(settings.contact?.phone),
    companyLine: companyLine || null,
    priceNotice: settings.priceNotice,
  }
}

/** Where the internal copy goes: settings → env ORDER_NOTIFICATION_EMAIL → contact e-mail. */
export function internalRecipient(settings: Setting): string | null {
  return (
    publicText(settings.orders?.notificationEmail) ||
    process.env.ORDER_NOTIFICATION_EMAIL ||
    publicText(settings.contact?.email) ||
    null
  )
}

export function orderEmailData(order: Order, settings: Setting): OrderEmailData {
  const delivery = order.delivery
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    customer: {
      firstName: order.customer.firstName,
      lastName: order.customer.lastName,
      email: order.customer.email,
      phone: order.customer.phone,
      companyName: order.customer.companyName,
      ico: order.customer.ico,
      dic: order.customer.dic,
    },
    lines: (order.lines ?? []).map((line) => ({
      title: line.productTitle,
      variantLabel: line.variantLabel,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      priceUnit: line.priceUnit as PriceUnit,
      vatRate: line.vatRate,
      estimatedWeightGrams: line.estimatedWeightGrams,
      estimatedPrice: line.estimatedPrice,
      sku: line.sku,
    })),
    totals: {
      goodsEstimate: order.totals.goodsEstimate,
      deliveryPrice: order.totals.deliveryPrice,
      totalEstimate: order.totals.totalEstimate,
      vat: (order.totals.vat ?? []).map((row) => ({
        rate: row.rate ?? 0,
        base: row.base ?? 0,
        vat: row.vat ?? 0,
        gross: row.gross ?? 0,
      })),
    },
    delivery:
      delivery?.methodName && delivery.methodType && delivery.date
        ? {
            methodName: delivery.methodName,
            methodType: delivery.methodType as ShippingMethodType,
            date: delivery.date,
            postcode: delivery.postcode ?? '',
            pickupLocation: delivery.pickupLocation?.name ? delivery.pickupLocation : null,
          }
        : null,
    address: order.shippingAddress?.street ? order.shippingAddress : null,
    addressCheck: order.shippingAddress
      ? { status: order.shippingAddress.checkStatus, note: order.shippingAddress.checkNote }
      : null,
    note: order.customerNote,
    voucherCode: order.voucherCode,
    consents: {
      newsletter: order.consents?.newsletter,
      heurekaOptOut: order.consents?.heurekaOptOut,
    },
    attribution: order.attribution
      ? Object.fromEntries(
          Object.entries(order.attribution).filter(
            ([key, value]) => key !== 'id' && typeof value === 'string' && value,
          ),
        )
      : null,
    shop: shopInfo(settings),
    withdrawalUrl: absoluteUrl(WITHDRAWAL_PATH),
  }
}

export type SendResult = { status: EmailStatus; error: string | null; at: string | null }

/** Stage 7: e-mail attachment (PDF voucher, QR image). `cid` = inline image referenced as `cid:…`. */
export type EmailAttachment = {
  filename: string
  content: Buffer
  contentType: string
  cid?: string
}

export async function send(
  payload: Payload,
  to: string | null,
  email: RenderedEmail,
  replyTo?: string | null,
  attachments?: EmailAttachment[],
): Promise<SendResult> {
  if (!to) return { status: 'skipped', error: null, at: null }
  try {
    await payload.sendEmail({
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(replyTo ? { replyTo } : {}),
      ...(attachments?.length ? { attachments } : {}),
    })
    const outbox = payload.email?.name === OUTBOX_ADAPTER_NAME
    return { status: outbox ? 'outbox' : 'sent', error: null, at: new Date().toISOString() }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    payload.logger.error(`[e-mail] sending failed: ${message}`)
    return { status: 'failed', error: message.slice(0, 2000), at: null }
  }
}

export async function sendOrderEmails(
  payload: Payload,
  order: Order,
  accessToken: string,
  /** Stage 7: voucher orders get their own customer e-mail (src/vouchers/emails.ts). */
  { customer: sendCustomer = true }: { customer?: boolean } = {},
): Promise<{ customer: SendResult; shop: SendResult }> {
  const settings = await payload.findGlobal({ slug: 'settings', depth: 0 })
  const data = orderEmailData(order, settings)
  const customerEmail = orderConfirmationEmail({
    ...data,
    orderUrl: absoluteUrl(`${THANK_YOU_PATH}/${accessToken}`),
  })
  const internalEmail = orderInternalEmail(data)

  const customer: SendResult = sendCustomer
    ? await send(
        payload,
        order.customer.email,
        customerEmail,
        process.env.EMAIL_REPLY_TO || data.shop.contactEmail,
      )
    : { status: 'pending', error: null, at: null }
  const shop = await send(payload, internalRecipient(settings), internalEmail, order.customer.email)

  try {
    await payload.update({
      collection: 'orders',
      id: order.id,
      data: {
        emails: {
          ...(sendCustomer
            ? {
                customerStatus: customer.status,
                customerError: customer.error,
                customerSentAt: customer.at,
              }
            : {}),
          shopStatus: shop.status,
          shopError: shop.error,
          shopSentAt: shop.at,
        },
      },
      overrideAccess: true,
      depth: 0,
      context: { disableRevalidate: true },
    })
  } catch (error) {
    payload.logger.error(
      `[orders] could not store e-mail status of ${order.orderNumber}: ${String(error)}`,
    )
  }
  return { customer, shop }
}
