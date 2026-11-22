import type { Payload } from 'payload'

import { getDeliveryOptions } from '@/lib/delivery/availability'
import { type IsoDate, toShopDateTime } from '@/lib/delivery/calendar'
import {
  formatPostcode,
  isValidPostcode,
  normalizePostcode,
  SHOP_TIME_ZONE,
  type ShippingMethodType,
  type UnavailableReason,
  UNAVAILABLE_REASON_MESSAGES,
} from '@/lib/delivery/constants'

import { findPostcodeRecord, loadDeliveryRules } from './rules'

/**
 * Public delivery options for a postcode – what the cart (stage 4) shows in its first step.
 * Contains only customer-facing data: no carrier codes, zones, internal notes or user data.
 */
export type PublicDeliveryMethod = {
  id: number
  slug: string
  name: string
  type: ShippingMethodType
  customerNote: string | null
  /** Whole CZK incl. VAT. Delivery = settings.deliveryPrice, pickup = 0. */
  price: number
  currency: 'CZK'
  available: boolean
  unavailableReason: UnavailableReason | null
  /** Czech explanation when unavailable. */
  message: string | null
  /** Order before this time (Prague) to get the earliest date. */
  cutoffTime: string
  /** Selectable dates "YYYY-MM-DD", ascending. */
  dates: IsoDate[]
  pickupLocation: {
    name: string
    street: string | null
    city: string | null
    zip: string | null
    openingHoursNote: string | null
  } | null
}

export type PublicDeliveryOptions = {
  postcode: {
    code: string
    formatted: string
    city: string | null
    /** False when the postcode is not in the imported list (only pickup is offered). */
    known: boolean
    deliveryBlocked: boolean
  }
  /** Today's date in Prague when the answer was computed. */
  today: IsoDate
  horizonDays: number
  timeZone: typeof SHOP_TIME_ZONE
  methods: PublicDeliveryMethod[]
}

export type DeliveryOptionsResponse =
  | { ok: true; data: PublicDeliveryOptions }
  | { ok: false; error: 'invalid-postcode'; message: string }

export const INVALID_POSTCODE_MESSAGE = 'Zadejte PSČ jako pět číslic, např. 120 00.'

/**
 * Server-side entry point (also used by the public endpoint). `now` is injectable for tests;
 * in production it is the current moment.
 */
export async function getDeliveryOptionsForPostcode(
  payload: Payload,
  postcode: string,
  { now = new Date() }: { now?: Date } = {},
): Promise<DeliveryOptionsResponse> {
  const code = normalizePostcode(postcode ?? '')
  if (!isValidPostcode(code)) {
    return { ok: false, error: 'invalid-postcode', message: INVALID_POSTCODE_MESSAGE }
  }

  const today = toShopDateTime(now).date
  const [rules, record] = await Promise.all([
    loadDeliveryRules(payload, { from: today }),
    findPostcodeRecord(payload, code),
  ])

  const result = getDeliveryOptions({
    postcode: code,
    postcodeRecord: record,
    now,
    methods: rules.methods,
    zones: rules.zones,
    exceptions: rules.exceptions,
    horizonDays: rules.horizonDays,
    deliveryPrice: rules.deliveryPrice,
  })
  if (!result.ok) {
    return { ok: false, error: 'invalid-postcode', message: INVALID_POSTCODE_MESSAGE }
  }

  return {
    ok: true,
    data: {
      postcode: {
        code,
        formatted: formatPostcode(code),
        city: record?.city ?? null,
        known: result.known,
        deliveryBlocked: result.deliveryBlocked,
      },
      today: result.today,
      horizonDays: rules.horizonDays,
      timeZone: SHOP_TIME_ZONE,
      methods: result.methods.map((method) => {
        const location =
          method.locationId !== null ? rules.locations.get(Number(method.locationId)) : undefined
        return {
          id: Number(method.id),
          slug: method.slug,
          name: method.name,
          type: method.type,
          customerNote: rules.customerNotes.get(Number(method.id)) ?? null,
          price: method.price,
          currency: 'CZK' as const,
          available: method.available,
          unavailableReason: method.reason,
          message: method.reason ? UNAVAILABLE_REASON_MESSAGES[method.reason] : null,
          cutoffTime: method.cutoffTime,
          dates: method.dates,
          pickupLocation: location
            ? {
                name: location.name,
                street: location.address?.street || null,
                city: location.address?.city || null,
                zip: location.address?.zip || null,
                openingHoursNote: location.openingHours?.note || null,
              }
            : null,
        }
      }),
    },
  }
}

/**
 * HTTP response for `GET /api/delivery/options?psc=12000`.
 *
 * Caching: the answer depends on the time of day (cut-off), so shared caches may keep it only
 * briefly (60 s, then serve stale for up to 5 min while revalidating). The order itself must
 * re-validate the chosen date on the server (stage 4/5) anyway.
 */
export async function deliveryOptionsResponse(
  payload: Payload,
  searchParams: URLSearchParams | undefined,
  now: Date = new Date(),
): Promise<Response> {
  const psc = searchParams?.get('psc') ?? ''
  if (psc.length > 20) {
    return Response.json(
      { error: 'invalid-postcode', message: INVALID_POSTCODE_MESSAGE },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  const result = await getDeliveryOptionsForPostcode(payload, psc, { now })
  if (!result.ok) {
    return Response.json(
      { error: result.error, message: result.message },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  return Response.json(result.data, {
    headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' },
  })
}
