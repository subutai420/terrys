import type { Endpoint } from 'payload'

import { isEditorUser } from '@/access'
import { toShopDateTime } from '@/lib/delivery/calendar'

import { prefillHolidayExceptions } from './holidayPrefill'

/**
 * `POST /api/delivery-exceptions/prefill-holidays` with JSON `{ "year": 2027 }`.
 * Administrators and staff (the same people who may edit exceptions).
 */
export const prefillHolidaysEndpoint: Endpoint = {
  path: '/prefill-holidays',
  method: 'post',
  handler: async (req) => {
    if (!isEditorUser(req.user)) {
      return Response.json({ message: 'Nemáte oprávnění upravovat výjimky.' }, { status: 403 })
    }
    const body = (req.json ? await req.json().catch(() => ({})) : {}) as { year?: unknown }
    const today = toShopDateTime(new Date()).date
    const currentYear = Number(today.slice(0, 4))
    const year = Number(body.year)
    if (!Number.isInteger(year) || year < currentYear || year > currentYear + 5) {
      return Response.json(
        { message: `Zadejte rok ${currentYear}–${currentYear + 5}.` },
        { status: 400 },
      )
    }
    const result = await prefillHolidayExceptions(req.payload, { year, today, req })
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  },
}
