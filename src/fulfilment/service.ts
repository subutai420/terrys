import type { Payload, PayloadRequest, Where } from 'payload'

import { hasRole, type Role } from '@/access'
import type { PriceUnit } from '@/lib/catalog'
import type { ShippingMethodType } from '@/lib/delivery/constants'
import {
  type FulfilmentEmailKind,
  LINE_RESOLUTIONS,
  type LineResolution,
  type OrderStatus,
} from '@/lib/orders/constants'
import {
  isWeighingComplete,
  lineOverTolerance,
  needsWeighing,
  orderGrams,
  type WeighLine,
  weighingNeedsReview,
} from '@/lib/orders/fulfilment'
import {
  computeFinalTotals,
  type FinalLineInput,
  type FinalTotals,
  lineFinalPrice,
  voucherAmountError,
  VoucherCapError,
} from '@/lib/orders/money'
import { checkTransition, type GuardRole } from '@/lib/orders/status'
import type { ShipmentInput } from '@/lib/shipping/balikobot'
import type { LabelPage } from '@/lib/shipping/pdf'
import { formatCzk } from '@/lib/format'
import type { Order } from '@/payload-types'
import { type CarrierService, getCarrierService } from '@/shipping/carrier'

import { normalizeVoucherCode } from '@/lib/vouchers/code'
import {
  activatePrintedVouchers,
  applyOrderRedemptions,
  cancelVoucherOrder,
  releaseOrderRedemptions,
} from '@/vouchers/service'
import { withTransaction } from '@/vouchers/transaction'

import { alreadySent, sendFulfilmentEmail } from './emails'
import { STATUS_CHECKED } from './hooks'
import { getFulfilmentSettings } from './settings'

/**
 * Stage 5 – every fulfilment action as a plain function: weighing, billing (vouchers, invoice
 * number, final price), status changes, shipments, e-mails. Used by the endpoints
 * (`endpoints.ts`, called from the admin screens) and directly by the integration tests.
 *
 * Each function checks WHO may do it (the role matrix in CLAUDE.md), validates the input,
 * recomputes money with `src/lib/orders/money.ts` (never trusts numbers from the browser) and
 * writes with `overrideAccess: true` – the order hooks still guard statuses and write the audit
 * trail. Results are `{ ok: true, order }` or `{ ok: false, status, message, fieldErrors? }` with
 * Czech messages for the screens.
 */

export type Actor = { id: number; role?: string | null; email?: string | null; collection?: string }

export type ServiceResult =
  | { ok: true; order: Order; messages: string[] }
  | {
      ok: false
      status: number
      message: string
      fieldErrors?: Record<string, string>
      details?: string[]
    }

type Options = { req?: PayloadRequest; carrier?: CarrierService; now?: Date }

const fail = (
  status: number,
  message: string,
  extra: { fieldErrors?: Record<string, string>; details?: string[] } = {},
): ServiceResult => ({ ok: false, status, message, ...extra })

const can = (actor: Actor | null | undefined, ...roles: Role[]) => hasRole(actor, ...roles)

export async function loadOrder(payload: Payload, id: number | string, req?: PayloadRequest) {
  try {
    return await payload.findByID({ collection: 'orders', id, depth: 0, req, overrideAccess: true })
  } catch {
    return null
  }
}

async function save(
  payload: Payload,
  actor: Actor,
  id: number,
  data: Partial<Order>,
  { req }: Options,
): Promise<Order> {
  return payload.update({
    collection: 'orders',
    id,
    data,
    depth: 0,
    overrideAccess: true,
    req,
    // Without a request (tests, scripts) the actor is passed as the user for the hooks/audit.
    ...(req ? {} : { user: { ...actor, collection: 'users' } as never }),
    context: { [STATUS_CHECKED]: true, disableRevalidate: true },
  })
}

function historyRow(status: OrderStatus, actor: Actor, note?: string | null, now = new Date()) {
  return { status, at: now.toISOString(), by: actor.id, note: note ?? null }
}

function asWeighLines(order: Order): WeighLine[] {
  return (order.lines ?? []).map((line) => ({
    ...line,
    priceUnit: line.priceUnit as PriceUnit,
    resolution: (line.resolution ?? null) as LineResolution | null,
  }))
}

function finalInput(line: WeighLine): FinalLineInput {
  return {
    unitPrice: line.unitPrice,
    priceUnit: line.priceUnit,
    quantity: line.quantity,
    vatRate: line.vatRate,
    actualWeightGrams: line.actualWeightGrams,
    resolution:
      !needsWeighing(line) && line.resolution !== 'unavailable' ? 'piece' : line.resolution,
  }
}

/** Final totals or null (weighing incomplete). Vouchers over the total → `capError`. */
function totalsFor(
  lines: WeighLine[],
  deliveryPrice: number,
  vouchers: number[],
  tolerance: number,
): { totals: FinalTotals | null; capError: boolean } {
  if (!isWeighingComplete(lines, tolerance)) return { totals: null, capError: false }
  try {
    return {
      totals: computeFinalTotals(lines.map(finalInput), deliveryPrice, vouchers),
      capError: false,
    }
  } catch (error) {
    if (error instanceof VoucherCapError) {
      return {
        totals: computeFinalTotals(lines.map(finalInput), deliveryPrice, []),
        capError: true,
      }
    }
    throw error
  }
}

