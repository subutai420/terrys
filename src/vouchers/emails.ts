import type { Payload, PayloadRequest } from 'payload'

import {
  QR_CID,
  type VoucherEmailData,
  voucherIssuedEmail,
  voucherPaidEmail,
  voucherReminderEmail,
} from '@/email/templates/vouchers'
import { toShopDate } from '@/lib/delivery/calendar'
import { THANK_YOU_PATH, type VoucherEmailKind } from '@/lib/orders/constants'
import { absoluteUrl } from '@/lib/urls'
import { buildSpayd, parseBankAccount } from '@/lib/vouchers/spayd'
import { type EmailAttachment, send } from '@/orders/emails'
import type { Order, Voucher } from '@/payload-types'

import { renderVoucherPdf } from './pdf'
import { spaydQrPng } from './qr'
import { getVoucherSettings, type VoucherSettings } from './settings'

/**
 * Stage 7 voucher e-mails and their record on the order (`sentEmails`, same e-mail-once rule as
 * stage 5: an automatic send skips a kind already sent/outboxed; failures do not count).
 * Nothing here throws.
 */

export const VOUCHER_PDF_PATH = '/api/gift-vouchers/pdf'

export function paymentMessage(orderNumber: string): string {
  return `Darkovy poukaz Terrys ${orderNumber}`
}

/** SPAYD string of an order's bank payment (null when the order has no usable account). */
export function orderSpayd(order: Order): string | null {
  const account = order.payment?.account ? parseBankAccount(order.payment.account) : null
  if (!account?.ok || !order.payment?.amount) return null
  return buildSpayd({
    iban: account.iban,
    amount: order.payment.amount,
    currency: 'CZK',
    variableSymbol: order.payment.variableSymbol ?? order.orderNumber,
    message: paymentMessage(order.orderNumber),
    dueDate: order.payment.dueAt ? toShopDate(order.payment.dueAt) : undefined,
  })
}

