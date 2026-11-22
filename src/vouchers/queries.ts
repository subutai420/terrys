import type { Payload } from 'payload'

import type { Order } from '@/payload-types'

import { electronicVoucherAvailability, type VoucherAvailability } from './availability'

/** Read side of "Poukazy – platby" and the dashboard panel (stage 7). */

export type PaymentRow = {
  id: number
  orderNumber: string
  amount: number
  customerName: string
  email: string
  phone: string
  company: string | null
  createdAt: string
  dueAt: string | null
  overdue: boolean
  ageHours: number
  reminderSentAt: string | null
  paidOn: string | null
  markedPaidAt: string | null
  cancelledReason: string | null
  vouchers: string
}

function row(order: Order, now: Date): PaymentRow {
  const dueAt = order.payment?.dueAt ?? null
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    amount: order.payment?.amount ?? order.totals.totalEstimate,
    customerName: order.customerName ?? '',
    email: order.contactEmail ?? '',
    phone: order.contactPhone ?? '',
    company: order.customer?.companyName ?? null,
    createdAt: order.createdAt,
    dueAt,
    overdue: Boolean(dueAt && new Date(dueAt).getTime() < now.getTime()),
    ageHours: Math.floor((now.getTime() - new Date(order.createdAt).getTime()) / 3_600_000),
    reminderSentAt: order.payment?.reminderSentAt ?? null,
    paidOn: order.payment?.paidOn ?? null,
    markedPaidAt: order.payment?.markedPaidAt ?? null,
    cancelledReason: order.cancellation?.reason ?? null,
    vouchers: (order.lines ?? [])
      .map((line) => `${line.quantity}× ${line.productTitle}`)
      .join(', '),
  }
}

export type PaymentsOverview = {
  awaiting: PaymentRow[]
  recentlyPaid: PaymentRow[]
  recentlyCancelled: PaymentRow[]
  availability: VoucherAvailability
  /** Active batch expires within 60 days (time to open a new one). */
  batchExpiresSoon: string | null
}

export async function voucherPaymentsOverview(
  payload: Payload,
  now = new Date(),
): Promise<PaymentsOverview> {
  const since = new Date(now.getTime() - 14 * 86_400_000).toISOString()
  const find = (where: object, sort: string, limit = 200) =>
    payload
      .find({
        collection: 'orders',
        where: { and: [{ kind: { equals: 'voucher' } }, where] } as never,
        sort,
        limit,
        depth: 0,
        overrideAccess: true,
      })
      .then((r) => r.docs.map((o) => row(o, now)))
  const [awaiting, recentlyPaid, recentlyCancelled, availability, batches] = await Promise.all([
    find({ 'payment.status': { equals: 'awaiting' } }, 'createdAt'),
    find(
      {
        and: [
          { 'payment.status': { equals: 'paid' } },
          { 'payment.markedPaidAt': { greater_than: since } },
        ],
      },
      '-payment.markedPaidAt',
      50,
    ),
    find(
      {
        and: [
          { 'payment.status': { equals: 'cancelled' } },
          { updatedAt: { greater_than: since } },
        ],
      },
      '-updatedAt',
      20,
    ),
    electronicVoucherAvailability(payload, now),
    payload.find({
      collection: 'voucher-batches',
      where: { active: { equals: true } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    }),
  ])
  const active = batches.docs[0]
  const soon =
    active && new Date(active.expiresOn).getTime() - now.getTime() < 60 * 86_400_000
      ? active.expiresOn
      : null
  return { awaiting, recentlyPaid, recentlyCancelled, availability, batchExpiresSoon: soon }
}

export async function voucherDashboardCounts(
  payload: Payload,
  now = new Date(),
): Promise<{ awaiting: number; overdue: number; availability: VoucherAvailability }> {
  const count = (where: object) =>
    payload
      .count({
        collection: 'orders',
        where: {
          and: [
            { kind: { equals: 'voucher' } },
            { 'payment.status': { equals: 'awaiting' } },
            where,
          ],
        } as never,
        overrideAccess: true,
      })
      .then((r) => r.totalDocs)
  const [awaiting, overdue, availability] = await Promise.all([
    count({}),
    count({ 'payment.dueAt': { less_than: now.toISOString() } }),
    electronicVoucherAvailability(payload, now),
  ])
  return { awaiting, overdue, availability }
}

export const AVAILABILITY_PROBLEM_TEXT: Record<
  NonNullable<VoucherAvailability['problem']>,
  string
> = {
  'no-bank-account':
    'Elektronické poukazy NELZE objednat: v Nastavení obchodu → Dárkové poukazy chybí bankovní účet (nebo je neplatný).',
  'no-active-batch':
    'Elektronické poukazy NELZE objednat: není aktivní šarže poukazů (Poukazy → Šarže poukazů).',
  'batch-expired':
    'Elektronické poukazy NELZE objednat: aktivní šarže je po platnosti – založte novou šarži.',
}