function totalsData(order: Order, totals: FinalTotals | null) {
  return {
    totals: {
      ...order.totals,
      goodsFinal: totals?.goodsFinal ?? null,
      totalFinal: totals?.totalFinal ?? null,
      voucherTotal: totals ? totals.voucherTotal : null,
      amountDue: totals?.amountDue ?? null,
      vatFinal: totals?.vat ?? [],
    },
    amountDue: totals?.amountDue ?? null,
  }
}

/** Keeps review reasons that do not come from weighing (e.g. a failed e-mail). */
function otherReasons(order: Order): string[] {
  return (order.reviewReasons ?? '')
    .split('\n')
    .filter((line) => line.startsWith('E-mail') || line.startsWith('Balíkobot'))
}

const activeShipment = (order: Order) => Boolean(order.shipment?.packageId)

// ------------------------------------------------------------------------------------- weighing

export type WeighLineInput = {
  id: string
  actualWeightGrams?: number | null
  resolution?: LineResolution | null
  pieceWeights?: string | null
  weighNote?: string | null
  toleranceNote?: string | null
}

export type WeighInput = { lines: WeighLineInput[]; markWeighed?: boolean }

/**
 * Saves weights (partial progress allowed) and optionally marks the order "zváženo".
 * Butcher: only while the order is "Přijato". Staff/admin: also when "Zváženo" (a change then
 * cancels the confirmed billing – it has to be confirmed again).
 */
export async function weighOrder(
  payload: Payload,
  actor: Actor,
  id: number | string,
  input: WeighInput,
  options: Options = {},
): Promise<ServiceResult> {
  if (!can(actor, 'admin', 'staff', 'butcher')) return fail(403, 'Nemáte oprávnění vážit.')
  const order = await loadOrder(payload, id, options.req)
  if (!order) return fail(404, 'Objednávka neexistuje.')
  const isButcher = actor.role === 'butcher'
  if (order.status !== 'received' && !(order.status === 'weighed' && !isButcher)) {
    return fail(
      409,
      isButcher && order.status === 'weighed'
        ? 'Objednávka už je zvážená. Úpravu udělá obsluha.'
        : 'Objednávku v tomto stavu už nelze vážit.',
    )
  }
  if (!input || !Array.isArray(input.lines)) return fail(400, 'Chybí položky.')

  const { tolerancePercent } = await getFulfilmentSettings(payload, options.req)
  const byId = new Map(input.lines.map((line) => [line.id, line]))
  const fieldErrors: Record<string, string> = {}
  const now = options.now ?? new Date()

  const lines = (order.lines ?? []).map((line) => {
    const change = line.id ? byId.get(line.id) : undefined
    if (!change) {
      // Piece-priced items need no weighing: resolved automatically on the first save.
      if (!needsWeighing({ priceUnit: line.priceUnit as PriceUnit }) && !line.resolution) {
        const piece = { ...line, resolution: 'piece' as const }
        return {
          ...piece,
          finalPrice: lineFinalPrice(finalInput({ ...piece, priceUnit: 'piece' } as WeighLine)),
        }
      }
      return line
    }
    const next = { ...line }
    const key = line.id!
    let resolution = change.resolution ?? null
    if (resolution !== null && !(LINE_RESOLUTIONS as readonly string[]).includes(resolution)) {
      fieldErrors[key] = 'Neplatný výsledek vážení.'
      return line
    }
    const grams = change.actualWeightGrams ?? null
    if (grams !== null && (!Number.isInteger(grams) || grams <= 0 || grams > 200_000)) {
      fieldErrors[key] = 'Hmotnost zadejte v celých gramech (1–200 000).'
      return line
    }
    if (!needsWeighing({ priceUnit: line.priceUnit as PriceUnit })) {
      resolution = resolution === 'unavailable' ? 'unavailable' : 'piece'
    } else if (resolution === 'piece') {
      resolution = null
    } else if (resolution === null && grams !== null) {
      resolution = 'weighed'
    }
    next.resolution = resolution
    next.actualWeightGrams = resolution === 'weighed' || resolution === 'substituted' ? grams : null
    next.pieceWeights = change.pieceWeights?.trim().slice(0, 300) || null
    next.weighNote = change.weighNote?.trim().slice(0, 500) || null
    next.toleranceNote = change.toleranceNote?.trim().slice(0, 500) || null
    const weighLine = { ...next, priceUnit: next.priceUnit as PriceUnit } as WeighLine
    next.overTolerance = lineOverTolerance(weighLine, tolerancePercent)
    if (!next.overTolerance) next.toleranceNote = null
    next.finalPrice = lineFinalPrice(finalInput(weighLine))
    return next
  })
  if (Object.keys(fieldErrors).length) {
    return fail(422, 'Některé položky nejdou uložit.', { fieldErrors })
  }

  const weighLines = lines.map((line) => ({
    ...line,
    priceUnit: line.priceUnit as PriceUnit,
  })) as WeighLine[]
  const vouchers = (order.voucherRedemptions ?? []).map((v) => v.amount)
  const { totals, capError } = totalsFor(
    weighLines,
    order.totals.deliveryPrice,
    vouchers,
    tolerancePercent,
  )
  const reasons = [
    ...weighingNeedsReview(weighLines, tolerancePercent),
    ...(capError ? ['Poukazy převyšují novou cenu – upravte úhradu poukazem.'] : []),
    ...otherReasons(order),
  ]

  const data: Partial<Order> = {
    lines,
    ...totalsData(order, capError ? null : totals),
    needsReview: reasons.length > 0,
    reviewReasons: reasons.join('\n') || null,
  }
  const messages: string[] = []

  // Any change after the billing was confirmed cancels the confirmation.
  const changed = JSON.stringify(order.lines) !== JSON.stringify(lines)
  if (changed && order.fulfilment?.finalisedAt) {
    data.fulfilment = { ...order.fulfilment, finalisedAt: null, finalisedBy: null }
    messages.push('Vážení se změnilo – vyúčtování je potřeba znovu potvrdit.')
  }
  if (order.status === 'weighed' && !isWeighingComplete(weighLines, tolerancePercent)) {
    return fail(422, 'Zvážená objednávka musí mít všechny položky vyřešené.')
  }

  if (input.markWeighed && order.status === 'received') {
    const check = checkTransition({
      from: 'received',
      to: 'weighed',
      role: actor.role as GuardRole,
      methodType: order.delivery?.methodType as ShippingMethodType,
      weighingComplete: isWeighingComplete(weighLines, tolerancePercent),
      finalised: false,
      hasTracking: false,
    })
    if (!check.ok) return fail(422, check.reason)
    data.status = 'weighed'
    data.fulfilment = {
      ...(data.fulfilment ?? order.fulfilment),
      weighedAt: now.toISOString(),
      weighedBy: actor.id,
    }
    data.statusHistory = [...(order.statusHistory ?? []), historyRow('weighed', actor, null, now)]
  }

  const saved = await save(payload, actor, order.id, data, options)
  return { ok: true, order: saved, messages }
}