export async function orderVouchers(
  payload: Payload,
  orderId: number,
  req?: PayloadRequest,
): Promise<Voucher[]> {
  const found = await payload.find({
    collection: 'vouchers',
    where: { order: { equals: orderId } },
    sort: 'createdAt',
    limit: 500,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return found.docs
}

export async function vouchersPdf(vouchers: Voucher[], settings: VoucherSettings): Promise<Buffer> {
  return renderVoucherPdf(
    vouchers.map((v) => ({
      code: v.code,
      value: v.value,
      expiresOn: toShopDate(v.expiresOn),
      recipientName: v.recipientName,
      message: v.message,
      shop: settings.pdfShop,
    })),
  )
}

export function voucherEmailData(
  order: Order,
  vouchers: Voucher[],
  settings: VoucherSettings,
  accessToken: string | null,
  hasQr: boolean,
): VoucherEmailData {
  const account = order.payment?.account ? parseBankAccount(order.payment.account) : null
  return {
    orderNumber: order.orderNumber,
    firstName: order.customer.firstName,
    vouchers: vouchers.map((v) => ({
      code: v.code,
      value: v.value,
      expiresOn: toShopDate(v.expiresOn),
    })),
    recipientName: order.voucherDetails?.recipientName ?? null,
    payment: {
      amount: order.payment?.amount ?? order.totals.totalEstimate,
      accountDisplay: account?.ok ? account.display : (order.payment?.account ?? ''),
      iban: account?.ok ? account.iban : '',
      variableSymbol: order.payment?.variableSymbol ?? order.orderNumber,
      message: paymentMessage(order.orderNumber),
      dueAt: order.payment?.dueAt ?? order.createdAt,
      hasQr,
    },
    orderUrl: accessToken ? absoluteUrl(`${THANK_YOU_PATH}/${accessToken}`) : null,
    pdfUrl: accessToken ? absoluteUrl(`${VOUCHER_PDF_PATH}/${accessToken}`) : null,
    shop: settings.emailShop,
  }
}

export type VoucherEmailOutcome =
  | { sent: true; status: string; error: string | null }
  | { sent: false; skipped: 'already-sent' | 'no-recipient' | 'no-vouchers' }

export function voucherEmailAlreadySent(order: Pick<Order, 'sentEmails'>, kind: VoucherEmailKind) {
  return (order.sentEmails ?? []).some(
    (row) => row.kind === kind && (row.status === 'sent' || row.status === 'outbox'),
  )
}

/** Builds, sends and records one voucher e-mail. */
export async function sendVoucherEmail(
  payload: Payload,
  order: Order,
  kind: VoucherEmailKind,
  {
    force = false,
    userId = null,
    req,
  }: { force?: boolean; userId?: number | null; req?: PayloadRequest } = {},
): Promise<VoucherEmailOutcome> {
  if (!force && voucherEmailAlreadySent(order, kind))
    return { sent: false, skipped: 'already-sent' }
  const to = order.customer?.email
  if (!to) return { sent: false, skipped: 'no-recipient' }
  const vouchers = await orderVouchers(payload, order.id, req)
  const electronic = vouchers.filter((v) => v.type === 'electronic')
  if (!electronic.length) return { sent: false, skipped: 'no-vouchers' }

  const settings = await getVoucherSettings(payload, req)
  // The access token has field read access false – read it with overrideAccess.
  const token = (
    await payload.findByID({
      collection: 'orders',
      id: order.id,
      depth: 0,
      overrideAccess: true,
      req,
      select: { accessToken: true },
    })
  ).accessToken as string | undefined

  const attachments: EmailAttachment[] = []
  let hasQr = false
  if (kind !== 'voucher-paid') {
    const spayd = orderSpayd(order)
    if (spayd) {
      try {
        attachments.push({
          filename: 'qr-platba.png',
          content: await spaydQrPng(spayd),
          contentType: 'image/png',
          cid: QR_CID,
        })
        hasQr = true
      } catch (error) {
        payload.logger.error(
          `[vouchers] QR not rendered for ${order.orderNumber}: ${String(error)}`,
        )
      }
    }
  }
  if (kind === 'voucher-issued') {
    try {
      attachments.push({
        filename: `darkovy-poukaz-terrys-${order.orderNumber}.pdf`,
        content: await vouchersPdf(electronic, settings),
        contentType: 'application/pdf',
      })
    } catch (error) {
      payload.logger.error(`[vouchers] PDF not rendered for ${order.orderNumber}: ${String(error)}`)
    }
  }

  const data = voucherEmailData(order, electronic, settings, token ?? null, hasQr)
  const email =
    kind === 'voucher-issued'
      ? voucherIssuedEmail(data)
      : kind === 'voucher-paid'
        ? voucherPaidEmail(data)
        : voucherReminderEmail(data)
  const result = await send(
    payload,
    to,
    email,
    process.env.EMAIL_REPLY_TO || settings.emailShop.contactEmail,
    attachments,
  )

  const row = {
    kind,
    status: result.status,
    at: result.at ?? new Date().toISOString(),
    by: userId,
    to,
    subject: email.subject.slice(0, 300),
    error: result.error,
  }
  try {
    const fresh = await payload.findByID({
      collection: 'orders',
      id: order.id,
      depth: 0,
      overrideAccess: true,
      req,
    })
    await payload.update({
      collection: 'orders',
      id: order.id,
      overrideAccess: true,
      depth: 0,
      req,
      context: { disableRevalidate: true },
      data: {
        sentEmails: [...(fresh.sentEmails ?? []), row],
        // The first e-mail is also the order confirmation of a voucher order.
        ...(kind === 'voucher-issued'
          ? {
              emails: {
                ...fresh.emails,
                customerStatus: result.status,
                customerError: result.error,
                customerSentAt: result.at,
              },
            }
          : {}),
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
      `[vouchers] could not record e-mail ${kind} of ${order.orderNumber}: ${String(error)}`,
    )
  }
  return { sent: true, status: result.status, error: result.error }
}
