import { APIError, type CollectionAfterChangeHook, type CollectionBeforeChangeHook } from 'payload'

import { formatCzk } from '@/lib/format'
import type { ShippingMethodType } from '@/lib/delivery/constants'
import { isWeighingComplete, type WeighLine } from '@/lib/orders/fulfilment'
import { checkTransition, type GuardRole } from '@/lib/orders/status'
import {
  LINE_RESOLUTION_LABELS,
  type LineResolution,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from '@/lib/orders/constants'
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from '@/lib/vouchers/constants'
import type { Order } from '@/payload-types'

import { getTolerancePercent } from './settings'

/**
 * Hooks of the `orders` collection (stage 5). They run for EVERY write – the fulfilment screens,
 * the standard admin form and the REST API alike – so the rules cannot be bypassed.
 */

/** Context flag set by `src/fulfilment/service.ts` after it checked the transition itself. */
export const STATUS_CHECKED = 'fulfilmentStatusChecked'

/**
 * Only allowed status transitions (see `src/lib/orders/status.ts`). Writes without a user are
 * server code (seed, tests, the services) and are trusted.
 */
export const orderStatusGuard: CollectionBeforeChangeHook<Order> = async ({
  data,
  originalDoc,
  operation,
  req,
  context,
}) => {
  if (operation !== 'update' || !originalDoc) return data
  const to = (data.status ?? originalDoc.status) as OrderStatus
  const from = originalDoc.status as OrderStatus
  if (to === from || context?.[STATUS_CHECKED] || !req.user) return data

  const merged = { ...originalDoc, ...data } as Order
  const tolerance = await getTolerancePercent(req.payload, req)
  const result = checkTransition({
    from,
    to,
    role: req.user.role as GuardRole,
    methodType: merged.delivery?.methodType as ShippingMethodType | undefined,
    weighingComplete: isWeighingComplete((merged.lines ?? []) as WeighLine[], tolerance),
    finalised: Boolean(merged.fulfilment?.finalisedAt),
    hasTracking: Boolean(merged.trackingNumber),
    reason: merged.cancellation?.reason,
  })
  if (!result.ok) throw new APIError(result.reason, 400, undefined, true)
  return data
}

type Change = { field: string; lineId?: string; oldValue: string; newValue: string }

const text = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '–'
  return String(value)
}

const vouchersText = (rows: Order['voucherRedemptions']): string =>
  (rows ?? []).length
    ? (rows ?? []).map((row) => `${row.code}: ${formatCzk(row.amount ?? 0)}`).join('; ')
    : '–'

/** Differences worth auditing between two versions of an order (pure, exported for tests). */
export function auditChanges(before: Order, after: Order): Change[] {
  const changes: Change[] = []
  const push = (field: string, a: unknown, b: unknown, lineId?: string) => {
    const oldValue = text(a)
    const newValue = text(b)
    if (oldValue !== newValue) changes.push({ field, oldValue, newValue, lineId })
  }
  const statusLabel = (v: unknown) => ORDER_STATUS_LABELS[v as OrderStatus] ?? v
  const resolutionLabel = (v: unknown) =>
    v ? (LINE_RESOLUTION_LABELS[v as LineResolution] ?? v) : v
  push('Stav', statusLabel(before.status), statusLabel(after.status))
  push('Číslo faktury', before.invoiceNumber, after.invoiceNumber)
  push('Číslo zásilky', before.trackingNumber, after.trackingNumber)
  push('Zboží po zvážení (Kč)', before.totals?.goodsFinal, after.totals?.goodsFinal)
  push('Celkem po zvážení (Kč)', before.totals?.totalFinal, after.totals?.totalFinal)
  push('K úhradě při převzetí (Kč)', before.totals?.amountDue, after.totals?.amountDue)
  push('Poukazy', vouchersText(before.voucherRedemptions), vouchersText(after.voucherRedemptions))
  push('Zásilka (ID balíku)', before.shipment?.packageId, after.shipment?.packageId)
  // Stage 7: bank transfer of electronic vouchers (marked paid / undone by staff).
  const paymentLabel = (v: unknown) => (v ? (PAYMENT_STATUS_LABELS[v as PaymentStatus] ?? v) : v)
  push('Platba převodem', paymentLabel(before.payment?.status), paymentLabel(after.payment?.status))
  push(
    'Platba přišla (den)',
    before.payment?.paidOn?.slice(0, 10),
    after.payment?.paidOn?.slice(0, 10),
  )

  const beforeLines = new Map((before.lines ?? []).map((line) => [line.id, line]))
  for (const line of after.lines ?? []) {
    const old = beforeLines.get(line.id)
    if (!old) continue
    const name = line.variantLabel
      ? `${line.productTitle} (${line.variantLabel})`
      : line.productTitle
    const id = line.id ?? undefined
    push(`${name}: hmotnost (g)`, old.actualWeightGrams, line.actualWeightGrams, id)
    push(`${name}: cena (Kč)`, old.finalPrice, line.finalPrice, id)
    push(
      `${name}: výsledek vážení`,
      resolutionLabel(old.resolution),
      resolutionLabel(line.resolution),
      id,
    )
    push(`${name}: důvod odchylky`, old.toleranceNote, line.toleranceNote, id)
    push(`${name}: poznámka řezníka`, old.weighNote, line.weighNote, id)
  }
  return changes
}

/** Writes one `order-audit-log` entry per change, in the same transaction (`req`). */
export const orderAuditAfterChange: CollectionAfterChangeHook<Order> = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  if (operation !== 'update' || !previousDoc) return doc
  const changes = auditChanges(previousDoc, doc)
  const at = new Date().toISOString()
  for (const change of changes) {
    await req.payload.create({
      collection: 'order-audit-log',
      overrideAccess: true,
      req,
      depth: 0,
      data: {
        order: doc.id,
        orderNumber: doc.orderNumber,
        at,
        user: req.user?.collection === 'users' ? req.user.id : null,
        userEmail: req.user?.email ?? 'systém',
        field: change.field,
        lineId: change.lineId ?? null,
        oldValue: change.oldValue.slice(0, 500),
        newValue: change.newValue.slice(0, 500),
        summary:
          `${doc.orderNumber}: ${change.field} ${change.oldValue} → ${change.newValue}`.slice(
            0,
            300,
          ),
      },
    })
  }
  return doc
}
