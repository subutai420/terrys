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
 * - `trackAddToCart` – after a successful add in `AddToCartButton.tsx`.
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