// ------------------------------------------------------------------------------------- billing

export type BillingInput = {
  vouchers?: { code: string; amount: number; note?: string | null }[]
  invoiceNumber?: string | null
  internalNote?: string | null
  /** Confirm the final price (and send the e-mail with it the first time). */
  finalise?: boolean
}

/** Another order with the same invoice number (trimmed, case-insensitive), or null. */
export async function findInvoiceDuplicate(
  payload: Payload,
  invoiceNumber: string,
  excludeId?: number | string | null,
  req?: PayloadRequest,
): Promise<Pick<Order, 'id' | 'orderNumber'> | null> {
  const value = invoiceNumber.trim()
  if (!value) return null
  const where: Where = { invoiceNumber: { like: value } }
  const found = await payload.find({
    collection: 'orders',
    where,
    depth: 0,
    limit: 20,
    overrideAccess: true,
    req,
    select: { orderNumber: true, invoiceNumber: true },
  })
  const match = found.docs.find(
    (doc) =>
      String(doc.id) !== String(excludeId ?? '') &&
      (doc.invoiceNumber ?? '').trim().toLowerCase() === value.toLowerCase(),
  )
  return match ? { id: match.id, orderNumber: match.orderNumber } : null
}

export async function saveBilling(
  payload: Payload,
  actor: Actor,
  id: number | string,
  input: BillingInput,
  options: Options = {},
): Promise<ServiceResult> {
  if (!can(actor, 'admin', 'staff')) return fail(403, 'Vyúčtování upravuje jen obsluha.')
  const order = await loadOrder(payload, id, options.req)
  if (!order) return fail(404, 'Objednávka neexistuje.')
  if (['delivered', 'picked-up', 'cancelled'].includes(order.status)) {
    return fail(409, 'Objednávka je uzavřená – vyúčtování už nelze měnit.')
  }
  const now = options.now ?? new Date()
  const fieldErrors: Record<string, string> = {}

  // Vouchers (means of payment, never a discount).
  const vouchersIn =
    input.vouchers ??
    (order.voucherRedemptions ?? []).map((v) => ({ code: v.code, amount: v.amount, note: v.note }))
  const previous = new Map(
    (order.voucherRedemptions ?? []).map((v) => [`${v.code}|${v.amount}`, v]),
  )
  const vouchers = vouchersIn.map((v, i) => {
    const code = String(v.code ?? '')
      .trim()
      .slice(0, 100)
    if (!code) fieldErrors[`vouchers.${i}.code`] = 'Zadejte kód poukazu.'
    const amountError = voucherAmountError(v.amount)
    if (amountError) fieldErrors[`vouchers.${i}.amount`] = amountError
    const kept = previous.get(`${code}|${v.amount}`)
    return {
      code,
      amount: v.amount,
      note: v.note?.trim().slice(0, 300) || null,
      voucher: (typeof kept?.voucher === 'object' ? kept?.voucher?.id : kept?.voucher) ?? null,
      recordedBy: kept?.recordedBy ?? actor.id,
      recordedAt: kept?.recordedAt ?? now.toISOString(),
    }
  })
  const codes = vouchers.map((v) => normalizeVoucherCode(v.code))
  codes.forEach((code, i) => {
    if (code && codes.indexOf(code) !== i)
      fieldErrors[`vouchers.${i}.code`] = 'Tento poukaz je zapsaný dvakrát.'
  })

  // Invoice number (typed in from the accounting software).
  const invoiceNumber =
    input.invoiceNumber === undefined
      ? (order.invoiceNumber ?? null)
      : input.invoiceNumber?.trim().slice(0, 50) || null
  if (invoiceNumber) {
    const duplicate = await findInvoiceDuplicate(payload, invoiceNumber, order.id, options.req)
    if (duplicate) {
      fieldErrors.invoiceNumber = `Číslo faktury ${invoiceNumber} už má objednávka č. ${duplicate.orderNumber}.`
    }
  }
  if (Object.keys(fieldErrors).length)
    return fail(422, 'Opravte zvýrazněné údaje.', { fieldErrors })

  const { tolerancePercent } = await getFulfilmentSettings(payload, options.req)
  const lines = asWeighLines(order)
  const weighed = isWeighingComplete(lines, tolerancePercent)
  let totals: FinalTotals | null = null
  if (weighed) {
    try {
      totals = computeFinalTotals(
        lines.map(finalInput),
        order.totals.deliveryPrice,
        vouchers.map((v) => v.amount),
      )
    } catch (error) {
      if (error instanceof VoucherCapError) {
        return fail(422, 'Poukazy nesmí převýšit cenu objednávky.', {
          fieldErrors: {
            vouchers: `Poukazy celkem ${formatCzk(error.voucherTotal)} jsou víc než cena objednávky ${formatCzk(error.totalFinal)}.`,
          },
        })
      }
      throw error
    }
  }

  // A created courier parcel carries the amount and the invoice number (COD + variable symbol).
  if (activeShipment(order)) {
    if ((totals?.amountDue ?? null) !== (order.totals.amountDue ?? null)) {
      return fail(
        409,
        `Zásilka už je vytvořená s dobírkou ${formatCzk(order.totals.amountDue ?? 0)}. Pro změnu částky ji nejdřív zrušte.`,
      )
    }
    if (invoiceNumber !== (order.invoiceNumber ?? null)) {
      return fail(
        409,
        'Zásilka už je vytvořená s tímto číslem faktury (variabilní symbol). Pro změnu ji nejdřív zrušte.',
      )
    }
  }

  const data: Partial<Order> = {
    voucherRedemptions: vouchers,
    invoiceNumber,
    internalNote:
      input.internalNote === undefined
        ? order.internalNote
        : input.internalNote?.slice(0, 5000) || null,
    ...totalsData(order, totals),
  }
  const messages: string[] = []
  const amountsChanged =
    (totals?.amountDue ?? null) !== (order.totals.amountDue ?? null) ||
    (totals?.totalFinal ?? null) !== (order.totals.totalFinal ?? null)
  let finaliseNow = false
  if (input.finalise) {
    if (!weighed || order.status === 'received')
      return fail(422, 'Nejdřív musí být objednávka zvážená.')
    data.fulfilment = { ...order.fulfilment, finalisedAt: now.toISOString(), finalisedBy: actor.id }
    finaliseNow = true
  } else if (order.fulfilment?.finalisedAt && amountsChanged) {
    data.fulfilment = { ...order.fulfilment, finalisedAt: null, finalisedBy: null }
    messages.push('Částka se změnila – vyúčtování je potřeba znovu potvrdit.')
  }

  // Stage 7: every voucher row must match a voucher record (paid, valid, enough balance); the
  // balances change in the SAME transaction as the order (row locks: two parallel billings can
  // never overspend one voucher).
  const vouchersChanged =
    JSON.stringify(vouchers.map((v) => [v.code, v.amount])) !==
    JSON.stringify((order.voucherRedemptions ?? []).map((v) => [v.code, v.amount]))
  let outcome: { saved: Order } | { fieldErrors: Record<string, string> }
  try {
    outcome = await withTransaction(payload, actor, options.req, async (req) => {
      if (vouchersChanged) {
        const applied = await applyOrderRedemptions(payload, actor, order, vouchers, req, now)
        if (!applied.ok) return { fieldErrors: applied.fieldErrors }
        data.voucherRedemptions = applied.rows.map((row, i) => ({
          ...vouchers[i],
          code: row.code,
          voucher: row.voucher,
        }))
      }
      return { saved: await save(payload, actor, order.id, data, { ...options, req }) }
    })
  } catch (error) {
    payload.logger.error(`[fulfilment] billing save failed: ${String(error)}`)
    return fail(500, 'Vyúčtování se nepodařilo uložit. Zkuste to prosím znovu.')
  }
  if ('fieldErrors' in outcome) {
    return fail(422, 'Poukaz nejde uplatnit – viz zvýrazněný řádek.', {
      fieldErrors: outcome.fieldErrors,
    })
  }
  let saved = outcome.saved
  if (finaliseNow) {
    if (alreadySent(saved, 'final-price')) {
      messages.push(
        amountsChanged
          ? 'E-mail s cenou už zákazník dostal dříve – částka se změnila, pošlete ho znovu.'
          : 'E-mail s výslednou cenou už byl odeslán dříve.',
      )
    } else {
      const outcome = await sendFulfilmentEmail(payload, saved, 'final-price', {
        userId: actor.id,
        req: options.req,
      })
      messages.push(emailMessage(outcome))
      saved = (await loadOrder(payload, saved.id, options.req)) ?? saved
    }
  }
  return { ok: true, order: saved, messages }
}

