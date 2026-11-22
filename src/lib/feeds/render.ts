import { truncate } from '../text'

import { estimateNotice, type FeedItem } from './items'
import { el, escapeXml, group, money } from './xml'

/**
 * XML of the four product feeds (stage 6). Pure, validated in `feeds.test.ts`.
 * Specs read 2026-11 (details and links in CLAUDE.md "Feeds"):
 * - Google Merchant Center product data spec (RSS 2.0 + `g:` namespace),
 * - Meta catalog (same RSS format; availability with spaces, `unit_price` object),
 * - Heureka.cz XML feed (SHOP/SHOPITEM),
 * - Zboží.cz XML feed (SHOP/SHOPITEM, namespace http://www.zbozi.cz/ns/offer/1.0).
 *
 * NEVER output: `sale_price`, `SALE_PRICE`, coupons, "zdarma" extras (business rules 1 and 2).
 * Shipping = the flat delivery price from settings; 0 only for the separately expressed pickup.
 */

export type FeedContext = {
  siteUrl: string
  shopName: string
  /** settings.deliveryPrice (≥ 1, business rule 2). */
  deliveryPrice: number
  /** Comparison-site id of the courier (e.g. `PPL`). */
  courierDeliveryId: string
  /** A pickup method is active (Zboží `VLASTNI_VYDEJNI_MISTA`, price 0). */
  pickup: boolean
  inStockDeliveryDays: number
  inTransitDeliveryDays: number
  now: Date
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n'

function googleAvailability(item: FeedItem): string {
  return item.availability === 'in-stock'
    ? 'in_stock'
    : item.availability === 'in-transit'
      ? 'backorder'
      : 'out_of_stock'
}

function isoDatePlusDays(now: Date, days: number): string {
  const date = new Date(now.getTime() + days * 86400_000)
  // Merchant Center: ISO 8601 with time zone (date at noon UTC).
  return `${date.toISOString().slice(0, 10)}T12:00:00Z`
}

/** Google `unit_pricing_measure` / `unit_pricing_base_measure` ("500 g" / "1 kg" or "100 g"). */
function unitPricing(item: FeedItem): { measure: string; base: string } | null {
  if (!item.weightGrams || item.priceUnit === 'piece') return null
  return {
    measure: `${item.weightGrams} g`,
    base: item.priceUnit === '100g' ? '100 g' : '1 kg',
  }
}

// --------------------------------------------------------------------------- Google

function googleItem(item: FeedItem, ctx: FeedContext): string {
  const units = unitPricing(item)
  return group('item', [
    el('g:id', item.id),
    el('g:title', truncate(item.title, 150)),
    el('g:description', truncate(item.description, 5000)),
    el('g:link', item.link),
    el('g:image_link', item.imageLink),
    ...item.additionalImages.map((url) => el('g:additional_image_link', url)),
    el('g:availability', googleAvailability(item)),
    item.availability === 'in-transit'
      ? el('g:availability_date', isoDatePlusDays(ctx.now, ctx.inTransitDeliveryDays))
      : '',
    el('g:price', money(item.price)),
    el('g:brand', truncate(item.brand, 70)),
    el('g:identifier_exists', 'no'),
    el('g:condition', 'new'),
    el('g:google_product_category', item.categories.google),
    el('g:product_type', item.productType ? truncate(item.productType, 750) : null),
    el('g:item_group_id', item.groupId),
    item.groupId ? el('g:size', truncate(item.variantLabel ?? '', 100)) : '',
    units ? el('g:unit_pricing_measure', units.measure) : '',
    units ? el('g:unit_pricing_base_measure', units.base) : '',
    group('g:shipping', [
      el('g:country', 'CZ'),
      el('g:service', 'Kurýr / chlazený rozvoz'),
      el('g:price', money(ctx.deliveryPrice)),
    ]),
  ])
}

export function renderGoogleFeed(items: FeedItem[], ctx: FeedContext): string {
  return (
    XML_HEADER +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>' +
    el('title', ctx.shopName) +
    el('link', ctx.siteUrl) +
    el('description', `${ctx.shopName} – produkty`) +
    items.map((item) => googleItem(item, ctx)).join('\n') +
    '</channel></rss>\n'
  )
}

// --------------------------------------------------------------------------- Meta

function metaItem(item: FeedItem, ctx: FeedContext): string {
  return group('item', [
    el('g:id', item.id),
    el('g:title', truncate(item.title, 200)),
    el('g:description', truncate(item.description, 5000)),
    el('g:link', item.link),
    el('g:image_link', item.imageLink),
    ...item.additionalImages.map((url) => el('g:additional_image_link', url)),
    // Meta has no "backorder": "na cestě" goods can be ordered now (delivery date at checkout).
    el('g:availability', item.availability === 'sold-out' ? 'out of stock' : 'in stock'),
    el('g:condition', 'new'),
    el('g:price', money(item.price)),
    el('g:brand', item.brand),
    el('g:google_product_category', item.categories.google),
    el('g:product_type', item.productType || null),
    el('g:item_group_id', item.groupId),
    item.groupId ? el('g:size', truncate(item.variantLabel ?? '', 200)) : '',
    item.pricePerKg !== null && item.weightGrams
      ? group('unit_price', [
          el('value', item.pricePerKg.toFixed(2)),
          el('currency', 'CZK'),
          el('unit', 'kg'),
        ])
      : '',
    group('g:shipping', [
      el('g:country', 'CZ'),
      el('g:service', 'Kurýr / chlazený rozvoz'),
      el('g:price', money(ctx.deliveryPrice)),
    ]),
  ])
}

export function renderMetaFeed(items: FeedItem[], ctx: FeedContext): string {
  return (
    XML_HEADER +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>' +
    el('title', ctx.shopName) +
    el('link', ctx.siteUrl) +
    el('description', `${ctx.shopName} – katalog`) +
    items.map((item) => metaItem(item, ctx)).join('\n') +
    '</channel></rss>\n'
  )
}

// --------------------------------------------------------------------------- Heureka / Zboží

function deliveryDays(item: FeedItem, ctx: FeedContext): number {
  return item.availability === 'in-transit' ? ctx.inTransitDeliveryDays : ctx.inStockDeliveryDays
}

function czechDescription(item: FeedItem, max: number): string {
  const notice = estimateNotice(item)
  return truncate(notice ? `${notice} ${item.description}` : item.description, max)
}

function heurekaItem(item: FeedItem, ctx: FeedContext): string {
  return group('SHOPITEM', [
    el('ITEM_ID', item.id),
    el('PRODUCTNAME', truncate(item.title, 200)),
    el('PRODUCT', truncate(item.title, 200)),
    el('DESCRIPTION', czechDescription(item, 5000)),
    el('URL', item.link),
    el('IMGURL', item.imageLink),
    ...item.additionalImages.map((url) => el('IMGURL_ALTERNATIVE', url)),
    el('PRICE_VAT', item.price),
    el('CATEGORYTEXT', item.categories.heureka),
    // Heureka: the manufacturer must also be part of the product name.
    item.hasOwnBrand && item.title.toLowerCase().includes(item.brand.toLowerCase())
      ? el('MANUFACTURER', item.brand)
      : '',
    item.weightGrams
      ? group('PARAM', [el('PARAM_NAME', 'Hmotnost'), el('VAL', `${item.weightGrams} g`)])
      : '',
    el('DELIVERY_DATE', deliveryDays(item, ctx)),
    // Pay on delivery is the only payment: COD price = delivery price (no surcharge).
    group('DELIVERY', [
      el('DELIVERY_ID', ctx.courierDeliveryId),
      el('DELIVERY_PRICE', ctx.deliveryPrice),
      el('DELIVERY_PRICE_COD', ctx.deliveryPrice),
    ]),
  ])
}

/** Heureka: only items that can be bought now (sold-out ones are left out, per spec). */
export function renderHeurekaFeed(items: FeedItem[], ctx: FeedContext): string {
  return (
    XML_HEADER +
    '<SHOP>' +
    items
      .filter((item) => item.availability !== 'sold-out')
      .map((item) => heurekaItem(item, ctx))
      .join('\n') +
    '</SHOP>\n'
  )
}

function zboziItem(item: FeedItem, ctx: FeedContext): string {
  return group('SHOPITEM', [
    el('ITEM_ID', item.id),
    el('PRODUCTNAME', truncate(item.title, 255)),
    el('PRODUCT', truncate(item.title, 255)),
    el('DESCRIPTION', czechDescription(item, 1024)),
    el('URL', item.link),
    el('IMGURL', item.imageLink),
    ...item.additionalImages.slice(0, 20).map((url) => el('IMGURL_ALTERNATIVE', url)),
    el('PRICE_VAT', item.price),
    el('DELIVERY_DATE', deliveryDays(item, ctx)),
    el('CATEGORYTEXT', item.categories.zbozi),
    el('ITEMGROUP_ID', item.groupId),
    item.hasOwnBrand ? el('MANUFACTURER', item.brand) : '',
    item.weightGrams
      ? group('PARAM', [el('PARAM_NAME', 'Hmotnost'), el('VAL', item.weightGrams), el('UNIT', 'g')])
      : '',
    group('DELIVERY', [
      el('DELIVERY_ID', ctx.courierDeliveryId),
      el('DELIVERY_PRICE', ctx.deliveryPrice),
      el('DELIVERY_PRICE_COD', ctx.deliveryPrice),
    ]),
    ctx.pickup
      ? group('DELIVERY', [
          el('DELIVERY_ID', 'VLASTNI_VYDEJNI_MISTA'),
          el('DELIVERY_PRICE', 0),
          el('DELIVERY_PRICE_COD', 0),
        ])
      : '',
  ])
}

/** Zboží.cz: only items that can be bought now (no out-of-stock value in the spec). */
export function renderZboziFeed(items: FeedItem[], ctx: FeedContext): string {
  return (
    XML_HEADER +
    '<SHOP xmlns="http://www.zbozi.cz/ns/offer/1.0">' +
    items
      .filter((item) => item.availability !== 'sold-out')
      .map((item) => zboziItem(item, ctx))
      .join('\n') +
    '</SHOP>\n'
  )
}

export function countRendered(xml: string, tag: 'item' | 'SHOPITEM'): number {
  return xml.split(`<${tag}>`).length - 1
}

export { escapeXml }
