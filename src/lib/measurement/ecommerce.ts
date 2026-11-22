import { vatRateToNumber } from '../catalog'

import { type Ga4Item, itemsValue, round2 } from './items'

/**
 * GA4 e-commerce dataLayer messages (stage 6) – the typed builders behind `src/lib/analytics.ts`.
 * Pure, unit-tested in `ecommerce.test.ts`. Schema: GA4 recommended events
 * (https://developers.google.com/analytics/devguides/collection/ga4/reference/events).
 *
 * VALUE CONVENTION (documented in README for the marketer):
 * - `ecommerce.value` = Σ item price × quantity = the ESTIMATED GOODS value INCLUDING VAT and
 *   WITHOUT delivery. GA4 says value excludes shipping and tax; Czech consumer prices are VAT-
 *   inclusive and our item prices are VAT-inclusive, so value stays consistent with the items
 *   (GA4 checks value against items) – the VAT included is reported separately as `tax`.
 * - `ecommerce.shipping` = delivery price (229 or 0 for pickup), `ecommerce.tax` = VAT contained
 *   in the whole order (goods + delivery), purchase only.
 * - extra top-level keys on `purchase` for other tags: `value_net` (goods without VAT – e.g. for a
 *   Google Ads conversion value net of VAT, or Zboží/Seznam which wants value without VAT),
 *   `value_tax_goods`, `order_total` (goods + delivery incl. VAT), `delivery_price`.
 * - every value is an ESTIMATE (`value_is_estimate: true`): the final price follows the weighed
 *   amount (business rule 4). The estimate is what we know at order time (±15 %).
 * Never: `coupon`, `discount` (business rule 1).
 */

export const CURRENCY = 'CZK' as const

export type EcommerceEventName =
  | 'view_item_list'
  | 'select_item'
  | 'view_item'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'view_cart'
  | 'begin_checkout'
  | 'add_shipping_info'
  | 'purchase'

export type EcommerceObject = {
  currency: typeof CURRENCY
  value?: number
  items: Ga4Item[]
  item_list_id?: string
  item_list_name?: string
  transaction_id?: string
  shipping?: number
  tax?: number
  shipping_tier?: string
}

/** One dataLayer message. `event_id` is unique per push (Meta pixel `eventID` in GTM). */
export type EcommercePush = {
  event: EcommerceEventName
  event_id: string
  value_is_estimate: true
  ecommerce: EcommerceObject
  [extra: string]: unknown
}

type Base = { eventId: string }

function push(
  event: EcommerceEventName,
  eventId: string,
  ecommerce: EcommerceObject,
  extra: Record<string, unknown> = {},
): EcommercePush {
  return { event, event_id: eventId, value_is_estimate: true, ...extra, ecommerce }
}

const withValue = (items: Ga4Item[]): EcommerceObject => ({
  currency: CURRENCY,
  value: itemsValue(items),
  items,
})

export function viewItemList(
  input: Base & { listId: string; listName: string; items: Ga4Item[] },
): EcommercePush {
  return push('view_item_list', input.eventId, {
    currency: CURRENCY,
    item_list_id: input.listId,
    item_list_name: input.listName,
    items: input.items,
  })
}

export function selectItem(
  input: Base & { listId: string; listName: string; item: Ga4Item },
): EcommercePush {
  return push('select_item', input.eventId, {
    currency: CURRENCY,
    item_list_id: input.listId,
    item_list_name: input.listName,
    items: [input.item],
  })
}

export function viewItem(input: Base & { item: Ga4Item }): EcommercePush {
  return push('view_item', input.eventId, withValue([input.item]))
}

export function addToCart(input: Base & { items: Ga4Item[] }): EcommercePush {
  return push('add_to_cart', input.eventId, withValue(input.items))
}

export function removeFromCart(input: Base & { items: Ga4Item[] }): EcommercePush {
  return push('remove_from_cart', input.eventId, withValue(input.items))
}

export function viewCart(input: Base & { items: Ga4Item[] }): EcommercePush {
  return push('view_cart', input.eventId, withValue(input.items))
}

export function beginCheckout(input: Base & { items: Ga4Item[] }): EcommercePush {
  return push('begin_checkout', input.eventId, withValue(input.items))
}

export function addShippingInfo(
  input: Base & { items: Ga4Item[]; shippingTier: string; deliveryDate: string },
): EcommercePush {
  return push(
    'add_shipping_info',
    input.eventId,
    { ...withValue(input.items), shipping_tier: input.shippingTier },
    { delivery_date: input.deliveryDate },
  )
}