function emailMessage(outcome: Awaited<ReturnType<typeof sendFulfilmentEmail>>): string {
  if (!outcome.sent) {
    return outcome.skipped === 'already-sent'
      ? 'E-mail už byl odeslán dříve.'
      : 'Zákazník nemá e-mail – nic se neodeslalo.'
  }
  if (outcome.status === 'failed') return `E-mail se NEPODAŘILO odeslat: ${outcome.error ?? ''}`
  if (outcome.status === 'outbox')
    return 'E-mail zákazníkovi uložen do složky (odesílání není nastavené).'
  return 'E-mail zákazníkovi odeslán.'
}

// ------------------------------------------------------------------------------------- status

const STATUS_EMAIL: Partial<Record<OrderStatus, FulfilmentEmailKind>> = {
  shipped: 'shipped',
  'ready-for-pickup': 'ready-for-pickup',
  cancelled: 'cancelled',
}

export async function changeStatus(
  payload: Payload,
  actor: Actor,
  id: number | string,
  input: { to: OrderStatus; reason?: string | null; note?: string | null },
  options: Options = {},
): Promise<ServiceResult> {
  const order = await loadOrder(payload, id, options.req)
  if (!order) return fail(404, 'Objednávka neexistuje.')
  if (input.to === 'weighed') {
    return weighOrder(payload, actor, id, { lines: [], markWeighed: true }, options)
  }
  // Stage 7: an electronic voucher order is cancelled together with its vouchers.
  if (order.kind === 'voucher' && input.to === 'cancelled') {
    if (!can(actor, 'admin', 'staff')) return fail(403, 'Rušit může jen obsluha.')
    const result = await cancelVoucherOrder(
      payload,
      actor,
      order.id,
      { reason: input.reason ?? '' },
      { req: options.req, now: options.now },
    )
    return result.ok ? { ok: true, order: result.order, messages: result.messages } : result
  }
  const { tolerancePercent } = await getFulfilmentSettings(payload, options.req)
  const check = checkTransition({
    from: order.status as OrderStatus,
    to: input.to,
    role: actor.role as GuardRole,
    methodType: order.delivery?.methodType as ShippingMethodType,
    weighingComplete: isWeighingComplete(asWeighLines(order), tolerancePercent),
    finalised: Boolean(order.fulfilment?.finalisedAt),
    hasTracking: Boolean(order.trackingNumber),
    reason: input.reason,
  })
  if (!check.ok) return fail(422, check.reason)
  if (input.to === 'cancelled' && activeShipment(order) && !order.shipment?.handedOverAt) {
    return fail(
      409,
      'Objednávka má vytvořenou zásilku – nejdřív ji zrušte (tlačítko „Zrušit zásilku“).',
    )
  }
  const now = options.now ?? new Date()
  // A courier parcel must be handed over to the carrier (Balíkobot ORDER) before it can leave:
  // without it the carrier never gets the data. "→ Odesláno" therefore hands it over first.
  let handover: Partial<Order> = {}
  if (
    input.to === 'shipped' &&
    order.delivery?.methodType === 'courier' &&
    activeShipment(order) &&
    !order.shipment?.handedOverAt
  ) {
    const carrier =
      order.shipment?.provider === 'simulation'
        ? (await import('@/shipping/carrier')).simulationCarrier()
        : carrierFor(options)
    if (typeof carrier === 'string') return fail(503, carrier)
    const closed = await carrier.closeBatch(order.shipment?.carrierCode ?? '', [
      order.shipment!.packageId!,
    ])
    if (!closed.ok)
      return fail(422, 'Zásilku se nepodařilo předat dopravci.', { details: closed.errors })
    handover = {
      shipment: { ...order.shipment, handedOverAt: now.toISOString(), batchId: closed.batchId },
    }
  }
  const data: Partial<Order> = {
    ...handover,
    status: input.to,
    statusHistory: [
      ...(order.statusHistory ?? []),
      historyRow(input.to, actor, input.reason ?? input.note, now),
    ],
  }
  if (input.to === 'received') {
    data.fulfilment = { ...order.fulfilment, finalisedAt: null, finalisedBy: null }
  }
  if (input.to === 'cancelled') {
    data.cancellation = {
      reason: input.reason!.trim().slice(0, 2000),
      cancelledAt: now.toISOString(),
      cancelledBy: actor.id,
    }
  }
  // Stage 7: cancelling returns redeemed voucher amounts (same transaction as the status).
  let saved = await withTransaction(payload, actor, options.req, async (req) => {
    if (input.to === 'cancelled') await releaseOrderRedemptions(payload, actor, order, req, now)
    return save(payload, actor, order.id, data, { ...options, req })
  })
  const messages: string[] = []
  // Stage 7: printed vouchers are paid with the order on delivery → valid from now on.
  if (input.to === 'delivered' || input.to === 'picked-up') {
    const activated = await activatePrintedVouchers(payload, actor, saved, options.req, now)
    if (activated) messages.push(`Tištěné poukazy (${activated} ks) jsou zaplacené a platné.`)
  }
  const kind = STATUS_EMAIL[input.to]
  if (kind) {
    const outcome = await sendFulfilmentEmail(payload, saved, kind, {
      userId: actor.id,
      req: options.req,
    })
    messages.push(emailMessage(outcome))
    saved = (await loadOrder(payload, saved.id, options.req)) ?? saved
  }
  return { ok: true, order: saved, messages }
}

