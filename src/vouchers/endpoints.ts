import type { Endpoint, PayloadRequest } from 'payload'

import { hasRole } from '@/access'
import { cronSecret } from '@/integrations/config'
import { isAllowedOrigin, json, NO_STORE, readJson } from '@/orders/http'
import type { Voucher } from '@/payload-types'

import { orderVouchers, vouchersPdf } from './emails'
import {
  type Actor,
  cancelVoucherOrder,
  createLegacyVoucher,
  importLegacyVouchers,
  issuePrintedVouchers,
  markVoucherOrderPaid,
  processOverdueVoucherOrders,
  searchVouchers,
  sendPaymentReminder,
  undoVoucherOrderPaid,
  type VoucherResult,
} from './service'
import { getVoucherSettings } from './settings'

/**
 * Stage 7 endpoints under /api/gift-vouchers/*.
 *
 * Public: `GET /api/gift-vouchers/pdf/:token` – the PDF of an order's electronic vouchers, found by the
 * order's secret access token (the thank-you page / e-mail link; never by order number).
 * Admin (admin + staff, session cookie; POSTs same-origin): payment marking, undo, cancel,
 * reminder, printed vouchers, search, legacy vouchers, CSV import, staff PDF downloads.
 * Cron: `GET /api/gift-vouchers/overdue` with `Authorization: Bearer $CRON_SECRET`.
 */

type Handler = (req: PayloadRequest, actor: Actor) => Promise<Response>

function editorsOnly(handler: Handler, { post = false } = {}) {
  return async (req: PayloadRequest): Promise<Response> => {
    const user = req.user
    if (!user || user.collection !== 'users' || !hasRole(user, 'admin', 'staff')) {
      return json({ error: 'unauthorized', message: 'Poukazy spravuje jen obsluha.' }, 401)
    }
    if (post && !isAllowedOrigin(req.headers)) return json({ error: 'forbidden-origin' }, 403)
    return handler(req, user as Actor)
  }
}

const respond = <T extends Record<string, unknown>>(
  result: VoucherResult<T>,
  pick?: (r: T) => unknown,
) =>
  result.ok
    ? json({
        ok: true,
        messages: result.messages,
        ...(pick ? { data: pick(result as never) } : {}),
      })
    : json({ ok: false, message: result.message, fieldErrors: result.fieldErrors }, result.status)

const idParam = (req: PayloadRequest) => Number(req.routeParams?.id ?? NaN)

async function body(req: PayloadRequest): Promise<Record<string, unknown>> {
  const data = await readJson(req)
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
}

const pdfResponse = (data: Buffer, name: string) =>
  new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${name}"`,
      'X-Robots-Tag': 'noindex',
      ...NO_STORE,
    },
  })

const notFound = () =>
  new Response('Poukaz nenalezen.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...NO_STORE },
  })

const printable = (vouchers: Voucher[]) => vouchers.filter((v) => v.status !== 'cancelled')

