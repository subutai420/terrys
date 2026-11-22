import type { Endpoint, PayloadRequest } from 'payload'

import { hasRole } from '@/access'
import { isIsoDate } from '@/lib/delivery/calendar'
import {
  FULFILMENT_EMAIL_KINDS,
  type FulfilmentEmailKind,
  ORDER_STATUSES,
  type OrderStatus,
} from '@/lib/orders/constants'
import { isAllowedOrigin, json, NO_STORE, readJson } from '@/orders/http'

import { packingSlipsHtml, printErrorHtml, productionSheetHtml, routeSheetHtml } from './print'
import { ordersForDay } from './queries'
import {
  type Actor,
  cancelShipment,
  changeStatus,
  closeBatchForDay,
  createShipment,
  createShipmentsForDay,
  findInvoiceDuplicate,
  labelsPdf,
  loadOrder,
  markVanDeparted,
  resendEmail,
  saveBilling,
  type ServiceResult,
  weighOrder,
} from './service'

/**
 * Stage 5 admin endpoints under /api/fulfilment/* (Payload root endpoints, logged-in users only,
 * session cookie of the admin). POSTs require the same origin (CSRF) and JSON bodies; the role
 * checks live in `service.ts`. GET endpoints return printable HTML or label PDFs.
 */

type Handler = (req: PayloadRequest, actor: Actor) => Promise<Response>

function guarded(handler: Handler, { post = false } = {}) {
  return async (req: PayloadRequest): Promise<Response> => {
    const user = req.user
    if (!user || user.collection !== 'users' || !hasRole(user, 'admin', 'staff', 'butcher')) {
      return json({ error: 'unauthorized', message: 'Přihlaste se do administrace.' }, 401)
    }
    if (post && !isAllowedOrigin(req.headers)) return json({ error: 'forbidden-origin' }, 403)
    return handler(req, user as Actor)
  }
}

const respond = (result: ServiceResult) =>
  result.ok
    ? json({
        ok: true,
        messages: result.messages,
        order: { id: result.order.id, status: result.order.status },
      })
    : json(
        {
          ok: false,
          message: result.message,
          fieldErrors: result.fieldErrors,
          details: result.details,
        },
        result.status,
      )

const idParam = (req: PayloadRequest) => String(req.routeParams?.id ?? '')

const html = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE },
  })

const pdf = (data: Buffer, name: string) =>
  new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${name}"`,
      ...NO_STORE,
    },
  })

const dateParam = (req: PayloadRequest): string | null => {
  const value = new URL(req.url ?? 'http://x').searchParams.get('date') ?? ''
  return isIsoDate(value) ? value : null
}

async function body(req: PayloadRequest): Promise<Record<string, unknown>> {
  const data = await readJson(req)
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
}