export async function resendEmail(
  payload: Payload,
  actor: Actor,
  id: number | string,
  kind: FulfilmentEmailKind,
  options: Options = {},
): Promise<ServiceResult> {
  if (!can(actor, 'admin', 'staff')) return fail(403, 'E-maily posílá jen obsluha.')
  const order = await loadOrder(payload, id, options.req)
  if (!order) return fail(404, 'Objednávka neexistuje.')
  const allowed: Record<FulfilmentEmailKind, boolean> = {
    'final-price': Boolean(order.fulfilment?.finalisedAt) && order.status !== 'cancelled',
    shipped: order.status === 'shipped' || order.status === 'delivered',
    'ready-for-pickup': order.status === 'ready-for-pickup' || order.status === 'picked-up',
    cancelled: order.status === 'cancelled',
  }
  if (!allowed[kind]) return fail(409, 'Tento e-mail se k aktuálnímu stavu objednávky nehodí.')
  const outcome = await sendFulfilmentEmail(payload, order, kind, {
    force: true,
    userId: actor.id,
    req: options.req,
  })
  const saved = (await loadOrder(payload, order.id, options.req)) ?? order
  return { ok: true, order: saved, messages: [emailMessage(outcome)] }
}

// ------------------------------------------------------------------------------------- shipments

