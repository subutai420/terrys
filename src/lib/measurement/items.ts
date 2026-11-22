import type { PriceUnit } from '../catalog'
import { pricePerKg } from '../price'

import { itemGroupId, itemId } from './ids'

/**
 * Product facts shared by the dataLayer, the feeds and CAPI (stage 6): category path, brand and
 * per-kg price. Pure, unit-tested in `measurement.test.ts`.
 */

/** Brand used when a product has no producer filled in (we are the seller and the butcher). */
export const DEFAULT_BRAND = 'Terrys'

export type CategoryNode = { id: number; title: string; parent?: number | null }

type RelationValue = number | { id: number } | null | undefined

function relationId(value: RelationValue): number | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof value.id === 'number') return value.id
  return null
}

/**
 * Category path of a product, root first (GA4 `item_category` … `item_category5`, Google
 * `product_type`): the FIRST category of the product (the editor's primary one) and its parents.
 */
export function categoryPath(
  productCategories: RelationValue[] | null | undefined,
  all: CategoryNode[],
): string[] {
  const primary = relationId((productCategories ?? [])[0])
  if (primary === null) return []
  const byId = new Map(all.map((c) => [c.id, c]))
  const chain: string[] = []
  let current = byId.get(primary)
  const seen = new Set<number>()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    chain.unshift(current.title)
    current = current.parent ? byId.get(current.parent) : undefined
  }
  return chain.slice(0, 5)
}

/** Ids of the primary category and its parents, leaf first (for feed category mapping). */
export function categoryIdChain(
  productCategories: RelationValue[] | null | undefined,
  all: CategoryNode[],
): number[] {
  const byId = new Map(all.map((c) => [c.id, c]))
  const result: number[] = []
  for (const value of productCategories ?? []) {
    let current = byId.get(relationId(value) ?? -1)
    const seen = new Set<number>()
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      if (!result.includes(current.id)) result.push(current.id)
      current = current.parent ? byId.get(current.parent) : undefined
    }
  }
  return result
}

/** Producer from the product, unless empty or a seed placeholder; otherwise "Terrys". */
export function productBrand(brand: string | null | undefined): string {
  const value = brand?.trim()
  if (!value || value.toUpperCase().startsWith('DOPLNIT')) return DEFAULT_BRAND
  return value
}

/** Rounds to haléře (two decimals). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

// --------------------------------------------------------------------------- GA4 items

/** Everything the dataLayer item needs; built from a product + variant or from a cart/order line. */
export type ItemInput = {
  productId: number
  variantId: string | null
  title: string
  variantLabel?: string | null
  categories?: string[]
  brand?: string | null
  /** Estimated price of ONE piece incl. VAT (CZK, may have haléře for order lines). */
  price: number | null
  quantity?: number
  /** Estimated weight of one piece (weight-priced products). */
  weightGrams?: number | null
  priceUnit: PriceUnit
  /** Catalog price per `priceUnit` incl. VAT. */
  unitPrice: number
  index?: number
}

/**
 * GA4 item (https://developers.google.com/analytics/devguides/collection/ga4/reference/events).
 * Standard parameters plus item-scoped custom parameters (register them in GA4 as custom
 * dimensions if needed): `item_group_id`, `price_per_kg`, `estimated_weight_grams`,
 * `price_is_estimate`. No `coupon` / `discount` – ever (business rule 1).
 */
export type Ga4Item = {
  item_id: string
  item_name: string
  item_brand: string
  item_category?: string
  item_category2?: string
  item_category3?: string
  item_category4?: string
  item_category5?: string
  item_variant?: string
  price?: number
  quantity: number
  index?: number
  item_list_id?: string
  item_list_name?: string
  item_group_id: string
  price_per_kg?: number
  estimated_weight_grams?: number
  price_is_estimate: boolean
  google_business_vertical: 'retail'
}

export function buildGa4Item(input: ItemInput, list?: { id: string; name: string }): Ga4Item {
  const item: Ga4Item = {
    item_id: itemId(input.productId, input.variantId),
    item_name: input.title,
    item_brand: productBrand(input.brand),
    quantity: input.quantity && input.quantity > 0 ? input.quantity : 1,
    item_group_id: itemGroupId(input.productId),
    price_is_estimate: input.priceUnit !== 'piece',
    google_business_vertical: 'retail',
  }
  const categoryKeys = [
    'item_category',
    'item_category2',
    'item_category3',
    'item_category4',
    'item_category5',
  ] as const
  ;(input.categories ?? []).slice(0, 5).forEach((title, i) => {
    item[categoryKeys[i]] = title
  })
  if (input.variantLabel) item.item_variant = input.variantLabel
  if (typeof input.price === 'number' && Number.isFinite(input.price)) {
    item.price = round2(input.price)
  }
  if (typeof input.index === 'number') item.index = input.index
  if (list) {
    item.item_list_id = list.id
    item.item_list_name = list.name
  }
  const perKg = pricePerKg({ unitPrice: input.unitPrice, priceUnit: input.priceUnit })
  if (perKg !== null) item.price_per_kg = round2(perKg)
  if (input.priceUnit !== 'piece' && input.weightGrams) {
    item.estimated_weight_grams = input.weightGrams
  }
  return item
}

/** Σ price × quantity, rounded to haléře (GA4 `value`). */
export function itemsValue(items: Pick<Ga4Item, 'price' | 'quantity'>[]): number {
  return round2(items.reduce((sum, item) => sum + (item.price ?? 0) * item.quantity, 0))
}
