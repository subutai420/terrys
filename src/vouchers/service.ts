import type { Payload, PayloadRequest } from 'payload'

import { hasRole } from '@/access'
import { toShopDate, toShopDateTime } from '@/lib/delivery/calendar'
import { formatCzk } from '@/lib/format'
import { checkRedemption, effectiveVoucherStatus, statusForBalance } from '@/lib/vouchers/balance'
import { displayVoucherCode, normalizeVoucherCode } from '@/lib/vouchers/code'
import type { VoucherEvent, VoucherStatus } from '@/lib/vouchers/constants'
import type { Order, Voucher } from '@/payload-types'

import { STATUS_CHECKED } from '@/fulfilment/hooks'

import { orderVouchers, sendVoucherEmail, voucherEmailAlreadySent } from './emails'
import { issueVouchers, NoActiveBatchError, voucherSpecsForOrder } from './issue'
import { getVoucherSettings } from './settings'
import { lockOrder, lockVouchers, withTransaction } from './transaction'

/**
 * Stage 7 – voucher services used by the admin endpoints, the fulfilment service and the tests.
 * Same conventions as `src/fulfilment/service.ts`: role check first, Czech messages, results
 * `{ ok: true, … }` / `{ ok: false, status, message }`, writes with `overrideAccess: true` inside
 * one database transaction (`withTransaction`).
 */

export type Actor = { id: number; role?: string | null; email?: string | null }

export type VoucherResult<T = Record<string, never>> =
  | ({ ok: true; messages: string[] } & T)
  | { ok: false; status: number; message: string; fieldErrors?: Record<string, string> }

const fail = (status: number, message: string, fieldErrors?: Record<string, string>) => ({
  ok: false as const,
  status,
  message,
  ...(fieldErrors ? { fieldErrors } : {}),
})

const isEditor = (actor: Actor | null | undefined) => hasRole(actor, 'admin', 'staff')

const shopToday = (now = new Date()) => toShopDateTime(now).date

type Ctx = { req?: PayloadRequest; now?: Date }

function historyRow(event: VoucherEvent, actor: Actor | null, note: string | null, now: Date) {
  return { event, at: now.toISOString(), by: actor?.id ?? null, note }
}

async function updateVoucher(
  payload: Payload,
  req: PayloadRequest,
  id: number,
  data: Partial<Voucher>,
): Promise<Voucher> {
  return payload.update({
    collection: 'vouchers',
    id,
    data,
    depth: 0,
    overrideAccess: true,
    req,
    context: { voucherService: true },
  })
}

async function updateOrder(
  payload: Payload,
  req: PayloadRequest,
  id: number,
  data: Partial<Order>,
): Promise<Order> {
  return payload.update({
    collection: 'orders',
    id,
    data,
    depth: 0,
    overrideAccess: true,
    req,
    context: { [STATUS_CHECKED]: true, disableRevalidate: true },
  })
}

const orderStatusRow = (status: Order['status'], actor: Actor | null, note: string, now: Date) => ({
  status,
  at: now.toISOString(),
  by: actor?.id ?? null,
  note,
})

// ------------------------------------------------------------------------------ payment marking

/**
 * "Zaplaceno": the bank transfer of an electronic voucher order arrived. Marks the order paid
 * (→ Doručeno = vyřízeno: the vouchers were already e-mailed), all its vouchers paid (valid), and
 * sends the short confirmation e-mail ONCE. `paidOn` = day the money arrived (default today).
 */
