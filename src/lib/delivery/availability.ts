import {
  addDays,
  dateRange,
  type IsoDate,
  parseTimeOfDay,
  toShopDateTime,
  weekdayOf,
} from './calendar'
import {
  type CoverageMode,
  type ExceptionKind,
  type ExceptionScope,
  isDeliveryType,
  isValidPostcode,
  normalizePostcode,
  type ShippingMethodType,
  type UnavailableReason,
  type Weekday,
} from './constants'
import { matchSpecificity, type PostcodePattern } from './postcodePatterns'

/**
 * Delivery availability engine (stage 2).
 *
 * Pure and framework-free: it receives plain data (already loaded from Payload by
 * `src/delivery/options.ts`) and the current moment `now` as an explicit argument. It never
 * reads the clock, the database or environment variables, so it is fully unit-testable.
 *
 * Rules, in order:
 * 1. The postcode must be 5 digits starting with 1–7, otherwise the whole request is invalid.
 * 2. Pickup methods are offered for every valid postcode (their days come from the method).
 * 3. Delivery methods (own van, courier) need a postcode known from the imported list
 *    (`postcode` argument) that is not marked "no delivery". Their weekdays come from the most
 *    specific matching delivery zone of that method, otherwise from the method's default when
 *    its coverage is `everywhere` / `fallback` (fallback only where no other delivery method has
 *    a matching zone).
 * 4. Earliest date = today (Prague) + lead days, plus one more day when ordering at or after
 *    the cut-off time (ordering exactly at the cut-off counts as late).
 * 5. A date in [earliest, today + horizon] is selectable when an applicable "closed" exception
 *    does not cover it AND (its weekday is allowed OR an applicable "open" exception covers it).
 *    Closed always wins over open.
 */

export type Id = string | number

export type ShippingMethodRule = {
  id: Id
  slug: string
  name: string
  type: ShippingMethodType
  active: boolean
  /** "HH:MM" in Prague time. */
  cutoffTime: string
  /** Days between the order day and the earliest delivery day when ordering before cut-off. */
  leadDays: number
  /** Default delivery / pickup weekdays. */
  weekdays: Weekday[]
  /** Ignored for pickup. */
  coverage: CoverageMode
  /** Pickup location (required for pickup methods). */
  locationId?: Id | null
  sortOrder?: number | null
}

export type DeliveryZoneRule = {
  id: Id
  name: string
  methodId: Id
  active: boolean
  patterns: PostcodePattern[]
  /** Overrides the method's weekdays for this zone; empty = use the method's weekdays. */
  weekdays: Weekday[]
}

export type PostcodeRecord = {
  code: string
  city?: string | null
  /** "Nedoručujeme" – only pickup is offered for this postcode. */
  deliveryBlocked: boolean
}

export type DeliveryException = {
  id: Id
  kind: ExceptionKind
  dateFrom: IsoDate
  /** Last day of a range (inclusive); empty = single day. */
  dateTo?: IsoDate | null
  scope: ExceptionScope
  methodId?: Id | null
  locationId?: Id | null
  reason: string
}

export type DeliveryOptionsInput = {
  postcode: string
  /** The imported postcode record for `postcode`, or null when it is not in the list. */
  postcodeRecord: PostcodeRecord | null
  /** The current moment. Pass `new Date()` at the boundary (API route), fixed values in tests. */
  now: Date
  methods: ShippingMethodRule[]
  zones: DeliveryZoneRule[]
  exceptions: DeliveryException[]
  /** Dates up to and including today + horizonDays are returned. */
  horizonDays: number
  /** Flat delivery price for own-delivery and courier (settings.deliveryPrice). Pickup is 0. */
  deliveryPrice: number
}

export type MethodAvailability = {
  id: Id
  slug: string
  name: string
  type: ShippingMethodType
  price: number
  available: boolean
  reason: UnavailableReason | null
  /** Selectable dates, ascending. Empty when unavailable. */
  dates: IsoDate[]
  /** Weekdays in effect for this postcode (after zone overrides). */
  weekdays: Weekday[]
  cutoffTime: string
  /** Name of the delivery zone that decided the weekdays, if any. */
  zoneName: string | null
  locationId: Id | null
}

