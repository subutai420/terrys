import type { Availability, PriceUnit, VariantKind } from './catalog'
import { estimateVariantPrice, pricePerKg } from './price'

/**
 * Presentation helpers for products on the storefront (cards, detail, cart button, JSON-LD).
 * Pure functions, unit-tested in `productView.test.ts`.
 */

export type ViewVariant = {
  id?: string | null
  label: string
  kind: VariantKind
  weightGrams?: number | null
  availability?: Availability | null
  sortOrder?: number | null
}

export type ViewProduct = {
  price: number
  priceUnit: PriceUnit
  availability: Availability
  variants?: ViewVariant[] | null
}

/** Typical deviation of the weighed price from the estimate (business rule 4: "about ±15 %"). */
export const WEIGHT_TOLERANCE = 0.15

/** Short unit label after a price: "990 Kč / kg". */
export const PRICE_UNIT_SHORT: Record<PriceUnit, string> = {
  kg: 'kg',
  '100g': '100 g',
  piece: 'ks',
}

/** Availability as the customer sees it. */
export const AVAILABILITY_PUBLIC_LABELS: Record<Exclude<Availability, 'hidden'>, string> = {
  'in-stock': 'Skladem',
  'in-transit': 'Na cestě',
  'sold-out': 'Vyprodáno',
}

export function availabilityLabel(availability: Availability): string {
  return availability === 'hidden' ? '' : AVAILABILITY_PUBLIC_LABELS[availability]
}

/** Can the customer put it into the cart? Sold-out (and hidden) items stay visible but cannot. */
export function isPurchasable(availability: Availability | null | undefined): boolean {
  return availability === 'in-stock' || availability === 'in-transit'
}

/** Variants in display order: `sortOrder` when set, otherwise the order in the admin. */
export function sortVariants<T extends ViewVariant>(variants: T[] | null | undefined): T[] {
  return (variants ?? [])
    .map((variant, index) => ({ variant, index }))
    .sort((a, b) => {
      const sa = a.variant.sortOrder ?? Number.POSITIVE_INFINITY
      const sb = b.variant.sortOrder ?? Number.POSITIVE_INFINITY
      if (sa !== sb) return sa - sb
      return a.index - b.index
    })
    .map(({ variant }) => variant)
}

/** Availability of one variant: its own setting, else the product's. */
export function variantAvailability(product: ViewProduct, variant: ViewVariant): Availability {
  if (!isPurchasable(product.availability)) return product.availability
  return variant.availability ?? product.availability
}

/** Weight-priced product (per kg / per 100 g): the final price follows the weighed amount. */
export function isWeightPriced(priceUnit: PriceUnit): boolean {
  return priceUnit !== 'piece'
}

/** "250 g", "1 kg", "1,5 kg". */
export function formatWeight(grams: number): string {
  if (grams >= 1000) {
    const kg = Math.round((grams / 1000) * 100) / 100
    return `${kg.toLocaleString('cs-CZ')} kg`
  }
  return `${Math.round(grams)} g`
}

export type VariantOption = {
  index: number
  id: string | null
  label: string
  weightGrams: number | null
  availability: Availability
  purchasable: boolean
  /** Estimated price in whole CZK (null when it cannot be computed). */
  estimate: number | null
  /** Expected range after weighing (weight-priced products only). */
  range: { low: number; high: number } | null
}

/** Everything the variant picker needs, in display order. */
export function variantOptions(product: ViewProduct): VariantOption[] {
  return sortVariants(product.variants).map((variant, index) => {
    const availability = variantAvailability(product, variant)
    const estimate = estimateVariantPrice(
      { unitPrice: product.price, priceUnit: product.priceUnit },
      { kind: variant.kind, weightGrams: variant.weightGrams },
    )
    return {
      index,
      id: variant.id ?? null,
      label: variant.label,
      weightGrams: variant.weightGrams ?? null,
      availability,
      purchasable: isPurchasable(availability) && estimate !== null,
      estimate,
      range:
        estimate !== null && isWeightPriced(product.priceUnit) ? estimateRange(estimate) : null,
    }
  })
}

/** Range the weighed price usually falls into (estimate ± 15 %), rounded to whole CZK. */
export function estimateRange(estimate: number): { low: number; high: number } {
  return {
    low: Math.round(estimate * (1 - WEIGHT_TOLERANCE)),
    high: Math.round(estimate * (1 + WEIGHT_TOLERANCE)),
  }
}

/** Index of the variant selected when the page opens: the first one that can be bought. */
export function defaultVariantIndex(options: VariantOption[]): number {
  const first = options.findIndex((option) => option.purchasable)
  return first === -1 ? 0 : first
}

/**
 * What the product offers for buying:
 * - `variants`: pick a variant (weight-priced products, or fixed-price products with variants),
 * - `single`: fixed-price product without variants (e.g. a sauce), bought as one piece,
 * - `none`: nothing can be bought (sold out, or a weight-priced product without variants).
 */
export function purchaseMode(product: ViewProduct): 'variants' | 'single' | 'none' {
  const options = variantOptions(product)
  if (options.length > 0) return options.some((o) => o.purchasable) ? 'variants' : 'none'
  if (!isWeightPriced(product.priceUnit) && isPurchasable(product.availability)) return 'single'
  return 'none'
}

/** Comparable price per kg for sorting (fixed-price items use their price). */
export function sortablePrice(product: Pick<ViewProduct, 'price' | 'priceUnit'>): number {
  return pricePerKg({ unitPrice: product.price, priceUnit: product.priceUnit }) ?? product.price
}

/** Order of availability in default sorting: buyable first, sold-out last. */
export const AVAILABILITY_ORDER: Record<Availability, number> = {
  'in-stock': 0,
  'in-transit': 1,
  'sold-out': 2,
  hidden: 3,
}
