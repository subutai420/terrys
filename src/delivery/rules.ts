import type { Payload } from 'payload'

import { addDays, type IsoDate, toShopDate } from '@/lib/delivery/calendar'
import { DEFAULT_HORIZON_DAYS, normalizePostcode, type Weekday } from '@/lib/delivery/constants'
import type {
  DeliveryException,
  DeliveryZoneRule,
  PostcodeRecord,
  ShippingMethodRule,
} from '@/lib/delivery/availability'
import { parsePostcodePatterns } from '@/lib/delivery/postcodePatterns'
import type {
  DeliveryException as DeliveryExceptionDoc,
  DeliveryZone as DeliveryZoneDoc,
  Location,
  ShippingMethod as ShippingMethodDoc,
} from '@/payload-types'

/**
 * Loads the delivery configuration from Payload and maps it to the plain data the pure engine in
 * `src/lib/delivery` expects. Uses the local API with access control bypassed (server-side
 * only); never return these documents to the public as they are.
 */

type Rel = number | { id: number } | null | undefined
const relId = (value: Rel): number | null =>
  value === null || value === undefined ? null : typeof value === 'object' ? value.id : value

export function toMethodRule(doc: ShippingMethodDoc): ShippingMethodRule {
  return {
    id: doc.id,
    slug: doc.slug || String(doc.id),
    name: doc.name,
    type: doc.type,
    active: Boolean(doc.active),
    cutoffTime: doc.cutoffTime,
    leadDays: doc.leadDays ?? 1,
    weekdays: (doc.weekdays ?? []) as Weekday[],
    coverage: doc.coverage ?? 'zones',
    locationId: relId(doc.location as Rel),
    sortOrder: doc.sortOrder,
  }
}

export function toZoneRule(doc: DeliveryZoneDoc): DeliveryZoneRule {
  return {
    id: doc.id,
    name: doc.name,
    methodId: relId(doc.method as Rel) ?? -1,
    active: Boolean(doc.active),
    patterns: parsePostcodePatterns(doc.postcodes ?? '').patterns,
    weekdays: (doc.weekdays ?? []) as Weekday[],
  }
}

export function toExceptionRule(doc: DeliveryExceptionDoc): DeliveryException {
  return {
    id: doc.id,
    kind: doc.kind,
    dateFrom: toShopDate(doc.dateFrom),
    dateTo: doc.dateTo ? toShopDate(doc.dateTo) : null,
    scope: doc.scope,
    methodId: relId(doc.method as Rel),
    locationId: relId(doc.location as Rel),
    reason: doc.reason,
  }
}

export type DeliveryRules = {
  methods: ShippingMethodRule[]
  zones: DeliveryZoneRule[]
  exceptions: DeliveryException[]
  deliveryPrice: number
  horizonDays: number
  /** Pickup locations by id (public data: name and address). */
  locations: Map<number, Location>
  /** Customer notes by method id. */
  customerNotes: Map<number, string | null>
}

/** Stored timestamps are padded by two days on each side; the engine filters exactly. */
const paddedTimestamp = (date: IsoDate, days: number) => `${addDays(date, days)}T00:00:00.000Z`

/**
 * Everything the engine needs for the dates `from`..`to` (exceptions outside are not loaded).
 * `to` defaults to `from` + the horizon from the settings.
 */
export async function loadDeliveryRules(
  payload: Payload,
  range: { from: IsoDate; to?: IsoDate },
): Promise<DeliveryRules> {
  const settings = await payload.findGlobal({ slug: 'settings', depth: 0 })
  const horizonDays = settings.deliveryHorizonDays ?? DEFAULT_HORIZON_DAYS
  const to = range.to ?? addDays(range.from, horizonDays)
  const [methods, zones, exceptions] = await Promise.all([
    payload.find({
      collection: 'shipping-methods',
      where: { active: { equals: true } },
      depth: 1,
      pagination: false,
    }),
    payload.find({
      collection: 'delivery-zones',
      where: { active: { equals: true } },
      depth: 0,
      pagination: false,
    }),
    payload.find({
      collection: 'delivery-exceptions',
      depth: 0,
      pagination: false,
      where: {
        and: [
          { dateFrom: { less_than_equal: paddedTimestamp(to, 2) } },
          {
            or: [
              { dateTo: { greater_than_equal: paddedTimestamp(range.from, -2) } },
              { dateFrom: { greater_than_equal: paddedTimestamp(range.from, -2) } },
            ],
          },
        ],
      },
    }),
  ])

  const locations = new Map<number, Location>()
  const customerNotes = new Map<number, string | null>()
  for (const method of methods.docs) {
    if (method.location && typeof method.location === 'object') {
      locations.set(method.location.id, method.location)
    }
    customerNotes.set(method.id, method.customerNote ?? null)
  }

  return {
    methods: methods.docs.map(toMethodRule),
    zones: zones.docs.map(toZoneRule),
    exceptions: exceptions.docs.map(toExceptionRule),
    deliveryPrice: settings.deliveryPrice,
    horizonDays,
    locations,
    customerNotes,
  }
}

export async function findPostcodeRecord(
  payload: Payload,
  postcode: string,
): Promise<PostcodeRecord | null> {
  const code = normalizePostcode(postcode)
  const found = await payload.find({
    collection: 'postcodes',
    where: { code: { equals: code } },
    limit: 1,
    depth: 0,
    pagination: false,
  })
  const doc = found.docs[0]
  return doc
    ? { code: doc.code, city: doc.city, deliveryBlocked: Boolean(doc.deliveryBlocked) }
    : null
}
