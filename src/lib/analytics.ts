/**
 * Analytics hooks (stage 6 will wire them to GTM / dataLayer – NOT loaded yet).
 *
 * The storefront already calls these at the right moments, so stage 6 only fills in the bodies
 * (e.g. `window.dataLayer.push({ event: 'add_to_cart', ecommerce: { … } })`, GA4 e-commerce
 * schema). Until then they intentionally do nothing: no tracking without consent and without GTM.
 *
 * Where they are called:
 * - `trackViewItemList` – category, product listing and search result pages
 *   (`src/components/storefront/AnalyticsEvents.tsx`, `ViewItemListEvent`),
 * - `trackViewItem` – product detail (`ViewItemEvent`),
 * - `trackAddToCart` – after a successful add in `AddToCartButton.tsx`,
 * - `trackAddShippingInfo` – cart page, when the customer continues with a method and date,
 * - `trackBeginCheckout` – checkout page, once per checkout (`checkoutId`),
 * - `trackPurchase` – thank-you page, exactly once per order (guarded in localStorage).
 *
 * Prices are estimates (business rule 4): send the estimate as `price` and keep it labelled so.
 */

export type AnalyticsItem = {
  item_id: string
  item_name: string
  item_variant?: string
  item_category?: string
  /** Estimated price in CZK incl. VAT. */
  price?: number
  quantity?: number
}

export function trackViewItemList(listId: string, listName: string, items: AnalyticsItem[]): void {
  // Stage 6: push `view_item_list` to dataLayer.
  void listId
  void listName
  void items
}

export function trackViewItem(item: AnalyticsItem): void {
  // Stage 6: push `view_item` to dataLayer.
  void item
}

export function trackAddToCart(item: AnalyticsItem): void {
  // Stage 6: push `add_to_cart` to dataLayer.
  void item
}

// --------------------------------------------------------------------------- stage 4: checkout

/**
 * Local, in-page record of the stage 4 events (`window.terrysAnalyticsLog`). It never leaves the
 * browser; it lets the e2e tests (and stage 6 while wiring GTM) check what would be sent and that
 * `purchase` fires exactly once. Stage 6 may replace it with the dataLayer push.
 */
function record(event: string, payload: unknown): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { terrysAnalyticsLog?: { event: string; payload: unknown }[] }
  ;(w.terrysAnalyticsLog ??= []).push({ event, payload })
}

/** An item of the cart/order with the estimate details stage 6 needs. */
export type CheckoutItem = AnalyticsItem & {
  /** Estimated weight of ONE piece in grams (weight-priced products; null for fixed price). */
  estimated_weight_grams?: number | null
}

export type CheckoutEventPayload = {
  currency: 'CZK'
  /** Estimated goods value incl. VAT (without delivery). */
  value: number
  /** Always true: the final price follows the weighed amount (business rule 4). */
  value_is_estimate: true
  items: CheckoutItem[]
}

export type ShippingInfoPayload = CheckoutEventPayload & {
  /** Shipping method name, e.g. "Rozvoz Terrys" or "Osobní odběr – Italská". */
  shipping_tier: string
  /** Delivery/pickup date YYYY-MM-DD. */
  delivery_date: string
}

export type PurchasePayload = CheckoutEventPayload & {
  /** Order number shown to the customer. */
  transaction_id: string
  /** Estimated total incl. delivery. NOTE: `value` (GA4) = goods + shipping, see stage 6. */
  value: number
  shipping: number
  shipping_tier: string
  /** Same id is stored on the order (`orders.eventId`) for Meta CAPI deduplication (stage 6). */
  event_id: string
}

export function trackAddShippingInfo(payload: ShippingInfoPayload): void {
  // Stage 6: push `add_shipping_info` to dataLayer.
  record('add_shipping_info', payload)
}

export function trackBeginCheckout(payload: CheckoutEventPayload): void {
  // Stage 6: push `begin_checkout` to dataLayer.
  record('begin_checkout', payload)
}

export function trackPurchase(payload: PurchasePayload): void {
  // Stage 6: push `purchase` to dataLayer (and the server sends the same event_id to Meta CAPI).
  record('purchase', payload)
}
