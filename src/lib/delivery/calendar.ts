import { SHOP_TIME_ZONE, WEEKDAYS, type Weekday } from './constants'

/**
 * Calendar helpers. A delivery day is a plain calendar date written as an ISO string
 * "YYYY-MM-DD" (`IsoDate`), never a `Date`: a calendar day has no time zone, so it cannot be
 * shifted by the server's time zone or by daylight saving time.
 *
 * The only conversion from a real moment (`Date`) to a calendar date is `toShopDateTime()`,
 * which always uses Europe/Prague (via Intl, so DST rules come from the platform's time zone
 * database). Date arithmetic uses UTC internally, where every day has exactly 24 hours.
 */

export type IsoDate = string

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/

const shopFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SHOP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** Calendar date and time of day of a moment, as seen on a clock in Prague. */
export function toShopDateTime(instant: Date): { date: IsoDate; secondsOfDay: number } {
  if (Number.isNaN(instant.getTime())) throw new Error('Invalid date')
  const parts: Record<string, string> = {}
  for (const part of shopFormatter.formatToParts(instant)) parts[part.type] = part.value
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    secondsOfDay: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second),
  }
}

/** Prague calendar date of a stored date value (Payload date fields are ISO timestamps). */
export function toShopDate(value: string | Date): IsoDate {
  if (typeof value === 'string' && ISO_DATE_REGEX.test(value)) return value
  return toShopDateTime(typeof value === 'string' ? new Date(value) : value).date
}

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE_REGEX.exec(value)
  if (!match) return false
  const [, y, m, d] = match.map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

function toUtc(date: IsoDate): Date {
  const match = ISO_DATE_REGEX.exec(date)
  if (!match) throw new Error(`Invalid ISO date: ${date}`)
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

/** Builds an ISO date from numbers (month 1–12). Overflow rolls over (Dec 32 -> Jan 1). */
export function isoDate(year: number, month: number, day: number): IsoDate {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const utc = toUtc(date)
  utc.setUTCDate(utc.getUTCDate() + days)
  return utc.toISOString().slice(0, 10)
}

export function weekdayOf(date: IsoDate): Weekday {
  // getUTCDay: 0 = Sunday … 6 = Saturday; WEEKDAYS is Monday-first.
  return WEEKDAYS[(toUtc(date).getUTCDay() + 6) % 7]
}

/** Inclusive list of dates from `from` to `to` (empty when `to` is before `from`). */
export function dateRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const result: IsoDate[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) result.push(day)
  return result
}

/** "HH:MM" (24 h) -> seconds since midnight, or null when the value is not a valid time. */
export function parseTimeOfDay(value: string): number | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim())
  if (!match) return null
  return Number(match[1]) * 3600 + Number(match[2]) * 60
}

/** "2026-12-24" -> "24. 12. 2026" */
export function formatCzechDate(date: IsoDate): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${d}. ${m}. ${y}`
}
