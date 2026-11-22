import type { Endpoint, PayloadRequest } from 'payload'

import { isAdminUser } from '@/access'
import { normaliseEmail } from '@/lib/privacy/anonymise'
import { isAllowedOrigin, json, readJson } from '@/orders/http'

import { anonymise, exportPersonalData } from './service'

/**
 * Stage 9 (GDPR) endpoints – ADMIN ONLY (role admin), used by the admin view
 * "Osobní údaje (GDPR)" (/admin/osobni-udaje):
 * - `GET  /api/privacy/export?email=…` – JSON file with everything held about the address,
 * - `POST /api/privacy/anonymise` `{ email } | { olderThanMonths }` + `confirm: true` to really
 *   do it; without `confirm` it is a dry run that only lists what would change.
 */

const MIN_RETENTION_MONTHS = 1

function denied(req: PayloadRequest): Response | null {
  if (!req.user) return json({ ok: false, message: 'Přihlaste se.' }, 401)
  if (req.user.collection !== 'users' || !isAdminUser(req.user)) {
    return json({ ok: false, message: 'Jen pro administrátora.' }, 403)
  }
  return null
}

export const privacyEndpoints: Endpoint[] = [
  {
    path: '/privacy/export',
    method: 'get',
    handler: async (req) => {
      const refused = denied(req)
      if (refused) return refused
      const email = normaliseEmail(req.searchParams.get('email'))
      if (!email) return json({ ok: false, message: 'Zadejte platný e-mail.' }, 400)
      const data = await exportPersonalData(req.payload, email)
      req.payload.logger.info(
        `[privacy] export by user ${req.user?.id}: ${data.counts.orders} orders, ${data.counts.withdrawals} withdrawals`,
      )
      const date = data.generatedAt.slice(0, 10)
      return new Response(JSON.stringify(data, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="osobni-udaje-${date}.json"`,
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex',
        },
      })
    },
  },
  {
    path: '/privacy/anonymise',
    method: 'post',
    handler: async (req) => {
      const refused = denied(req)
      if (refused) return refused
      if (!isAllowedOrigin(req.headers)) return json({ ok: false, message: 'Neplatný původ.' }, 403)
      const body = ((await readJson(req)) ?? {}) as Record<string, unknown>
      const confirm = body.confirm === true
      const actor = {
        id: Number(req.user!.id),
        email: (req.user as { email?: string }).email ?? null,
      }
      if (body.email !== undefined && body.email !== null && body.email !== '') {
        const email = normaliseEmail(body.email)
        if (!email) return json({ ok: false, message: 'Zadejte platný e-mail.' }, 400)
        return json({ ok: true, ...(await anonymise(req.payload, { email }, { confirm, actor })) })
      }
      const months = Number(body.olderThanMonths)
      if (!Number.isInteger(months) || months < MIN_RETENTION_MONTHS || months > 600) {
        return json(
          { ok: false, message: 'Zadejte e-mail, nebo stáří objednávek v celých měsících.' },
          400,
        )
      }
      return json({
        ok: true,
        ...(await anonymise(req.payload, { olderThanMonths: months }, { confirm, actor })),
      })
    },
  },
]
