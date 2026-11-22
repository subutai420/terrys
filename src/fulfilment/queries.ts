import type { Payload, PayloadRequest, Where } from 'payload'

import { addDays, type IsoDate, toShopDateTime } from '@/lib/delivery/calendar'
import type { ShippingMethodType } from '@/lib/delivery/constants'
import type { OrderStatus } from '@/lib/orders/constants'
import { orderGrams, type WeighLine } from '@/lib/orders/fulfilment'
import type { Order } from '@/payload-types'

/** Read side of the fulfilment screens (Expedice, print sheets, dashboard panel). */

export const shopToday = (now = new Date()): IsoDate => toShopDateTime(now).date

export type DayFilter = {
  date: IsoDate
  type?: ShippingMethodType | 'all'
  /** 'open' = everything except cancelled (default), 'all', or one status. */
  status?: OrderStatus | 'open' | 'all'
}

const METHOD_ORDER: Record<string, number> = { 'own-delivery': 0, courier: 1, pickup: 2 }

export function sortForDispatch(orders: Order[]): Order[] {
  return [...orders].sort(
    (a, b) =>
      (METHOD_ORDER[a.delivery?.methodType ?? ''] ?? 9) -
        (METHOD_ORDER[b.delivery?.methodType ?? ''] ?? 9) ||
      (a.delivery?.methodName ?? '').localeCompare(b.delivery?.methodName ?? '', 'cs') ||
      (a.shippingAddress?.postcode ?? '').localeCompare(b.shippingAddress?.postcode ?? '') ||
      a.orderNumber.localeCompare(b.orderNumber),
  )
}

export async function ordersForDay(payload: Payload, filter: DayFilter, req?: PayloadRequest) {
  const and: Where[] = [{ scheduledDate: { equals: filter.date } }]
  if (filter.type && filter.type !== 'all')
    and.push({ 'delivery.methodType': { equals: filter.type } })
  const status = filter.status ?? 'open'
  if (status === 'open') and.push({ status: { not_equals: 'cancelled' } })
  else if (status !== 'all') and.push({ status: { equals: status } })
  const found = await payload.find({
    collection: 'orders',
    where: { and },
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    req,
  })
  return sortForDispatch(found.docs)
}

/** Quick search across all dates: order number, customer name, phone (digits), e-mail. */
export async function searchOrders(payload: Payload, query: string, req?: PayloadRequest) {
  const q = query.trim().slice(0, 100)
  if (!q) return []
  const digits = q.replace(/\D/g, '')
  const or: Where[] = [
    { orderNumber: { like: q } },
    { customerName: { like: q } },
    { contactEmail: { like: q } },
  ]
  if (digits.length >= 3) {
    // Phones are stored as typed ("602 123 456"): match the digits with any spaces between.
    or.push({ contactPhone: { like: digits.replace(/(\d{3})(?=\d)/g, '$1 ') } })
    or.push({ contactPhone: { like: digits } })
    or.push({ orderNumber: { like: digits } })
  }
  const found = await payload.find({
    collection: 'orders',
    where: { or },
    depth: 0,
    limit: 50,
    sort: '-createdAt',
    overrideAccess: true,
    req,
  })
  return found.docs
}

export type DayCount = { date: IsoDate; orders: number; grams: number; toWeigh: number }

/** Orders and estimated kg per day for the strip of upcoming days (cancelled left out). */
export async function dayCounts(
  payload: Payload,
  from: IsoDate,
  days: number,
  req?: PayloadRequest,
): Promise<DayCount[]> {
  const to = addDays(from, days - 1)
  const found = await payload.find({
    collection: 'orders',
    where: {
      and: [
        { scheduledDate: { greater_than_equal: from } },
        { scheduledDate: { less_than_equal: to } },
        { status: { not_equals: 'cancelled' } },
      ],
    },
    depth: 0,
    limit: 5000,
    overrideAccess: true,
    req,
    select: { scheduledDate: true, status: true, lines: true },
  })
  const result: DayCount[] = []
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i)
    const docs = found.docs.filter((doc) => doc.scheduledDate === date)
    result.push({
      date,
      orders: docs.length,
      grams: docs.reduce((sum, doc) => sum + orderGrams((doc.lines ?? []) as WeighLine[]), 0),
      toWeigh: docs.filter((doc) => doc.status === 'received').length,
    })
  }
  return result
}

export type TodaySummary = {
  today: IsoDate
  toWeigh: number
  overdue: number
  toShip: number
  readyForPickup: number
  flagged: number
  withdrawals: number
}

/** Numbers of the "Dnes" panel on the admin home. */
export async function todaySummary(
  payload: Payload,
  now = new Date(),
  req?: PayloadRequest,
): Promise<TodaySummary> {
  const today = shopToday(now)
  const count = (where: Where) =>
    payload
      .count({ collection: 'orders', where, overrideAccess: true, req })
      .then((r) => r.totalDocs)
  const [toWeigh, overdue, toShip, readyForPickup, flagged, withdrawals] = await Promise.all([
    count({ and: [{ scheduledDate: { equals: today } }, { status: { equals: 'received' } }] }),
    count({
      and: [{ scheduledDate: { less_than: today } }, { status: { in: ['received', 'weighed'] } }],
    }),
    count({
      and: [
        { scheduledDate: { equals: today } },
        { status: { equals: 'weighed' } },
        { 'delivery.methodType': { in: ['own-delivery', 'courier'] } },
      ],
    }),
    count({ status: { equals: 'ready-for-pickup' } }),
    count({
      and: [
        { needsReview: { equals: true } },
        { status: { not_in: ['delivered', 'picked-up', 'cancelled'] } },
      ],
    }),
    payload
      .count({
        collection: 'withdrawals',
        where: { status: { equals: 'new' } },
        overrideAccess: true,
        req,
      })
      .then((r) => r.totalDocs),
  ])
  return { today, toWeigh, overdue, toShip, readyForPickup, flagged, withdrawals }
}