export const voucherEndpoints: Endpoint[] = [
  {
    path: '/gift-vouchers/pdf/:token',
    method: 'get',
    handler: async (req) => {
      const token = String(req.routeParams?.token ?? '')
      if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return notFound()
      const found = await req.payload.find({
        collection: 'orders',
        where: { accessToken: { equals: token } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        select: { orderNumber: true },
      })
      const order = found.docs[0]
      if (!order) return notFound()
      const vouchers = printable(await orderVouchers(req.payload, order.id)).filter(
        (v) => v.type === 'electronic',
      )
      if (!vouchers.length) return notFound()
      const settings = await getVoucherSettings(req.payload)
      return pdfResponse(
        await vouchersPdf(vouchers, settings),
        `darkovy-poukaz-terrys-${order.orderNumber}.pdf`,
      )
    },
  },
  {
    path: '/gift-vouchers/orders/:id/pdf',
    method: 'get',
    handler: editorsOnly(async (req) => {
      const vouchers = printable(await orderVouchers(req.payload, idParam(req)))
      if (!vouchers.length) return notFound()
      const settings = await getVoucherSettings(req.payload)
      return pdfResponse(await vouchersPdf(vouchers, settings), `poukazy-${idParam(req)}.pdf`)
    }),
  },
  {
    path: '/gift-vouchers/:id/pdf',
    method: 'get',
    handler: editorsOnly(async (req) => {
      try {
        const voucher = await req.payload.findByID({
          collection: 'vouchers',
          id: idParam(req),
          depth: 0,
          overrideAccess: true,
        })
        const settings = await getVoucherSettings(req.payload)
        return pdfResponse(await vouchersPdf([voucher], settings), `poukaz-${voucher.code}.pdf`)
      } catch {
        return notFound()
      }
    }),
  },
  {
    path: '/gift-vouchers/orders/:id/paid',
    method: 'post',
    handler: editorsOnly(
      async (req, actor) => {
        const data = await body(req)
        return respond(
          await markVoucherOrderPaid(
            req.payload,
            actor,
            idParam(req),
            { paidOn: typeof data.paidOn === 'string' ? data.paidOn : null },
            { req },
          ),
        )
      },
      { post: true },
    ),
  },
  {
    path: '/gift-vouchers/orders/:id/unpaid',
    method: 'post',
    handler: editorsOnly(
      async (req, actor) => {
        const data = await body(req)
        return respond(
          await undoVoucherOrderPaid(
            req.payload,
            actor,
            idParam(req),
            { reason: typeof data.reason === 'string' ? data.reason : null },
            { req },
          ),
        )
      },
      { post: true },
    ),
  },
  {
    path: '/gift-vouchers/orders/:id/cancel',
    method: 'post',
    handler: editorsOnly(
      async (req, actor) => {
        const data = await body(req)
        return respond(
          await cancelVoucherOrder(
            req.payload,
            actor,
            idParam(req),
            { reason: typeof data.reason === 'string' ? data.reason : '' },
            { req },
          ),
        )
      },
      { post: true },
    ),
  },
  {
    path: '/gift-vouchers/orders/:id/remind',
    method: 'post',
    handler: editorsOnly(
      async (req, actor) =>
        respond(await sendPaymentReminder(req.payload, actor, idParam(req), { req })),
      { post: true },
    ),
  },
  {
    path: '/gift-vouchers/orders/:id/issue-printed',
    method: 'post',
    handler: editorsOnly(
      async (req, actor) =>
        respond(await issuePrintedVouchers(req.payload, actor, idParam(req), { req }), (r) =>
          r.vouchers.map((v) => ({ id: v.id, code: v.code, value: v.value, status: v.status })),
        ),
      { post: true },
    ),
  },
  {
    path: '/gift-vouchers/search',
    method: 'get',
    handler: editorsOnly(async (req, actor) => {
      const q = new URL(req.url ?? 'http://x').searchParams.get('q') ?? ''
      return respond(await searchVouchers(req.payload, actor, q), (r) => r.vouchers)
    }),
  },
  {
    path: '/gift-vouchers/legacy',
    method: 'post',
    handler: editorsOnly(
      async (req, actor) => {
        const data = await body(req)
        return respond(
          await createLegacyVoucher(
            req.payload,
            actor,
            {
              code: String(data.code ?? ''),
              value: Number(data.value),
              balance:
                data.balance === undefined || data.balance === null || data.balance === ''
                  ? null
                  : Number(data.balance),
              expiresOn: String(data.expiresOn ?? ''),
              note: typeof data.note === 'string' ? data.note : null,
            },
            { req },
          ),
          (r) => r.voucher,
        )
      },
      { post: true },
    ),
  },
  {
    path: '/gift-vouchers/import',
    method: 'post',
    handler: editorsOnly(
      async (req, actor) => {
        const data = await body(req)
        return respond(
          await importLegacyVouchers(req.payload, actor, String(data.csv ?? ''), { req }),
          (r) => ({ created: r.created, skipped: r.skipped, errors: r.errors }),
        )
      },
      { post: true },
    ),
  },
  {
    path: '/gift-vouchers/overdue',
    method: 'get',
    handler: async (req) => {
      const secret = cronSecret()
      if (!secret) return json({ ok: false, error: 'CRON_SECRET not set' }, 503)
      if (req.headers.get('authorization') !== `Bearer ${secret}`) {
        return json({ ok: false, error: 'unauthorized' }, 401)
      }
      return json({ ok: true, ...(await processOverdueVoucherOrders(req.payload)) })
    },
  },
]
