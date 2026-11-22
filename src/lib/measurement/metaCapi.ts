import { createHash } from 'crypto'

import { itemId } from './ids'
import { round2 } from './items'

/**
 * Meta Conversions API – pure payload builder (stage 6). Server only (uses node:crypto).
 * Spec (read 2026-11): https://developers.facebook.com/docs/marketing-api/conversions-api/
 * parameters/server-event, …/customer-information-parameters, …/custom-data.
 *
 * - `event_id` = `orders.eventId` = the browser pixel `eventID` (dataLayer `event_id` of the
 *   purchase push) → Meta deduplicates the pair (same event_name + event_id, 48 h window).
 * - `event_source_url` is built from NEXT_PUBLIC_SERVER_URL (the real site), never from request
 *   headers – a reverse-proxy clone cannot put its hostname into our events.
 * - user data hashed with SHA-256 after Meta's normalisation; `client_ip_address`,
 *   `client_user_agent`, `fbp`, `fbc` are sent unhashed (Meta forbids hashing them).
 * - value = estimated GOODS value incl. VAT without delivery (same as GA4 `value` and the
 *   browser pixel), currency CZK.
 */

export const META_GRAPH_VERSION = 'v27.0'

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export const normalize = {
  email: (value: string) => value.trim().toLowerCase(),
  /** Digits with country code, no leading zeros/plus: "602 123 456" → "420602123456". */
  phone: (value: string) => {
    let digits = value.replace(/\D/g, '')
    if (value.trim().startsWith('00')) digits = digits.slice(2)
    else if (!value.trim().startsWith('+') && digits.length === 9) digits = `420${digits}`
    return digits.replace(/^0+/, '')
  },
  /** Lowercase, no punctuation (UTF-8 letters kept). */
  name: (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[\p{P}\p{S}]/gu, '')
      .replace(/\s+/g, ' '),
  /** Lowercase, no punctuation and no spaces: "Praha 2" → "praha2". */
  city: (value: string) => value.toLowerCase().replace(/[\p{P}\p{S}\s]/gu, ''),
  zip: (value: string) => value.toLowerCase().replace(/[\s-]/g, ''),
}

export type CapiRequestContext = {
  ip?: string | null
  userAgent?: string | null
  /** `_fbp` cookie. */
  fbp?: string | null
  /** `_fbc` cookie (or built from the fbclid of the first visit). */
  fbc?: string | null
}

export type CapiOrder = {
  orderNumber: string
  eventId: string
  createdAt: string
  goodsEstimate: number
  customer: {
    email: string
    phone?: string | null
    firstName?: string | null
    lastName?: string | null
  }
  address?: { city?: string | null; postcode?: string | null } | null
  lines: {
    productId: number | null
    variantId?: string | null
    quantity: number
    estimatedPrice: number
  }[]
  attribution?: { fbclid?: string | null; firstSeenAt?: string | null } | null
}

/** `fb.1.<ms>.<fbclid>` from the first-visit attribution when the browser has no `_fbc`. */
export function fbcFromAttribution(attribution: CapiOrder['attribution']): string | null {
  const fbclid = attribution?.fbclid?.trim()
  if (!fbclid || !/^[A-Za-z0-9_-]{10,500}$/.test(fbclid)) return null
  const time = attribution?.firstSeenAt ? Date.parse(attribution.firstSeenAt) : NaN
  return `fb.1.${Number.isFinite(time) ? time : Date.now()}.${fbclid}`
}

export type CapiEvent = {
  event_name: 'Purchase'
  event_time: number
  event_id: string
  action_source: 'website'
  event_source_url: string
  user_data: Record<string, string | string[]>
  custom_data: {
    currency: 'CZK'
    value: number
    content_type: 'product'
    content_ids: string[]
    contents: { id: string; quantity: number; item_price: number }[]
    num_items: number
    order_id: string
  }
}

export function buildPurchaseEvent(
  order: CapiOrder,
  context: CapiRequestContext,
  siteUrl: string,
): CapiEvent {
  const user: Record<string, string | string[]> = {
    em: [sha256(normalize.email(order.customer.email))],
    country: [sha256('cz')],
  }
  const phone = order.customer.phone ? normalize.phone(order.customer.phone) : ''
  if (phone.length >= 11) user.ph = [sha256(phone)]
  if (order.customer.firstName?.trim()) user.fn = [sha256(normalize.name(order.customer.firstName))]
  if (order.customer.lastName?.trim()) user.ln = [sha256(normalize.name(order.customer.lastName))]
  if (order.address?.city?.trim()) user.ct = [sha256(normalize.city(order.address.city))]
  if (order.address?.postcode?.trim()) user.zp = [sha256(normalize.zip(order.address.postcode))]
  if (context.ip) user.client_ip_address = context.ip
  if (context.userAgent) user.client_user_agent = context.userAgent
  if (context.fbp) user.fbp = context.fbp
  const fbc = context.fbc || fbcFromAttribution(order.attribution)
  if (fbc) user.fbc = fbc

  const contents = order.lines
    .filter((line) => line.productId !== null)
    .map((line) => ({
      id: itemId(line.productId as number, line.variantId),
      quantity: line.quantity,
      item_price: round2(line.estimatedPrice / Math.max(1, line.quantity)),
    }))

  return {
    event_name: 'Purchase',
    event_time: Math.floor(Date.parse(order.createdAt) / 1000),
    event_id: order.eventId,
    action_source: 'website',
    event_source_url: `${siteUrl.replace(/\/+$/, '')}/objednavka`,
    user_data: user,
    custom_data: {
      currency: 'CZK',
      value: order.goodsEstimate,
      content_type: 'product',
      content_ids: contents.map((c) => c.id),
      contents,
      num_items: contents.reduce((sum, c) => sum + c.quantity, 0),
      order_id: order.orderNumber,
    },
  }
}

/** Meta refuses the whole request when an event is older than 7 days. */
export function isTooOld(event: Pick<CapiEvent, 'event_time'>, now: Date): boolean {
  return now.getTime() / 1000 - event.event_time > 7 * 24 * 3600 - 600
}

export function capiEndpoint(pixelId: string, version = META_GRAPH_VERSION): string {
  return `https://graph.facebook.com/${version}/${encodeURIComponent(pixelId)}/events`
}

/** Request body; `test_event_code` only while testing in Events Manager. */
export function capiBody(events: CapiEvent[], accessToken: string, testEventCode?: string) {
  return {
    data: events,
    access_token: accessToken,
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  }
}

/** Strips what we do not keep after a successful send (IP, user agent). */
export function redactEvent(event: CapiEvent): CapiEvent {
  const { client_ip_address: _ip, client_user_agent: _ua, ...user } = event.user_data
  void _ip
  void _ua
  return { ...event, user_data: user }
}