function shipmentInput(
  order: Order,
  method: { carrierCode: string; serviceCode: string },
  packagingGrams: number,
): ShipmentInput {
  const c = order.customer
  const a = order.shippingAddress ?? {}
  return {
    orderNumber: order.orderNumber,
    attempt: (order.shipment?.attempt ?? 0) + 1,
    carrierCode: method.carrierCode,
    serviceCode: method.serviceCode,
    recipient: {
      name: `${c.firstName} ${c.lastName}`.trim(),
      company: c.companyName,
      street: a.street ?? '',
      city: a.city ?? '',
      postcode: a.postcode ?? '',
      phone: c.phone,
      email: c.email,
    },
    codAmount: order.totals.amountDue ?? 0,
    currency: 'CZK',
    invoiceNumber: order.invoiceNumber ?? null,
    declaredValue: order.totals.totalFinal ?? 0,
    weightGrams: orderGrams(asWeighLines(order)) + packagingGrams,
  }
}

async function methodCodes(payload: Payload, order: Order, req?: PayloadRequest) {
  const methodId =
    typeof order.delivery?.method === 'object' ? order.delivery.method?.id : order.delivery?.method
  if (!methodId) return null
  try {
    const method = await payload.findByID({
      collection: 'shipping-methods',
      id: methodId,
      depth: 0,
      req,
      overrideAccess: true,
    })
    return {
      carrierCode: method.balikobot?.carrierCode?.trim() ?? '',
      serviceCode: method.balikobot?.serviceCode?.trim() ?? '',
    }
  } catch {
    return null
  }
}

