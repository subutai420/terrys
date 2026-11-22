import type { Endpoint } from 'payload'

import { deliveryOptionsResponse } from './options'

/**
 * Public endpoint for the cart: `GET /api/delivery/options?psc=12000`.
 * No login needed; returns only customer-facing data (see `PublicDeliveryOptions`).
 */
export const deliveryOptionsEndpoint: Endpoint = {
  path: '/delivery/options',
  method: 'get',
  handler: (req) => deliveryOptionsResponse(req.payload, req.searchParams),
}
