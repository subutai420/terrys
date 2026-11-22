/**
 * THE item id scheme (stage 6). One id per thing the customer can actually buy, identical in the
 * GTM dataLayer (GA4 `item_id`, Google Ads dynamic remarketing), in every product feed (Google,
 * Meta, Heureka, Zboží `ITEM_ID`), in Meta CAPI `content_ids` and in Heureka "Ověřeno zákazníky"
 * `productItemIds`. Never build these ids anywhere else.
 *
 *   variant of a product          `<productId>-<variantRowId>`   e.g. `406-6b03246590708426ec932438`
 *   product without variants      `<productId>`                  e.g. `512` (fixed-price sauce)
 *   group of variants             `<productId>`                  (`item_group_id` / `ITEMGROUP_ID`)
 *
 * Why the Payload variant row id and not the weight ("406-300g"): the row id survives every edit
 * in the admin (renaming "300 g" to "Porce 300 g", changing the target weight, reordering), so the
 * ad platforms keep the history of the item. It is what the cart and the order lines already store
 * (`variantId`), so the purchase event needs no lookups. It changes only when a variant row is
 * deleted and re-created, or when the stage 8 importer rewrites a product (before launch only).
 *
 * Length: product id (≤ 10 digits) + 1 + 24 hex = at most 35 characters – inside the strictest
 * limit (Heureka ITEM_ID 36 chars; Google 50, Meta 100). Characters: digits, a–f, "-" only.
 */

export function itemId(productId: number | string, variantId?: string | null): string {
  return variantId ? `${productId}-${variantId}` : String(productId)
}

/** Group id of all variants of a product (Google/Meta `item_group_id`, Zboží `ITEMGROUP_ID`). */
export function itemGroupId(productId: number | string): string {
  return String(productId)
}

/** Allowed by every channel (Heureka is the strictest: letters, digits, `_`, `-`, max 36). */
export function isValidItemId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,36}$/.test(id)
}