export async function markVoucherOrderPaid(
  payload: Payload,
  actor: Actor,
  orderId: number,
  input: { paidOn?: string | null } = {},
  ctx: Ctx = {},
): Promise<VoucherResult<{ order: Order }>> {
  if (!isEditor(actor)) return fail(403, 'Platby páruje jen obsluha.')
  const now = ctx.now ?? new Date()
  const paidOn = input.paidOn?.trim() || shopToday(now)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || paidOn > shopToday(now)) {
    return fail(422, 'Zadejte den, kdy platba přišla (ne v budoucnosti).')
  }
  let outcome: VoucherResult<{ order: Order }>
  try {
    outcome = await withTransaction(payload, actor, ctx.req, async (req) => {
      await lockOrder(payload, req, orderId)
      const order = await payload.findByID({
        collection: 'orders',
        id: orderId,
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (order.kind !== 'voucher' || order.payment?.method !== 'bank-transfer') {
        return fail(409, 'Tato objednávka se neplatí převodem.')
      }
      if (order.payment?.status === 'paid') {
        return { ok: true as const, order, messages: ['Objednávka už je označená jako zaplacená.'] }
      }
      if (order.payment?.status === 'cancelled' || order.status === 'cancelled') {
        return fail(
          409,
          'Objednávka je zrušená. Pokud platba přesto přišla, kontaktujte zákazníka.',
        )
      }
      const vouchers = await orderVouchers(payload, order.id, req)
      for (const voucher of vouchers) {
        if (voucher.status !== 'issued') continue
        await updateVoucher(payload, req, voucher.id, {
          status: 'paid',
          paidAt: now.toISOString(),
          paidBy: actor.id,
          history: [
            ...(voucher.history ?? []),
            historyRow('paid', actor, `Platba převodem přišla ${paidOn}`, now),
          ],
        })
      }
      const saved = await updateOrder(payload, req, order.id, {
        status: 'delivered',
        statusHistory: [
          ...(order.statusHistory ?? []),
          orderStatusRow('delivered', actor, 'Poukaz zaplacen převodem – vyřízeno', now),
        ],
        payment: {
          ...order.payment,
          status: 'paid',
          paidOn: `${paidOn}T12:00:00.000Z`,
          markedPaidAt: now.toISOString(),
          markedPaidBy: actor.id,
        },
        needsReview: false,
        reviewReasons: null,
      })
      return { ok: true as const, order: saved, messages: [] as string[] }
    })
  } catch (error) {
    payload.logger.error(`[vouchers] mark paid failed: ${String(error)}`)
    return fail(500, 'Označení se nepodařilo uložit. Zkuste to prosím znovu.')
  }
  if (!outcome.ok || outcome.messages.length) return outcome

  // E-mail after the commit (never inside the transaction), once.
  const order = outcome.order
  if (!voucherEmailAlreadySent(order, 'voucher-paid')) {
    const sent = await sendVoucherEmail(payload, order, 'voucher-paid', {
      userId: actor.id,
      req: ctx.req,
    })
    outcome.messages.push(
      sent.sent
        ? sent.status === 'failed'
          ? `Potvrzení zákazníkovi se NEPODAŘILO odeslat: ${sent.error ?? ''}`
          : sent.status === 'outbox'
            ? 'Potvrzení zákazníkovi uloženo do složky (odesílání není nastavené).'
            : 'Zákazník dostal e-mail, že poukaz je platný.'
        : 'Potvrzení se neposílalo (není komu).',
    )
  }
  const fresh = await payload.findByID({
    collection: 'orders',
    id: order.id,
    depth: 0,
    overrideAccess: true,
    req: ctx.req,
  })
  return { ok: true, order: fresh, messages: outcome.messages }
}

/**
 * Undo "Zaplaceno" (wrong order clicked). Allowed while no voucher of the order was used
 * (redeemed) – afterwards the money is already spent and staff must sort it out by hand.
 */
export async function undoVoucherOrderPaid(
  payload: Payload,
  actor: Actor,
  orderId: number,
  input: { reason?: string | null } = {},
  ctx: Ctx = {},
): Promise<VoucherResult<{ order: Order }>> {
  if (!isEditor(actor)) return fail(403, 'Platby páruje jen obsluha.')
  const now = ctx.now ?? new Date()
  const reason = input.reason?.trim().slice(0, 300) || 'Omylem označeno jako zaplacené'
  try {
    return await withTransaction(payload, actor, ctx.req, async (req) => {
      await lockOrder(payload, req, orderId)
      const order = await payload.findByID({
        collection: 'orders',
        id: orderId,
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (order.payment?.status !== 'paid')
        return fail(409, 'Objednávka není označená jako zaplacená.')
      const vouchers = await orderVouchers(payload, order.id, req)
      await lockVouchers(
        payload,
        req,
        vouchers.map((v) => v.id),
      )
      if (vouchers.some((v) => (v.redemptions ?? []).length > 0)) {
        return fail(
          409,
          'Poukaz z této objednávky už byl použit při nákupu – zaplacení nejde vrátit. Řešte ručně.',
        )
      }
      for (const voucher of vouchers) {
        if (voucher.status !== 'paid') continue
        await updateVoucher(payload, req, voucher.id, {
          status: 'issued',
          paidAt: null,
          paidBy: null,
          history: [...(voucher.history ?? []), historyRow('payment-undone', actor, reason, now)],
        })
      }
      const saved = await updateOrder(payload, req, order.id, {
        status: 'received',
        statusHistory: [
          ...(order.statusHistory ?? []),
          orderStatusRow('received', actor, `Zaplacení vráceno: ${reason}`, now),
        ],
        payment: {
          ...order.payment,
          status: 'awaiting',
          paidOn: null,
          markedPaidAt: null,
          markedPaidBy: null,
        },
      })
      return {
        ok: true as const,
        order: saved,
        messages: ['Vráceno: objednávka opět čeká na platbu, poukazy nejsou platné.'],
      }
    })
  } catch (error) {
    payload.logger.error(`[vouchers] undo paid failed: ${String(error)}`)
    return fail(500, 'Nepodařilo se uložit. Zkuste to prosím znovu.')
  }
}

/** Cancels an unpaid electronic voucher order and its vouchers (staff or the overdue job). */
export async function cancelVoucherOrder(
  payload: Payload,
  actor: Actor | null,
  orderId: number,
  input: { reason: string },
  ctx: Ctx = {},
): Promise<VoucherResult<{ order: Order }>> {
  if (actor && !isEditor(actor)) return fail(403, 'Rušit může jen obsluha.')
  const reason = input.reason?.trim().slice(0, 500)
  if (!reason) return fail(422, 'Napište důvod zrušení.')
  const now = ctx.now ?? new Date()
  try {
    return await withTransaction(payload, actor, ctx.req, async (req) => {
      await lockOrder(payload, req, orderId)
      const order = await payload.findByID({
        collection: 'orders',
        id: orderId,
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (order.kind !== 'voucher') return fail(409, 'Toto není objednávka elektronického poukazu.')
      if (order.payment?.status === 'paid') {
        return fail(409, 'Objednávka je zaplacená – nejdřív vraťte „Zaplaceno“.')
      }
      if (order.status === 'cancelled') return fail(409, 'Objednávka už je zrušená.')
      const vouchers = await orderVouchers(payload, order.id, req)
      for (const voucher of vouchers) {
        if (voucher.status === 'cancelled') continue
        await updateVoucher(payload, req, voucher.id, {
          status: 'cancelled',
          balance: 0,
          history: [...(voucher.history ?? []), historyRow('cancelled', actor, reason, now)],
        })
      }
      const saved = await updateOrder(payload, req, order.id, {
        status: 'cancelled',
        cancellation: { reason, cancelledAt: now.toISOString(), cancelledBy: actor?.id ?? null },
        statusHistory: [
          ...(order.statusHistory ?? []),
          orderStatusRow('cancelled', actor, reason, now),
        ],
        payment: { ...order.payment, status: 'cancelled' },
      })
      return { ok: true as const, order: saved, messages: ['Objednávka i poukazy jsou zrušené.'] }
    })
  } catch (error) {
    payload.logger.error(`[vouchers] cancel failed: ${String(error)}`)
    return fail(500, 'Nepodařilo se uložit. Zkuste to prosím znovu.')
  }
}

/** Manual "Poslat připomínku" (also used by the overdue job). */
export async function sendPaymentReminder(
  payload: Payload,
  actor: Actor | null,
  orderId: number,
  ctx: Ctx = {},
): Promise<VoucherResult<{ order: Order }>> {
  if (actor && !isEditor(actor)) return fail(403, 'Připomínky posílá jen obsluha.')
  const order = await payload.findByID({
    collection: 'orders',
    id: orderId,
    depth: 0,
    overrideAccess: true,
    req: ctx.req,
  })
  if (order.payment?.status !== 'awaiting') return fail(409, 'Objednávka nečeká na platbu.')
  const sent = await sendVoucherEmail(payload, order, 'voucher-reminder', {
    force: true,
    userId: actor?.id ?? null,
    req: ctx.req,
  })
  const fresh = await payload.findByID({
    collection: 'orders',
    id: orderId,
    depth: 0,
    overrideAccess: true,
    req: ctx.req,
  })
  const saved = await payload.update({
    collection: 'orders',
    id: orderId,
    depth: 0,
    overrideAccess: true,
    req: ctx.req,
    context: { disableRevalidate: true },
    data: { payment: { ...fresh.payment, reminderSentAt: (ctx.now ?? new Date()).toISOString() } },
  })
  return {
    ok: true,
    order: saved,
    messages: [
      sent.sent && sent.status !== 'failed'
        ? 'Připomínka platby odeslána.'
        : 'Připomínku se NEPODAŘILO odeslat.',
    ],
  }
}

export const OVERDUE_REVIEW_REASON = 'Poukaz nezaplacen do splatnosti'

/**
 * Overdue handling (cron `GET /api/gift-vouchers/overdue`, and safe to run any time):
 *  - every unpaid order past its due time gets `needsReview` + reason (dashboard, payments view);
 *  - setting `flag-remind` (default): ONE reminder e-mail;
 *  - setting `flag-remind-cancel`: additionally cancelled `autoCancelAfterDays` after the due time.
 * The payments view also computes "overdue" live from `dueAt`, so nothing depends on the cron.
 */
export async function processOverdueVoucherOrders(
  payload: Payload,
  now = new Date(),
): Promise<{ flagged: number; reminded: number; cancelled: number }> {
  const settings = await getVoucherSettings(payload)
  const found = await payload.find({
    collection: 'orders',
    where: {
      and: [
        { kind: { equals: 'voucher' } },
        { 'payment.status': { equals: 'awaiting' } },
        { 'payment.dueAt': { less_than: now.toISOString() } },
        { status: { not_equals: 'cancelled' } },
      ],
    },
    depth: 0,
    limit: 500,
    overrideAccess: true,
  })
  const result = { flagged: 0, reminded: 0, cancelled: 0 }
  for (const order of found.docs) {
    const dueAt = new Date(order.payment?.dueAt ?? order.createdAt)
    if (
      settings.overdueAction === 'flag-remind-cancel' &&
      now.getTime() - dueAt.getTime() > settings.autoCancelAfterDays * 86_400_000
    ) {
      const cancelled = await cancelVoucherOrder(
        payload,
        null,
        order.id,
        { reason: `Nezaplaceno ${settings.autoCancelAfterDays} dní po splatnosti (automaticky).` },
        { now },
      )
      if (cancelled.ok) result.cancelled++
      continue
    }
    if (!order.needsReview || !(order.reviewReasons ?? '').includes(OVERDUE_REVIEW_REASON)) {
      await payload.update({
        collection: 'orders',
        id: order.id,
        depth: 0,
        overrideAccess: true,
        context: { disableRevalidate: true },
        data: {
          needsReview: true,
          reviewReasons: [order.reviewReasons, OVERDUE_REVIEW_REASON].filter(Boolean).join('\n'),
        },
      })
      result.flagged++
    }
    if (settings.overdueAction !== 'flag' && !order.payment?.reminderSentAt) {
      const reminded = await sendPaymentReminder(payload, null, order.id, { now })
      if (reminded.ok) result.reminded++
    }
  }
  return result
}

// ------------------------------------------------------------------------------ printed vouchers

/**
 * "Vystavit tištěné poukazy" on the order screen: one record per printed voucher piece that does
 * not have one yet, from the active batch. Printed vouchers are paid with the order on delivery:
 * they become valid when the order is delivered / picked up (`activatePrintedVouchers`).
 */
export async function issuePrintedVouchers(
  payload: Payload,
  actor: Actor,
  orderId: number,
  ctx: Ctx = {},
): Promise<VoucherResult<{ vouchers: Voucher[] }>> {
  if (!isEditor(actor)) return fail(403, 'Poukazy vystavuje jen obsluha.')
  try {
    return await withTransaction(payload, actor, ctx.req, async (req) => {
      await lockOrder(payload, req, orderId)
      const order = await payload.findByID({
        collection: 'orders',
        id: orderId,
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (order.status === 'cancelled') return fail(409, 'Objednávka je zrušená.')
      const existing = (await orderVouchers(payload, order.id, req)).filter(
        (v) => v.type === 'printed',
      )
      const wanted = voucherSpecsForOrder(order, 'printed')
      const missing = wanted.slice(existing.length)
      if (!missing.length) {
        return { ok: true as const, vouchers: existing, messages: ['Poukazy už jsou vystavené.'] }
      }
      const issued = await issueVouchers(payload, order, missing, {
        req,
        userId: actor.id,
        now: ctx.now,
      })
      return {
        ok: true as const,
        vouchers: [...existing, ...issued],
        messages: [
          `Vystaveno ${issued.length} ks. Kód napište na tištěný poukaz (nebo vytiskněte PDF).`,
        ],
      }
    })
  } catch (error) {
    if (error instanceof NoActiveBatchError) return fail(409, error.message)
    payload.logger.error(`[vouchers] printed issue failed: ${String(error)}`)
    return fail(500, 'Poukazy se nepodařilo vystavit.')
  }
}

/** Order delivered / picked up (paid on delivery) → its printed vouchers become valid. */
export async function activatePrintedVouchers(
  payload: Payload,
  actor: Actor | null,
  order: Order,
  req?: PayloadRequest,
  now = new Date(),
): Promise<number> {
  const vouchers = (await orderVouchers(payload, order.id, req)).filter(
    (v) => v.type === 'printed' && v.status === 'issued',
  )
  for (const voucher of vouchers) {
    await payload.update({
      collection: 'vouchers',
      id: voucher.id,
      depth: 0,
      overrideAccess: true,
      req,
      context: { voucherService: true },
      data: {
        status: 'paid',
        paidAt: now.toISOString(),
        paidBy: actor?.id ?? null,
        history: [
          ...(voucher.history ?? []),
          historyRow(
            'paid',
            actor,
            `Zaplaceno s objednávkou ${order.orderNumber} při převzetí`,
            now,
          ),
        ],
      },
    })
  }
  return vouchers.length
}

// ------------------------------------------------------------------------------ lookup / legacy

export type VoucherView = {
  id: number
  code: string
  type: Voucher['type']
  status: ReturnType<typeof effectiveVoucherStatus>
  value: number
  balance: number
  expiresOn: string
  orderNumber: string | null
  orderId: number | null
  recipientName: string | null
  paidAt: string | null
  redemptions: {
    orderNumber: string | null
    orderId: number | null
    amount: number
    at: string | null
  }[]
  history: { event: string; at: string | null; note: string | null }[]
}

export function voucherView(v: Voucher, now = new Date()): VoucherView {
  const expiresOn = toShopDate(v.expiresOn)
  return {
    id: v.id,
    code: v.code,
    type: v.type,
    status: effectiveVoucherStatus(
      { status: v.status as VoucherStatus, value: v.value, balance: v.balance ?? 0, expiresOn },
      shopToday(now),
    ),
    value: v.value,
    balance: v.balance ?? 0,
    expiresOn,
    orderNumber: v.orderNumber ?? null,
    orderId: typeof v.order === 'object' ? (v.order?.id ?? null) : (v.order ?? null),
    recipientName: v.recipientName ?? null,
    paidAt: v.paidAt ?? null,
    redemptions: (v.redemptions ?? []).map((r) => ({
      orderNumber: r.orderNumber ?? null,
      orderId:
        typeof r.redeemedIn === 'object' ? (r.redeemedIn?.id ?? null) : (r.redeemedIn ?? null),
      amount: r.amount ?? 0,
      at: r.at ?? null,
    })),
    history: (v.history ?? []).map((h) => ({
      event: h.event ?? '',
      at: h.at ?? null,
      note: h.note ?? null,
    })),
  }
}

export async function findVoucherByCode(
  payload: Payload,
  code: string,
  req?: PayloadRequest,
): Promise<Voucher | null> {
  const normalized = normalizeVoucherCode(code)
  if (normalized.length < 4) return null
  const found = await payload.find({
    collection: 'vouchers',
    where: { codeNormalized: { equals: normalized } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return found.docs[0] ?? null
}

/** Search by code for the admin (exact first, otherwise up to 10 partial matches). */
export async function searchVouchers(
  payload: Payload,
  actor: Actor,
  query: string,
): Promise<VoucherResult<{ vouchers: VoucherView[] }>> {
  if (!isEditor(actor)) return fail(403, 'Poukazy vidí jen obsluha.')
  const normalized = normalizeVoucherCode(query)
  if (normalized.length < 3) return { ok: true, vouchers: [], messages: [] }
  const exact = await findVoucherByCode(payload, normalized)
  if (exact) return { ok: true, vouchers: [voucherView(exact)], messages: [] }
  const found = await payload.find({
    collection: 'vouchers',
    where: {
      or: [{ codeNormalized: { like: normalized } }, { orderNumber: { equals: query.trim() } }],
    },
    limit: 10,
    depth: 0,
    overrideAccess: true,
  })
  return { ok: true, vouchers: found.docs.map((v) => voucherView(v)), messages: [] }
}

export type LegacyVoucherInput = {
  code: string
  value: number
  balance?: number | null
  expiresOn: string
  note?: string | null
}

function validateLegacy(input: LegacyVoucherInput): Record<string, string> {
  const errors: Record<string, string> = {}
  const normalized = normalizeVoucherCode(input.code)
  if (normalized.length < 4 || normalized.length > 40)
    errors.code = 'Opište kód poukazu (4–40 znaků).'
  if (!Number.isInteger(input.value) || input.value <= 0 || input.value > 100_000)
    errors.value = 'Hodnota v celých Kč.'
  const balance = input.balance ?? input.value
  if (!Number.isInteger(balance) || balance < 0 || balance > input.value)
    errors.balance = 'Zůstatek 0 až hodnota poukazu.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn ?? ''))
    errors.expiresOn = 'Datum platnosti RRRR-MM-DD.'
  return errors
}

/** "Starý poukaz": records a voucher from the OLD shop so it can be redeemed. */
export async function createLegacyVoucher(
  payload: Payload,
  actor: Actor,
  input: LegacyVoucherInput,
  ctx: Ctx = {},
): Promise<VoucherResult<{ voucher: VoucherView }>> {
  if (!isEditor(actor)) return fail(403, 'Poukazy zapisuje jen obsluha.')
  const errors = validateLegacy(input)
  if (Object.keys(errors).length) return fail(422, 'Opravte zvýrazněné údaje.', errors)
  if (await findVoucherByCode(payload, input.code, ctx.req)) {
    return fail(409, 'Poukaz s tímto kódem už v evidenci je.', { code: 'Už existuje.' })
  }
  const now = ctx.now ?? new Date()
  const balance = input.balance ?? input.value
  const normalized = normalizeVoucherCode(input.code)
  const voucher = await payload.create({
    collection: 'vouchers',
    overrideAccess: true,
    depth: 0,
    req: ctx.req,
    context: { voucherService: true },
    data: {
      code: displayVoucherCode(input.code),
      codeNormalized: normalized,
      type: 'legacy',
      status: statusForBalance(input.value, balance),
      value: input.value,
      balance,
      expiresOn: `${input.expiresOn}T12:00:00.000Z`,
      paidAt: now.toISOString(),
      paidBy: actor.id,
      note: input.note?.slice(0, 1000) || null,
      history: [historyRow('issued', actor, 'Starý poukaz ze starého e-shopu zapsán ručně.', now)],
    },
  })
  return { ok: true, voucher: voucherView(voucher, now), messages: ['Starý poukaz zapsán.'] }
}

/**
 * CSV import of old-shop vouchers: header `kod;hodnota;zbyva;platnost_do;poznamka`
 * (`,` or `;`, `zbyva` optional = full value, date `RRRR-MM-DD` or `D. M. RRRR`). Existing codes
 * are skipped (never overwritten).
 */
export async function importLegacyVouchers(
  payload: Payload,
  actor: Actor,
  csv: string,
  ctx: Ctx = {},
): Promise<VoucherResult<{ created: number; skipped: number; errors: string[] }>> {
  if (!isEditor(actor)) return fail(403, 'Poukazy zapisuje jen obsluha.')
  const rows = csv
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!rows.length) return fail(422, 'Soubor je prázdný.')
  const separator = rows[0].includes(';') ? ';' : ','
  const header = rows[0]
    .toLowerCase()
    .split(separator)
    .map((h) => h.trim())
  const col = (names: string[]) => header.findIndex((h) => names.includes(h))
  const iCode = col(['kod', 'kód', 'code'])
  const iValue = col(['hodnota', 'value'])
  const iBalance = col(['zbyva', 'zbývá', 'balance', 'zustatek', 'zůstatek'])
  const iExpires = col(['platnost_do', 'platnost', 'expires', 'expireson'])
  const iNote = col(['poznamka', 'poznámka', 'note'])
  if (iCode < 0 || iValue < 0 || iExpires < 0) {
    return fail(422, 'Chybí sloupce kod, hodnota, platnost_do (první řádek = názvy sloupců).')
  }
  let created = 0
  let skipped = 0
  const errors: string[] = []
  for (const [n, line] of rows.slice(1).entries()) {
    const cells = line.split(separator).map((c) => c.trim().replace(/^"|"$/g, ''))
    const rawDate = cells[iExpires] ?? ''
    const czDate = rawDate.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/)
    const expiresOn = czDate
      ? `${czDate[3]}-${czDate[2].padStart(2, '0')}-${czDate[1].padStart(2, '0')}`
      : rawDate
    const number = (value: string | undefined) =>
      value === undefined || value === ''
        ? null
        : Number(value.replace(/\s/g, '').replace(',', '.'))
    const input: LegacyVoucherInput = {
      code: cells[iCode] ?? '',
      value: number(cells[iValue]) ?? NaN,
      balance: iBalance >= 0 ? number(cells[iBalance]) : null,
      expiresOn,
      note: [iNote >= 0 ? cells[iNote] : null, 'import CSV'].filter(Boolean).join(' · '),
    }
    const result = await createLegacyVoucher(payload, actor, input, ctx)
    if (result.ok) created++
    else if (result.status === 409) skipped++
    else
      errors.push(
        `Řádek ${n + 2}: ${Object.values(result.fieldErrors ?? {}).join(' ') || result.message}`,
      )
  }
  return {
    ok: true,
    created,
    skipped,
    errors,
    messages: [`Zapsáno ${created}, přeskočeno (už existují) ${skipped}, chyb ${errors.length}.`],
  }
}

// ------------------------------------------------------------------------------ redemption

export type RedemptionRowInput = { code: string; amount: number; note?: string | null }

export type PreparedRedemption = {
  code: string
  amount: number
  note: string | null
  voucher: number | null
}

/**
 * Validates the voucher payment rows of an order against the voucher records and applies the
 * balance changes – MUST run inside the transaction of the billing save (`req`), after which the
 * order is saved with the returned rows. Rows recorded before stage 7 without a voucher record
 * (same code + amount as before) are kept as they are.
 */
export async function applyOrderRedemptions(
  payload: Payload,
  actor: Actor,
  order: Order,
  rows: RedemptionRowInput[],
  req: PayloadRequest,
  now = new Date(),
): Promise<
  { ok: true; rows: PreparedRedemption[] } | { ok: false; fieldErrors: Record<string, string> }
> {
  const fieldErrors: Record<string, string> = {}
  const previous = order.voucherRedemptions ?? []
  const prevByVoucher = new Map<number, number>()
  for (const row of previous) {
    const id = typeof row.voucher === 'object' ? row.voucher?.id : row.voucher
    if (id) prevByVoucher.set(id, (prevByVoucher.get(id) ?? 0) + (row.amount ?? 0))
  }

  // Resolve codes → vouchers, then lock every voucher involved (new and previous).
  const resolved = await Promise.all(rows.map((row) => findVoucherByCode(payload, row.code, req)))
  const ids = [...resolved.filter(Boolean).map((v) => (v as Voucher).id), ...prevByVoucher.keys()]
  await lockVouchers(payload, req, ids)
  const fresh = new Map<number, Voucher>()
  if (ids.length) {
    const found = await payload.find({
      collection: 'vouchers',
      where: { id: { in: [...new Set(ids)] } },
      limit: ids.length,
      depth: 0,
      overrideAccess: true,
      req,
    })
    for (const v of found.docs) fresh.set(v.id, v)
  }

  const orderDate = toShopDate(order.createdAt)
  const prepared: PreparedRedemption[] = []
  const newByVoucher = new Map<number, number>()
  rows.forEach((row, i) => {
    const found = resolved[i]
    if (!found) {
      const legacyRow = previous.find(
        (p) =>
          !p.voucher &&
          normalizeVoucherCode(p.code) === normalizeVoucherCode(row.code) &&
          p.amount === row.amount,
      )
      if (legacyRow) {
        prepared.push({ code: row.code, amount: row.amount, note: row.note ?? null, voucher: null })
        return
      }
      fieldErrors[`vouchers.${i}.code`] =
        'Poukaz s tímto kódem v evidenci není. Je-li ze starého e-shopu, zapište ho tlačítkem „Zapsat starý poukaz“.'
      return
    }
    const v = fresh.get(found.id) ?? found
    const amountBefore = prevByVoucher.get(v.id) ?? 0
    const check = checkRedemption(
      {
        status: v.status as VoucherStatus,
        value: v.value,
        balance: v.balance ?? 0,
        expiresOn: toShopDate(v.expiresOn),
      },
      row.amount,
      orderDate,
      amountBefore,
    )
    // An unchanged row stays valid even if the voucher meanwhile expired.
    const unchanged = amountBefore === row.amount
    if (!check.ok && !unchanged) {
      fieldErrors[`vouchers.${i}.code`] = check.message
      return
    }
    newByVoucher.set(v.id, row.amount)
    prepared.push({ code: v.code, amount: row.amount, note: row.note ?? null, voucher: v.id })
  })
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors }

  // Apply the differences to the balances (in the same transaction as the order save).
  const touched = new Set([...prevByVoucher.keys(), ...newByVoucher.keys()])
  for (const id of touched) {
    const before = prevByVoucher.get(id) ?? 0
    const after = newByVoucher.get(id) ?? 0
    if (before === after) continue
    const v = fresh.get(id)
    if (!v) continue
    const balance = (v.balance ?? 0) + before - after
    if (balance < 0 || balance > v.value) {
      // Cannot happen after the checks above – refuse rather than corrupt a balance.
      throw new Error(`Voucher ${v.code}: balance would be ${balance}`)
    }
    const redemptions = (v.redemptions ?? []).filter((r) => {
      const orderId = typeof r.redeemedIn === 'object' ? r.redeemedIn?.id : r.redeemedIn
      return orderId !== order.id
    })
    if (after > 0) {
      redemptions.push({
        redeemedIn: order.id,
        orderNumber: order.orderNumber,
        amount: after,
        at: now.toISOString(),
        by: actor.id,
      })
    }
    const keepStatus = v.status === 'cancelled' || v.status === 'issued'
    await updateVoucher(payload, req, id, {
      balance,
      status: keepStatus ? v.status : statusForBalance(v.value, balance),
      redemptions,
      history: [
        ...(v.history ?? []),
        historyRow(
          before === 0 ? 'redeemed' : 'redemption-changed',
          actor,
          `Objednávka ${order.orderNumber}: ${before ? `${formatCzk(before)} → ` : ''}${formatCzk(after)}, zbývá ${formatCzk(balance)}`,
          now,
        ),
      ],
    })
  }
  return { ok: true, rows: prepared }
}

/** Cancelling a goods order returns the redeemed amounts to its vouchers. */
export async function releaseOrderRedemptions(
  payload: Payload,
  actor: Actor,
  order: Order,
  req: PayloadRequest,
  now = new Date(),
): Promise<void> {
  if (!(order.voucherRedemptions ?? []).some((r) => r.voucher)) return
  await applyOrderRedemptions(payload, actor, order, [], req, now)
}
