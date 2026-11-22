import type { PriceUnit, VariantKind } from './catalog'

/**
 * Price estimates.
 *
 * Business rule: meat is sold by weight. The butcher weighs every order and the FINAL price
 * follows the real weight (typically about ±15 % from the estimate). Everything computed here
 * is therefore only an ESTIMATE and must always be shown with a notice saying so.
 */

export type PriceInput = {
  /** Price in CZK incl. VAT for one `priceUnit`. */
  unitPrice: number
  priceUnit: PriceUnit
}

export type VariantInput = {
  kind?: VariantKind | null
  /** `weight` variant: target weight of the portion. `piece` variant: average weight of the piece. */
  weightGrams?: number | null
}

/** How many grams one price unit stands for (null for fixed-price items). */
function gramsPerUnit(unit: PriceUnit): number | null {
  switch (unit) {
    case 'kg':
      return 1000
    case '100g':
      return 100
    case 'piece':
      return null
  }
}

/** Rounds to whole CZK, ignoring tiny floating point errors (e.g. 247.49999999 -> 247.5 -> 248). */
function roundCzk(amount: number): number {
  return Math.round(Number(amount.toFixed(6)))
}

/**
 * Estimated price of one variant (and optional quantity) in whole CZK.
 *
 * - `kg` / `100g` products: unit price × weight (target weight, or average weight for pieces).
 * - `piece` products (fixed price, e.g. sauces): the unit price itself; weight is ignored.
 *
 * Returns `null` when the estimate cannot be computed (missing or invalid weight/price),
 * so the caller can decide what to show instead of displaying a wrong number.
 */
export function estimateVariantPrice(
  price: PriceInput,
  variant: VariantInput,
  quantity = 1,
): number | null {
  const { unitPrice, priceUnit } = price
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return null
  if (!Number.isFinite(quantity) || quantity <= 0) return null

  const grams = gramsPerUnit(priceUnit)
  if (grams === null) {
    return roundCzk(unitPrice * quantity)
  }

  const weight = variant.weightGrams
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) return null

  return roundCzk(((unitPrice * weight) / grams) * quantity)
}

/**
 * Price per kg for a product priced per kg or per 100 g (null for fixed-price items).
 * Useful for showing a comparable "Kč/kg" figure.
 */
export function pricePerKg(price: PriceInput): number | null {
  const grams = gramsPerUnit(price.priceUnit)
  if (grams === null || !Number.isFinite(price.unitPrice)) return null
  return roundCzk((price.unitPrice * 1000) / grams)
}