function carrierFor(options: Options): CarrierService | string {
  try {
    return options.carrier ?? getCarrierService()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** "Vytvořit zásilku a štítek": Balíkobot ADD (or simulation) for one courier order. */
export async function createShipment(
  payload: Payload,
  actor: Actor,
  id: number | string,
  options: Options = {},
): Promise<ServiceResult> {
  if (!can(actor, 'admin', 'staff')) return fail(403, 'Zásilky vytváří jen obsluha.')
  const order = await loadOrder(payload, id, options.req)
  if (!order) return fail(404, 'Objednávka neexistuje.')
  if (order.delivery?.methodType !== 'courier') return fail(409, 'Zásilka se vytváří jen u kurýra.')
  if (order.status !== 'weighed')
    return fail(409, 'Zásilku lze vytvořit u zvážené objednávky (stav „Zváženo“).')
  if (!order.fulfilment?.finalisedAt)
    return fail(409, 'Nejdřív potvrďte vyúčtování – dobírka musí být konečná.')
  if (activeShipment(order)) return fail(409, 'Zásilka už existuje. Pro novou ji nejdřív zrušte.')
  const codes = await methodCodes(payload, order, options.req)
  if (!codes) return fail(409, 'Způsob dopravy objednávky už neexistuje – nelze zjistit dopravce.')
  const carrier = carrierFor(options)
  if (typeof carrier === 'string') return fail(503, carrier)
  const { packagingWeightGrams } = await getFulfilmentSettings(payload, options.req)
  const input = shipmentInput(order, codes, packagingWeightGrams)
  const result = await carrier.createShipment(input)
  const now = options.now ?? new Date()
  if (!result.ok) {
    await save(
      payload,
      actor,
      order.id,
      { shipment: { ...order.shipment, lastError: result.errors.join('\n').slice(0, 4000) } },
      options,
    )
    return fail(422, 'Zásilku se nepodařilo vytvořit.', { details: result.errors })
  }
  const saved = await save(
    payload,
    actor,
    order.id,
    {
      trackingNumber: result.trackingNumber,
      trackingUrl: result.trackingUrl,
      shipment: {
        provider: result.simulated ? 'simulation' : 'balikobot',
        carrierCode: input.carrierCode,
        serviceCode: input.serviceCode || null,
        packageId: result.packageId,
        labelUrl: result.labelUrl,
        labelCreatedAt: now.toISOString(),
        handedOverAt: null,
        batchId: null,
        attempt: input.attempt,
        lastError: null,
      },
    },
    options,
  )
  return {
    ok: true,
    order: saved,
    messages: [
      result.simulated
        ? `SIMULACE: zásilka ${result.trackingNumber} nebyla skutečně odeslána.`
        : `Zásilka ${result.trackingNumber} vytvořena.`,
    ],
  }
}

/** "Zrušit zásilku": Balíkobot DROP of a package not handed over yet. */
export async function cancelShipment(
  payload: Payload,
  actor: Actor,
  id: number | string,
  options: Options = {},
): Promise<ServiceResult> {
  if (!can(actor, 'admin', 'staff')) return fail(403, 'Zásilky ruší jen obsluha.')
  const order = await loadOrder(payload, id, options.req)
  if (!order) return fail(404, 'Objednávka neexistuje.')
  if (!activeShipment(order)) return fail(409, 'Objednávka nemá žádnou zásilku.')
  if (order.shipment?.handedOverAt)
    return fail(409, 'Zásilka už byla předána dopravci – zrušit ji lze jen u dopravce.')
  if (order.shipment?.provider !== 'simulation') {
    const carrier = carrierFor(options)
    if (typeof carrier === 'string') return fail(503, carrier)
    const result = await carrier.cancelShipment(
      order.shipment?.carrierCode ?? '',
      order.shipment!.packageId!,
    )
    if (!result.ok) return fail(422, 'Zásilku se nepodařilo zrušit.', { details: result.errors })
  }
  const saved = await save(
    payload,
    actor,
    order.id,
    {
      trackingNumber: null,
      trackingUrl: null,
      shipment: {
        ...order.shipment,
        packageId: null,
        labelUrl: null,
        labelCreatedAt: null,
        lastError: null,
      },
    },
    options,
  )
  return { ok: true, order: saved, messages: ['Zásilka zrušena.'] }
}

function labelPage(order: Order): LabelPage {
  const a = order.shippingAddress ?? {}
  return {
    title: `Obj. ${order.orderNumber} - ${order.trackingNumber ?? ''}`,
    lines: [
      `${order.customer.firstName} ${order.customer.lastName}`,
      a.street ?? '',
      `${a.postcode ?? ''} ${a.city ?? ''}`,
      `Tel. ${order.customer.phone}`,
      '',
      `Dobirka: ${order.totals.amountDue ?? 0} CZK`,
      `VS: ${order.invoiceNumber ?? '-'}`,
      `Dopravce: ${order.shipment?.carrierCode ?? '-'} / sluzba ${order.shipment?.serviceCode ?? '-'}`,
    ],
  }
}

/** One PDF with the labels of the given orders (all must have a shipment). */
export async function labelsPdf(
  payload: Payload,
  actor: Actor,
  ids: (number | string)[],
  options: Options = {},
): Promise<{ ok: true; pdf: Buffer } | { ok: false; status: number; message: string }> {
  if (!can(actor, 'admin', 'staff'))
    return { ok: false, status: 403, message: 'Štítky tiskne obsluha.' }
  const orders = (await Promise.all(ids.map((id) => loadOrder(payload, id, options.req)))).filter(
    (o): o is Order => Boolean(o && activeShipment(o)),
  )
  if (!orders.length) return { ok: false, status: 404, message: 'Žádná z objednávek nemá zásilku.' }
  const simulated = orders.filter((o) => o.shipment?.provider === 'simulation')
  const live = orders.filter((o) => o.shipment?.provider !== 'simulation')
  if (simulated.length && live.length) {
    return {
      ok: false,
      status: 409,
      message: 'Nelze tisknout simulované a skutečné štítky dohromady.',
    }
  }
  const carrier = simulated.length
    ? (await import('@/shipping/carrier')).simulationCarrier()
    : carrierFor(options)
  if (typeof carrier === 'string') return { ok: false, status: 503, message: carrier }
  const byCarrier = new Set(orders.map((o) => o.shipment?.carrierCode ?? ''))
  if (byCarrier.size > 1)
    return { ok: false, status: 409, message: 'Štítky různých dopravců tiskněte zvlášť.' }
  const result = await carrier.labels(
    [...byCarrier][0],
    orders.map((o) => ({
      packageId: o.shipment!.packageId!,
      labelUrl: o.shipment?.labelUrl,
      page: labelPage(o),
    })),
  )
  return result.ok ? result : { ok: false, status: 502, message: result.errors.join(' ') }
}

/** Courier orders of a day that can get a shipment now / were created and wait for the batch. */
async function courierOrdersOfDay(payload: Payload, date: string, req?: PayloadRequest) {
  const found = await payload.find({
    collection: 'orders',
    where: {
      and: [
        { scheduledDate: { equals: date } },
        { 'delivery.methodType': { equals: 'courier' } },
        { status: { equals: 'weighed' } },
      ],
    },
    depth: 0,
    limit: 500,
    overrideAccess: true,
    req,
  })
  return found.docs
}

export type BulkResult = {
  ok: true
  done: string[]
  failed: { orderNumber: string; message: string }[]
  skipped: string[]
}

/** Bulk "Vytvořit zásilky" for a day: every weighed, confirmed courier order without a parcel. */
export async function createShipmentsForDay(
  payload: Payload,
  actor: Actor,
  date: string,
  options: Options = {},
): Promise<BulkResult | Extract<ServiceResult, { ok: false }>> {
  if (!can(actor, 'admin', 'staff'))
    return { ok: false, status: 403, message: 'Zásilky vytváří jen obsluha.' }
  const result: BulkResult = { ok: true, done: [], failed: [], skipped: [] }
  for (const order of await courierOrdersOfDay(payload, date, options.req)) {
    if (activeShipment(order)) continue
    if (!order.fulfilment?.finalisedAt) {
      result.skipped.push(`${order.orderNumber} (vyúčtování nepotvrzeno)`)
      continue
    }
    const one = await createShipment(payload, actor, order.id, options)
    if (one.ok) result.done.push(order.orderNumber)
    else
      result.failed.push({
        orderNumber: order.orderNumber,
        message: [one.message, ...(one.details ?? [])].join(' '),
      })
  }
  return result
}

/**
 * "Předat dopravci" for a day: Balíkobot ORDER for all created, not yet handed-over parcels of
 * the day (per carrier). The orders then become "Odesláno" and the customers get the tracking
 * e-mail.
 */
export async function closeBatchForDay(
  payload: Payload,
  actor: Actor,
  date: string,
  options: Options = {},
): Promise<BulkResult | Extract<ServiceResult, { ok: false }>> {
  if (!can(actor, 'admin', 'staff'))
    return { ok: false, status: 403, message: 'Svoz uzavírá jen obsluha.' }
  const orders = (await courierOrdersOfDay(payload, date, options.req)).filter(
    (o) => activeShipment(o) && !o.shipment?.handedOverAt,
  )
  const result: BulkResult = { ok: true, done: [], failed: [], skipped: [] }
  if (!orders.length) return result
  const groups = new Map<string, Order[]>()
  for (const order of orders) {
    const key = `${order.shipment?.provider}|${order.shipment?.carrierCode}`
    groups.set(key, [...(groups.get(key) ?? []), order])
  }
  const now = options.now ?? new Date()
  for (const [key, group] of groups) {
    const [provider, carrierCode] = key.split('|')
    const carrier =
      provider === 'simulation'
        ? (await import('@/shipping/carrier')).simulationCarrier()
        : carrierFor(options)
    if (typeof carrier === 'string') {
      group.forEach((o) => result.failed.push({ orderNumber: o.orderNumber, message: carrier }))
      continue
    }
    const closed = await carrier.closeBatch(
      carrierCode,
      group.map((o) => o.shipment!.packageId!),
    )
    if (!closed.ok) {
      group.forEach((o) =>
        result.failed.push({ orderNumber: o.orderNumber, message: closed.errors.join(' ') }),
      )
      continue
    }
    for (const order of group) {
      await save(
        payload,
        actor,
        order.id,
        {
          shipment: { ...order.shipment, handedOverAt: now.toISOString(), batchId: closed.batchId },
        },
        options,
      )
      const shipped = await changeStatus(
        payload,
        actor,
        order.id,
        { to: 'shipped', note: 'Předáno dopravci' },
        options,
      )
      if (shipped.ok) result.done.push(order.orderNumber)
      else result.failed.push({ orderNumber: order.orderNumber, message: shipped.message })
    }
  }
  return result
}

/** "Řidič vyráží": own-van orders of a day (weighed + confirmed) → Odesláno + e-mail. */
export async function markVanDeparted(
  payload: Payload,
  actor: Actor,
  date: string,
  options: Options = {},
): Promise<BulkResult | Extract<ServiceResult, { ok: false }>> {
  if (!can(actor, 'admin', 'staff')) return { ok: false, status: 403, message: 'Jen obsluha.' }
  const found = await payload.find({
    collection: 'orders',
    where: {
      and: [
        { scheduledDate: { equals: date } },
        { 'delivery.methodType': { equals: 'own-delivery' } },
        { status: { equals: 'weighed' } },
      ],
    },
    depth: 0,
    limit: 500,
    overrideAccess: true,
    req: options.req,
  })
  const result: BulkResult = { ok: true, done: [], failed: [], skipped: [] }
  for (const order of found.docs) {
    if (!order.fulfilment?.finalisedAt) {
      result.skipped.push(`${order.orderNumber} (vyúčtování nepotvrzeno)`)
      continue
    }
    const one = await changeStatus(
      payload,
      actor,
      order.id,
      { to: 'shipped', note: 'Řidič vyrazil' },
      options,
    )
    if (one.ok) result.done.push(order.orderNumber)
    else result.failed.push({ orderNumber: order.orderNumber, message: one.message })
  }
  return result
}
