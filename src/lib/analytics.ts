/**
 * Analytics hooks → GTM dataLayer (stage 6).
 *
 * Every e-commerce message is built by the typed builders in `src/lib/measurement/ecommerce.ts`
 * (GA4 recommended events) and pushed here as
 *
 *   dataLayer.push({ ecommerce: null })   // clear the previous ecommerce object (Google's rule)
 *   dataLayer.push({ event, event_id, value_is_estimate: true, ecommerce: { … } })
 *
 * Pushing to `window.dataLayer` stores nothing and sends nothing by itself: GTM (loaded only on
 * allowed hostnames, `src/components/storefront/GtmScript.tsx`) decides what fires, with Google
 * Consent Mode v2 and the tag consent settings in the container. Without GTM (development, tests,
 * a clone site) the array is just an array – the e2e tests read it.
 *
 * Where the hooks are called:
 * - `trackViewItemList` / `trackSelectItem` – category, /produkty, search (`AnalyticsEvents.tsx`),
 * - `trackViewItem` – product detail,
 * - `trackAddToCart` – `AddToCartButton.tsx`, "+" in the cart,
 * - `trackRemoveFromCart` – "−" / "Odebrat" in the cart,
 * - `trackViewCart` – cart page, once per visit of the page,
 * - `trackAddShippingInfo` – cart, "Pokračovat k objednávce" with method and date,
 * - `trackBeginCheckout` – checkout page, once per `checkoutId`,
 * - `trackPurchase` – thank-you page, once per order (`PurchaseEvent.tsx`).
 */

import type { CartLine } from './cart/store'
import * as ecommerce from './measurement/ecommerce'
import type { EcommercePush } from './measurement/ecommerce'
import { buildGa4Item, type Ga4Item } from './measurement/items'

type DataLayerWindow = {
  dataLayer?: unknown[]
  /** Copy of the e-commerce pushes of this page (debugging, e2e tests). Never leaves the page. */
  terrysAnalyticsLog?: { event: string; payload: unknown }[]
}

export function newEventId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  }
}

/** Pushes one e-commerce message (after clearing the previous ecommerce object). */
export function pushEcommerce(message: EcommercePush): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as DataLayerWindow
  const dataLayer = (w.dataLayer ??= [])
  dataLayer.push({ ecommerce: null })
  dataLayer.push(message)
  ;(w.terrysAnalyticsLog ??= []).push({ event: message.event, payload: message })
}

/** Any other dataLayer message (page views, consent, newsletter signup). */
export function pushDataLayer(message: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  ;((window as unknown as DataLayerWindow).dataLayer ??= []).push(message)
}

/** A cart line as a GA4 item (estimate per piece, categories/brand from the add-to-cart snapshot). */
export function cartLineItem(line: CartLine, quantity = line.quantity): Ga4Item {
  return buildGa4Item({
    productId: line.productId,
    variantId: line.variantId,
    title: line.title,
    variantLabel: line.variantLabel,
    categories: line.analytics?.categories,
    brand: line.analytics?.brand,
    price: line.estimatedPrice,
    quantity,
    weightGrams: line.weightGrams,
    priceUnit: line.priceUnit,
    unitPrice: line.unitPrice,
  })
}

export function trackViewItemList(listId: string, listName: string, items: Ga4Item[]): void {
  if (items.length === 0) return
  pushEcommerce(ecommerce.viewItemList({ eventId: newEventId(), listId, listName, items }))
}

export function trackSelectItem(listId: string, listName: string, item: Ga4Item): void {
  pushEcommerce(ecommerce.selectItem({ eventId: newEventId(), listId, listName, item }))
}

export function trackViewItem(item: Ga4Item): void {
  pushEcommerce(ecommerce.viewItem({ eventId: newEventId(), item }))
}

export function trackAddToCart(items: Ga4Item[]): void {
  pushEcommerce(ecommerce.addToCart({ eventId: newEventId(), items }))
}

export function trackRemoveFromCart(items: Ga4Item[]): void {
  pushEcommerce(ecommerce.removeFromCart({ eventId: newEventId(), items }))
}

export function trackViewCart(lines: CartLine[]): void {
  if (lines.length === 0) return
  pushEcommerce(
    ecommerce.viewCart({ eventId: newEventId(), items: lines.map((l) => cartLineItem(l)) }),
  )
}

export function trackBeginCheckout(lines: CartLine[]): void {
  pushEcommerce(
    ecommerce.beginCheckout({ eventId: newEventId(), items: lines.map((l) => cartLineItem(l)) }),
  )
}

export function trackAddShippingInfo(
  lines: CartLine[],
  shippingTier: string,
  deliveryDate: string,
): void {
  pushEcommerce(
    ecommerce.addShippingInfo({
      eventId: newEventId(),
      items: lines.map((l) => cartLineItem(l)),
      shippingTier,
      deliveryDate,
    }),
  )
}

/** The purchase message is built on the server (thank-you page) – it knows the order. */
export function trackPurchase(message: EcommercePush): void {
  pushEcommerce(message)
}