export const fulfilmentEndpoints: Endpoint[] = [
  {
    path: '/fulfilment/orders/:id/weigh',
    method: 'post',
    handler: guarded(
      async (req, actor) => {
        const data = await body(req)
        return respond(
          await weighOrder(
            req.payload,
            actor,
            idParam(req),
            {
              lines: Array.isArray(data.lines) ? (data.lines as never) : [],
              markWeighed: data.markWeighed === true,
            },
            { req },
          ),
        )
      },
      { post: true },
    ),
  },
  {
    path: '/fulfilment/orders/:id/billing',
    method: 'post',
    handler: guarded(
      async (req, actor) => {
        const data = await body(req)
        return respond(
          await saveBilling(
            req.payload,
            actor,
            idParam(req),
            {
              vouchers: Array.isArray(data.vouchers) ? (data.vouchers as never) : undefined,
              invoiceNumber:
                typeof data.invoiceNumber === 'string' || data.invoiceNumber === null
                  ? (data.invoiceNumber as string | null)
                  : undefined,
              internalNote: typeof data.internalNote === 'string' ? data.internalNote : undefined,
              finalise: data.finalise === true,
            },
            { req },
          ),
        )
      },
      { post: true },
    ),
  },
  {
    path: '/fulfilment/orders/:id/status',
    method: 'post',
    handler: guarded(
      async (req, actor) => {
        const data = await body(req)
        const to = String(data.to ?? '') as OrderStatus
        if (!(ORDER_STATUSES as readonly string[]).includes(to))
          return json({ ok: false, message: 'Neznámý stav.' }, 400)
        return respond(
          await changeStatus(
            req.payload,
            actor,
            idParam(req),
            { to, reason: typeof data.reason === 'string' ? data.reason : null },
            { req },
          ),
        )
      },
      { post: true },
    ),
  },
  {
    path: '/fulfilment/orders/:id/shipment',
    method: 'post',
    handler: guarded(
      async (req, actor) =>
        respond(await createShipment(req.payload, actor, idParam(req), { req })),
      { post: true },
    ),
  },
  {
    path: '/fulfilment/orders/:id/shipment/cancel',
    method: 'post',
    handler: guarded(
      async (req, actor) =>
        respond(await cancelShipment(req.payload, actor, idParam(req), { req })),
      { post: true },
    ),
  },
  {
    path: '/fulfilment/orders/:id/email',
    method: 'post',
    handler: guarded(
      async (req, actor) => {
        const data = await body(req)
        const kind = String(data.kind ?? '') as FulfilmentEmailKind
        if (!(FULFILMENT_EMAIL_KINDS as readonly string[]).includes(kind))
          return json({ ok: false, message: 'Neznámý e-mail.' }, 400)
        return respond(await resendEmail(req.payload, actor, idParam(req), kind, { req }))
      },
      { post: true },
    ),
  },
  {
    path: '/fulfilment/day/:action',
    method: 'post',
    handler: guarded(
      async (req, actor) => {
        const data = await body(req)
        const date = typeof data.date === 'string' && isIsoDate(data.date) ? data.date : null
        if (!date) return json({ ok: false, message: 'Chybí datum.' }, 400)
        const action = String(req.routeParams?.action ?? '')
        const run =
          action === 'create-shipments'
            ? createShipmentsForDay
            : action === 'close-batch'
              ? closeBatchForDay
              : action === 'van-departed'
                ? markVanDeparted
                : null
        if (!run) return json({ ok: false, message: 'Neznámá akce.' }, 404)
        const result = await run(req.payload, actor, date, { req })
        return result.ok
          ? json(result)
          : json({ ok: false, message: result.message }, result.status)
      },
      { post: true },
    ),
  },
  {
    path: '/fulfilment/invoice-check',
    method: 'get',
    handler: guarded(async (req) => {
      const url = new URL(req.url ?? 'http://x')
      const number = url.searchParams.get('number') ?? ''
      const duplicate = await findInvoiceDuplicate(
        req.payload,
        number,
        url.searchParams.get('exclude'),
        req,
      )
      return json({ duplicate })
    }),
  },
  {
    path: '/fulfilment/orders/:id/label',
    method: 'get',
    handler: guarded(async (req, actor) => {
      const result = await labelsPdf(req.payload, actor, [idParam(req)], { req })
      return result.ok
        ? pdf(result.pdf, `stitek-${idParam(req)}.pdf`)
        : html(printErrorHtml(result.message), result.status)
    }),
  },
  {
    path: '/fulfilment/labels',
    method: 'get',
    handler: guarded(async (req, actor) => {
      const date = dateParam(req)
      if (!date) return html(printErrorHtml('Chybí datum.'), 400)
      const orders = (await ordersForDay(req.payload, { date, type: 'courier' }, req)).filter(
        (o) => o.shipment?.packageId,
      )
      const result = await labelsPdf(
        req.payload,
        actor,
        orders.map((o) => o.id),
        { req },
      )
      return result.ok
        ? pdf(result.pdf, `stitky-${date}.pdf`)
        : html(printErrorHtml(result.message), result.status)
    }),
  },
  {
    path: '/fulfilment/print/production',
    method: 'get',
    handler: guarded(async (req) => {
      const date = dateParam(req)
      if (!date) return html(printErrorHtml('Chybí datum.'), 400)
      return html(productionSheetHtml(date, await ordersForDay(req.payload, { date }, req)))
    }),
  },
  {
    path: '/fulfilment/print/route',
    method: 'get',
    handler: guarded(async (req) => {
      const date = dateParam(req)
      if (!date) return html(printErrorHtml('Chybí datum.'), 400)
      return html(routeSheetHtml(date, await ordersForDay(req.payload, { date }, req)))
    }),
  },
  {
    path: '/fulfilment/print/packing',
    method: 'get',
    handler: guarded(async (req) => {
      const url = new URL(req.url ?? 'http://x')
      const id = url.searchParams.get('id')
      if (id) {
        const order = await loadOrder(req.payload, id, req)
        return order
          ? html(packingSlipsHtml([order]))
          : html(printErrorHtml('Objednávka neexistuje.'), 404)
      }
      const date = dateParam(req)
      if (!date) return html(printErrorHtml('Chybí datum nebo objednávka.'), 400)
      return html(packingSlipsHtml(await ordersForDay(req.payload, { date }, req)))
    }),
  },
]