export type DeliveryOptionsResult =
  | {
      ok: true
      postcode: string
      known: boolean
      deliveryBlocked: boolean
      /** Today's date in Prague. */
      today: IsoDate
      methods: MethodAvailability[]
    }
  | { ok: false; error: 'invalid-postcode' }

// ---------------------------------------------------------------------------------- helpers

const sameId = (a: Id | null | undefined, b: Id | null | undefined) =>
  a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b)

function sortMethods(methods: ShippingMethodRule[]): ShippingMethodRule[] {
  return [...methods].sort(
    (a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100) || a.name.localeCompare(b.name, 'cs'),
  )
}

/** Exceptions that concern this method (scope all, this method, or this pickup location). */
export function exceptionsForMethod(
  method: Pick<ShippingMethodRule, 'id' | 'type' | 'locationId'>,
  exceptions: DeliveryException[],
): DeliveryException[] {
  return exceptions.filter((exception) => {
    if (exception.scope === 'all') return true
    if (exception.scope === 'method') return sameId(exception.methodId, method.id)
    // Location scope is about personal pickup at that place only.
    return method.type === 'pickup' && sameId(exception.locationId, method.locationId)
  })
}

const covers = (exception: DeliveryException, date: IsoDate) =>
  exception.dateFrom <= date && date <= (exception.dateTo || exception.dateFrom)

export type DayStatus =
  | { open: true; why: 'weekday' | 'open-exception'; exception?: DeliveryException }
  | { open: false; why: 'not-weekday' | 'closed-exception'; exception?: DeliveryException }

/**
 * Whether a method delivers / hands out on the date, ignoring cut-off and horizon.
 * `exceptions` must already be filtered with `exceptionsForMethod()`.
 */
export function dayStatus(
  date: IsoDate,
  weekdays: Weekday[],
  exceptions: DeliveryException[],
): DayStatus {
  const closed = exceptions.find((e) => e.kind === 'closed' && covers(e, date))
  if (closed) return { open: false, why: 'closed-exception', exception: closed }
  if (weekdays.includes(weekdayOf(date))) return { open: true, why: 'weekday' }
  const open = exceptions.find((e) => e.kind === 'open' && covers(e, date))
  if (open) return { open: true, why: 'open-exception', exception: open }
  return { open: false, why: 'not-weekday' }
}

type Resolution =
  | { ok: true; weekdays: Weekday[]; zoneName: string | null }
  | { ok: false; reason: UnavailableReason }

/** Most specific active zone of the method that matches the postcode. */
function bestZone(methodId: Id, zones: DeliveryZoneRule[], code: string) {
  let best: { zone: DeliveryZoneRule; score: number } | null = null
  for (const zone of zones) {
    if (!zone.active || !sameId(zone.methodId, methodId)) continue
    const score = matchSpecificity(zone.patterns, code)
    if (score > 0 && (!best || score > best.score)) best = { zone, score }
  }
  return best?.zone ?? null
}

/** Which weekdays a method has for the postcode, or why it is not offered there at all. */
export function resolveMethodForPostcode(
  method: ShippingMethodRule,
  code: string,
  postcodeRecord: PostcodeRecord | null,
  allMethods: ShippingMethodRule[],
  zones: DeliveryZoneRule[],
): Resolution {
  if (!method.weekdays.length || parseTimeOfDay(method.cutoffTime) === null) {
    return { ok: false, reason: 'misconfigured' }
  }
  if (method.type === 'pickup') {
    if (method.locationId === null || method.locationId === undefined) {
      return { ok: false, reason: 'misconfigured' }
    }
    return { ok: true, weekdays: method.weekdays, zoneName: null }
  }

  if (!postcodeRecord) return { ok: false, reason: 'unknown-postcode' }
  if (postcodeRecord.deliveryBlocked) return { ok: false, reason: 'postcode-blocked' }

  const zone = bestZone(method.id, zones, code)
  if (zone) {
    return {
      ok: true,
      weekdays: zone.weekdays.length ? zone.weekdays : method.weekdays,
      zoneName: zone.name,
    }
  }
  if (method.coverage === 'everywhere') {
    return { ok: true, weekdays: method.weekdays, zoneName: null }
  }
  if (method.coverage === 'fallback') {
    const servedByOther = allMethods.some(
      (other) =>
        other.active &&
        isDeliveryType(other.type) &&
        !sameId(other.id, method.id) &&
        bestZone(other.id, zones, code) !== null,
    )
    if (!servedByOther) return { ok: true, weekdays: method.weekdays, zoneName: null }
  }
  return { ok: false, reason: 'outside-area' }
}

