import type { Endpoint } from 'payload'
import { z } from 'zod'

import { cartLineInputSchema } from '@/lib/orders/checkoutSchema'
import { MAX_ORDER_LINES } from '@/lib/orders/constants'
import { clientIp } from '@/lib/orders/rateLimit'

import { checkCart } from './catalog'
import { checkAddress, foxentryEnabled } from './foxentry'
import { FORBIDDEN_ORIGIN, isAllowedOrigin, json, rateLimited, readJson, TOO_MANY } from './http'
import { placeOrder } from './placeOrder'
import { submitWithdrawal } from './withdrawal'

/**
 * Public checkout endpoints (stage 4), registered in `payload.config.ts`, all `POST`, JSON in and
 * out, `Cache-Control: no-store`, same-origin check, per-IP rate limit:
 *
 * - `/api/checkout/validate-cart`  – re-validates the browser cart against the catalog,
 * - `/api/checkout/place-order`    – places the order (`placeOrder()`),
 * - `/api/checkout/address-check`  – optional Foxentry address check,
 * - `/api/checkout/withdrawal`     – online withdrawal from the contract.
 *
 * Why endpoints and not Server Actions: they keep working across deployments (Server Action ids
 * change with every build, a customer with an open checkout would get "Failed to find Server
 * Action"), they are easy to call from integration tests, and they mirror the stage 2
 * `/api/delivery/options` endpoint.
 */

const cartBody = z.object({
  lines: z
    .array(
      cartLineInputSchema.extend({
        snapshot: z
          .object({
            title: z.string().max(300).optional(),
            variantLabel: z.string().max(200).nullable().optional(),
            unitPrice: z.number().optional(),
            weightGrams: z.number().nullable().optional(),
          })
          .optional(),
      }),
    )
    .max(MAX_ORDER_LINES),
})

const addressBody = z.object({
  street: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100),
  postcode: z.string().trim().max(10),
})

export const checkoutEndpoints: Endpoint[] = [
  {
    path: '/checkout/validate-cart',
    method: 'post',
    handler: async (req) => {
      if (!isAllowedOrigin(req.headers)) return FORBIDDEN_ORIGIN()
      if (rateLimited('cart', req)) return TOO_MANY()
      const parsed = cartBody.safeParse(await readJson(req))
      if (!parsed.success) return json({ ok: false, error: 'invalid-input' }, 400)
      const result = await checkCart(req.payload, parsed.data.lines)
      return json({ ok: true, ...result })
    },
  },
  {
    path: '/checkout/place-order',
    method: 'post',
    handler: async (req) => {
      if (!isAllowedOrigin(req.headers)) return FORBIDDEN_ORIGIN()
      if (rateLimited('placeOrder', req)) return TOO_MANY()
      const body = await readJson(req)
      if (body === null) {
        return json({ ok: false, error: 'invalid-input', message: 'Neplatný požadavek.' }, 400)
      }
      try {
        const result = await placeOrder(req.payload, body, {
          ip: clientIp(req.headers),
          // Stage 6: consent cookie, _fbp/_fbc and user agent for Meta CAPI.
          cookieHeader: req.headers.get('cookie'),
          userAgent: req.headers.get('user-agent'),
        })
        return json(result, result.ok ? 200 : result.status)
      } catch (error) {
        req.payload.logger.error(`[orders] place-order failed: ${String(error)}`)
        return json(
          {
            ok: false,
            error: 'server-error',
            message:
              'Objednávku se nepodařilo odeslat. Zkuste to prosím znovu, nebo nám zavolejte – omlouváme se.',
          },
          500,
        )
      }
    },
  },
  {
    path: '/checkout/address-check',
    method: 'post',
    handler: async (req) => {
      if (!isAllowedOrigin(req.headers)) return FORBIDDEN_ORIGIN()
      if (!foxentryEnabled()) return json({ ok: true, enabled: false })
      if (rateLimited('address', req)) return TOO_MANY()
      const parsed = addressBody.safeParse(await readJson(req))
      if (!parsed.success) return json({ ok: false, error: 'invalid-input' }, 400)
      const result = await checkAddress({
        ...parsed.data,
        postcode: parsed.data.postcode.replace(/\s/g, ''),
      })
      return json({ ok: true, enabled: true, ...result })
    },
  },
  {
    path: '/checkout/withdrawal',
    method: 'post',
    handler: async (req) => {
      if (!isAllowedOrigin(req.headers)) return FORBIDDEN_ORIGIN()
      if (rateLimited('withdrawal', req)) return TOO_MANY()
      const body = await readJson(req)
      if (body === null)
        return json({ ok: false, error: 'invalid-input', message: 'Neplatný požadavek.' }, 400)
      const result = await submitWithdrawal(req.payload, body, { ip: clientIp(req.headers) })
      return json(result, result.ok ? 200 : result.status)
    },
  },
]
