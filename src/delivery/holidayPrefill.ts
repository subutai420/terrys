import type { Payload, PayloadRequest } from 'payload'

import { type IsoDate, toShopDate } from '@/lib/delivery/calendar'
import { czechPublicHolidays } from '@/lib/delivery/holidays'

export type HolidayPrefillResult = {
  year: number
  created: { date: IsoDate; name: string }[]
  /** Holidays already covered by an existing "closed for everything" exception, or past. */
  skipped: number
}

/**
 * Pre-fills Czech public holidays of `year` as ordinary "closed for everything" exceptions.
 * A holiday is skipped when it is already in the past (before `today`) or when an existing
 * all-scope closed exception (single day or range) already covers it. Running it twice creates
 * nothing new. The records can then be edited or deleted in the admin like any other.
 *
 * Note: a holiday the admin deleted is created again if the pre-fill is run again for that year.
 */
export async function prefillHolidayExceptions(
  payload: Payload,
  { year, today, req }: { year: number; today: IsoDate; req?: PayloadRequest },
): Promise<HolidayPrefillResult> {
  const holidays = czechPublicHolidays(year)
  const existing = await payload.find({
    collection: 'delivery-exceptions',
    where: {
      and: [
        { scope: { equals: 'all' } },
        { kind: { equals: 'closed' } },
        { dateFrom: { less_than_equal: `${year}-12-31T23:59:59.999Z` } },
      ],
    },
    depth: 0,
    pagination: false,
    req,
  })
  const ranges = existing.docs.map((doc) => {
    const from = toShopDate(doc.dateFrom)
    return { from, to: doc.dateTo ? toShopDate(doc.dateTo) : from }
  })

  const result: HolidayPrefillResult = { year, created: [], skipped: 0 }
  for (const holiday of holidays) {
    const covered = ranges.some((r) => r.from <= holiday.date && holiday.date <= r.to)
    if (holiday.date < today || covered) {
      result.skipped++
      continue
    }
    await payload.create({
      collection: 'delivery-exceptions',
      data: {
        // Noon UTC is the same calendar day in Prague in winter and summer time.
        dateFrom: `${holiday.date}T12:00:00.000Z`,
        reason: holiday.name,
        kind: 'closed',
        scope: 'all',
      },
      req,
    })
    result.created.push(holiday)
  }
  return result
}