// ---------------------------------------------------------------------------------- core

/**
 * Selectable delivery / pickup dates per active shipping method for a postcode.
 * Inactive methods are left out entirely; active but unusable ones come with a `reason`.
 */
export function getDeliveryOptions(input: DeliveryOptionsInput): DeliveryOptionsResult {
  const code = normalizePostcode(input.postcode)
  if (!isValidPostcode(code)) return { ok: false, error: 'invalid-postcode' }

  const record =
    input.postcodeRecord && normalizePostcode(input.postcodeRecord.code) === code
      ? input.postcodeRecord
      : null
  const { date: today, secondsOfDay } = toShopDateTime(input.now)
  const lastDate = addDays(today, Math.max(0, Math.floor(input.horizonDays)))
  const active = sortMethods(input.methods.filter((m) => m.active))

  const methods = active.map((method): MethodAvailability => {
    const base = {
      id: method.id,
      slug: method.slug,
      name: method.name,
      type: method.type,
      price: method.type === 'pickup' ? 0 : input.deliveryPrice,
      cutoffTime: method.cutoffTime,
      locationId: method.locationId ?? null,
    }
    const resolution = resolveMethodForPostcode(method, code, record, active, input.zones)
    if (!resolution.ok) {
      return {
        ...base,
        available: false,
        reason: resolution.reason,
        dates: [],
        weekdays: [],
        zoneName: null,
      }
    }

    const cutoff = parseTimeOfDay(method.cutoffTime) as number
    const lateOrder = secondsOfDay >= cutoff
    const earliest = addDays(today, Math.max(0, method.leadDays) + (lateOrder ? 1 : 0))
    const relevant = exceptionsForMethod(method, input.exceptions)
    const dates = dateRange(earliest, lastDate).filter(
      (date) => dayStatus(date, resolution.weekdays, relevant).open,
    )

    return {
      ...base,
      available: dates.length > 0,
      reason: dates.length > 0 ? null : 'no-dates',
      dates,
      weekdays: resolution.weekdays,
      zoneName: resolution.zoneName,
    }
  })

  return {
    ok: true,
    postcode: code,
    known: record !== null,
    deliveryBlocked: record?.deliveryBlocked ?? false,
    today,
    methods,
  }
}

// ---------------------------------------------------------------------------------- calendar

export type CalendarInput = Omit<DeliveryOptionsInput, 'now' | 'horizonDays' | 'deliveryPrice'> & {
  from: IsoDate
  to: IsoDate
}

export type CalendarMethod = {
  id: Id
  name: string
  type: ShippingMethodType
  reason: UnavailableReason | null
  zoneName: string | null
  days: { date: IsoDate; status: DayStatus }[]
}

/**
 * Day-by-day overview for the admin calendar: which days each active method is open for a
 * postcode between `from` and `to`, ignoring cut-off times (that depends on when one orders).
 */
export function getDeliveryCalendar(
  input: CalendarInput,
): { ok: true; known: boolean; methods: CalendarMethod[] } | { ok: false } {
  const code = normalizePostcode(input.postcode)
  if (!isValidPostcode(code)) return { ok: false }
  const record =
    input.postcodeRecord && normalizePostcode(input.postcodeRecord.code) === code
      ? input.postcodeRecord
      : null
  const active = sortMethods(input.methods.filter((m) => m.active))
  const days = dateRange(input.from, input.to)

  const methods = active.map((method): CalendarMethod => {
    const resolution = resolveMethodForPostcode(method, code, record, active, input.zones)
    if (!resolution.ok) {
      return {
        id: method.id,
        name: method.name,
        type: method.type,
        reason: resolution.reason,
        zoneName: null,
        days: [],
      }
    }
    const relevant = exceptionsForMethod(method, input.exceptions)
    return {
      id: method.id,
      name: method.name,
      type: method.type,
      reason: null,
      zoneName: resolution.zoneName,
      days: days.map((date) => ({ date, status: dayStatus(date, resolution.weekdays, relevant) })),
    }
  })
  return { ok: true, known: record !== null, methods }
}
