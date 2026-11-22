import type { Endpoint } from 'payload'

import { rateLimited, TOO_MANY } from '@/orders/http'

import { deliveryOptionsResponse } from './options'

/**
 * Public endpoint for the cart: `GET /api/delivery/options?psc=12000`.
 * No login needed; returns only customer-facing data (see `PublicDeliveryOptions`).
 */
export const deliveryOptionsEndpoint: Endpoint = {
  path: '/delivery/options',
  method: 'get',
  // Stage 9: per-IP rate limit (429 is never cached: TOO_MANY sends no-store).
  handler: (req) =>
    rateLimited('delivery', req)
      ? TOO_MANY()
      : deliveryOptionsResponse(req.payload, req.searchParams),
}