// --------------------------------------------------------------------------- purchase

export type PurchaseLine = {
  /** Estimate of the whole line incl. VAT (whole CZK, as stored on the order). */
  estimatedPrice: number
  quantity: number
  vatRate: string
}

/** Goods value without VAT: per VAT rate base = round(gross × 100 / (100 + rate)) in haléře. */
export function goodsNet(lines: PurchaseLine[]): number {
  const grossByRate = new Map<number, number>()
  for (const line of lines) {
    const rate = vatRateToNumber(line.vatRate)
    grossByRate.set(rate, (grossByRate.get(rate) ?? 0) + Math.round(line.estimatedPrice * 100))
  }
  let base = 0
  for (const [rate, gross] of grossByRate) base += Math.round((gross * 100) / (100 + rate))
  return base / 100
}

/**
 * Enhanced conversions / advanced matching data in the shape of the GTM "User-Provided Data"
 * variable (code option): https://support.google.com/google-ads/answer/13262500. Unhashed –
 * Google and the Meta pixel normalise and hash it themselves. Pushed ONLY on the thank-you page
 * and ONLY with marketing consent (see `PurchaseEvent.tsx`).
 */
export type UserProvidedData = {
  email: string
  phone_number?: string
  address?: {
    first_name?: string
    last_name?: string
    street?: string
    city?: string
    postal_code?: string
    country: 'CZ'
  }
}

/** Czech phone to E.164: "602 123 456" → "+420602123456"; null when it does not look right. */
export function phoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  let digits = trimmed.replace(/\D/g, '')
  if (trimmed.startsWith('00')) digits = digits.slice(2)
  else if (!trimmed.startsWith('+') && digits.length === 9) digits = `420${digits}`
  if (digits.length < 11 || digits.length > 15) return null
  return `+${digits}`
}

export function buildUserData(input: {
  email: string
  phone?: string | null
  firstName?: string | null
  lastName?: string | null
  street?: string | null
  city?: string | null
  postcode?: string | null
}): UserProvidedData {
  const clean = (value: string | null | undefined) => value?.trim() || undefined
  const data: UserProvidedData = { email: input.email.trim().toLowerCase() }
  const phone = phoneE164(input.phone)
  if (phone) data.phone_number = phone
  const address = {
    first_name: clean(input.firstName),
    last_name: clean(input.lastName),
    street: clean(input.street),
    city: clean(input.city),
    postal_code: clean(input.postcode?.replace(/\s/g, '')),
    country: 'CZ' as const,
  }
  data.address = Object.fromEntries(
    Object.entries(address).filter(([, value]) => value !== undefined),
  ) as UserProvidedData['address']
  return data
}

export type PurchaseInput = Base & {
  orderNumber: string
  items: Ga4Item[]
  lines: PurchaseLine[]
  goodsEstimate: number
  deliveryPrice: number
  totalEstimate: number
  /** VAT rows of the order (goods + delivery). */
  vat: { vat?: number | null }[]
  shippingTier: string
  /** Zboží/Heureka feed delivery id of the method (e.g. `PPL`, `VLASTNI_VYDEJNI_MISTA`). */
  deliveryType?: string | null
  userData?: UserProvidedData | null
}

/**
 * `purchase`: `transaction_id` = order number, `event_id` = `orders.eventId` (the same id the
 * server sends to Meta CAPI – deduplication). Fired once per order (`PurchaseEvent.tsx`).
 */
export function purchase(input: PurchaseInput): EcommercePush {
  const tax = round2(input.vat.reduce((sum, row) => sum + (row.vat ?? 0), 0))
  const net = goodsNet(input.lines)
  const extra: Record<string, unknown> = {
    value_net: net,
    value_tax_goods: round2(input.goodsEstimate - net),
    order_total: input.totalEstimate,
    delivery_price: input.deliveryPrice,
  }
  if (input.deliveryType) extra.delivery_type = input.deliveryType
  if (input.userData) extra.user_data = input.userData
  return push(
    'purchase',
    input.eventId,
    {
      currency: CURRENCY,
      transaction_id: input.orderNumber,
      // Σ line estimates (= goods estimate); items carry price per piece with haléře so they add up.
      value: input.goodsEstimate,
      tax,
      shipping: input.deliveryPrice,
      // Stage 7: an electronic voucher order has no delivery → no shipping_tier (shipping 0).
      ...(input.shippingTier ? { shipping_tier: input.shippingTier } : {}),
      items: input.items,
    },
    extra,
  )
}
