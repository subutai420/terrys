import type { Payload } from 'payload'

import { withdrawalConfirmationEmail, withdrawalInternalEmail } from '@/email/templates/withdrawal'
import { OUTBOX_ADAPTER_NAME } from '@/email/adapter'
import type { FieldErrors } from '@/lib/orders/checkoutSchema'
import { checkFormToken } from '@/lib/orders/formToken'
import { parseWithdrawalInput } from '@/lib/orders/withdrawalSchema'

import { internalRecipient, shopInfo } from './emails'
import { verifyTurnstile } from './turnstile'

/**
 * Online withdrawal from the contract (stage 4).
 *
 * Records EVERY valid submission (also when the order cannot be found – the customer exercised
 * a right, staff check it by hand), links it to the order when number + e-mail match, sends the
 * customer a confirmation with the full content and date/time (durable medium) and an internal
 * notice to the shop. An e-mail failure is recorded on the withdrawal, never loses it.
 */

export const WITHDRAWAL_TOKEN_PURPOSE = 'withdrawal'

export type WithdrawalResult =
  | { ok: true; submittedAt: string; emailSent: boolean }
  | { ok: false; status: number; error: string; message: string; fieldErrors?: FieldErrors }

export async function submitWithdrawal(
  payload: Payload,
  raw: unknown,
  context: { now?: Date; ip?: string; skipBotChecks?: boolean } = {},
): Promise<WithdrawalResult> {
  const now = context.now ?? new Date()
  const parsed = parseWithdrawalInput(raw)
  if (!parsed.ok) {
    return {
      ok: false,
      status: 422,
      error: 'invalid-input',
      message: 'Zkontrolujte prosím zvýrazněné údaje.',
      fieldErrors: parsed.errors,
    }
  }
  const input = parsed.data
  const botMessage =
    'Odeslání se nezdařilo. Zkuste to prosím za chvilku znovu, nebo nám napište e-mail.'
  if (input.website?.trim()) return { ok: false, status: 400, error: 'bot', message: botMessage }
  if (!context.skipBotChecks) {
    if (
      checkFormToken(input.formToken, payload.secret, WITHDRAWAL_TOKEN_PURPOSE, now.getTime()) !==
      'ok'
    ) {
      return { ok: false, status: 400, error: 'bot', message: botMessage }
    }
    if (!(await verifyTurnstile(input.turnstileToken, context.ip ?? 'unknown'))) {
      return { ok: false, status: 400, error: 'bot', message: botMessage }
    }
  }

  const orderNumber = input.orderNumber.replace(/\s/g, '')
  const found = await payload.find({
    collection: 'orders',
    where: {
      and: [{ orderNumber: { equals: orderNumber } }, { contactEmail: { equals: input.email } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { orderNumber: true },
  })
  const order = found.docs[0] ?? null
  const submittedAt = now.toISOString()

  const record = await payload.create({
    collection: 'withdrawals',
    overrideAccess: true,
    data: {
      status: 'new',
      submittedAt,
      order: order?.id ?? null,
      name: input.name,
      email: input.email,
      phone: input.phone || null,
      orderNumberEntered: input.orderNumber,
      items: input.items || null,
      message: input.message || null,
      confirmationStatus: 'pending',
    },
  })

  const settings = await payload.findGlobal({ slug: 'settings', depth: 0 })
  const data = {
    name: input.name,
    email: input.email,
    phone: input.phone,
    orderNumber: input.orderNumber,
    items: input.items,
    message: input.message,
    submittedAt,
    matchedOrder: Boolean(order),
    shop: shopInfo(settings),
  }

  let confirmationStatus: 'sent' | 'outbox' | 'failed' = 'sent'
  let confirmationError: string | null = null
  try {
    const email = withdrawalConfirmationEmail(data)
    await payload.sendEmail({
      to: input.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    })
    if (payload.email?.name === OUTBOX_ADAPTER_NAME) confirmationStatus = 'outbox'
  } catch (error) {
    confirmationStatus = 'failed'
    confirmationError = (error instanceof Error ? error.message : String(error)).slice(0, 2000)
    payload.logger.error(`[withdrawal] confirmation failed: ${confirmationError}`)
  }

  const internal = internalRecipient(settings)
  if (internal) {
    try {
      const email = withdrawalInternalEmail(data)
      await payload.sendEmail({
        to: internal,
        subject: email.subject,
        html: email.html,
        text: email.text,
        replyTo: input.email,
      })
    } catch (error) {
      payload.logger.error(`[withdrawal] internal notice failed: ${String(error)}`)
    }
  }

  await payload.update({
    collection: 'withdrawals',
    id: record.id,
    overrideAccess: true,
    data: {
      confirmationStatus,
      confirmationError,
      confirmationSentAt: confirmationStatus === 'failed' ? null : new Date().toISOString(),
    },
  })

  return { ok: true, submittedAt, emailSent: confirmationStatus !== 'failed' }
}
