import type { PriceUnit } from '../catalog'
import { vatRateToNumber } from '../catalog'
import { estimateVariantPrice } from '../price'

/**
 * Money maths of the cart and the order (stage 4). Pure functions, unit-tested in
 * `money.test.ts`; used by the browser (cart display) and the server (order placement), so the
 * customer sees exactly the numbers the server stores.
 *
 * RULES (also in CLAUDE.md "Money"):
 * 1. Every price in the catalog is VAT-INCLUSIVE CZK per price unit (1 kg / 100 g / piece). It
 *    may have decimals (e.g. 89,90 Kč / 100 g).
 * 2. A line estimate = unit price × estimated weight × quantity, rounded ONCE per line to WHOLE
 *    CZK (half up), via `estimateVariantPrice()`. Fixed-price items: unit price × quantity,
 *    rounded to whole CZK. All customer-facing amounts are whole CZK (the shop works with
 *    cash on delivery; the final price after weighing is also whole CZK, stage 5).
 * 3. Totals are sums of whole-CZK line estimates plus the delivery price (whole CZK) – no
 *    further rounding happens, so the lines always add up to the total.
 * 4. VAT is back-calculated from VAT-inclusive amounts per rate, in INTEGER HALÉŘE to avoid
 *    floating point errors: base = round(gross × 100 / (100 + rate)), VAT = gross − base. The
 *    breakdown is stored in CZK with two decimals (exact, because it comes from haléře).
 * 5. Delivery is an ancillary service: its VAT follows the goods. With several VAT rates in one
 *    order the delivery price is split between the rates in proportion to the estimated goods
 *    value (largest remainder, so the parts add up exactly). Open question for the accountant
 *    (see CLAUDE.md); change only `splitDelivery()` if they decide otherwise.
 *
 * Everything here is an ESTIMATE (business rule 4); the final price follows the weighed amount.
 */

export type MoneyLineInput = {
  /** VAT-inclusive CZK per `priceUnit`. */
  unitPrice: number
  priceUnit: PriceUnit
  /** Estimated weight of ONE piece of the line (null for fixed-price items). */
  weightGrams: number | null
  quantity: number
  /** Product VAT rate, `'12'` / `'21'` / `'0'` (per product, business rule 6). */
  vatRate: string
}

export type VatRow = {
  /** Rate in percent, e.g. 12. */
  rate: number
  /** VAT-inclusive amount in CZK (two decimals). */
  gross: number
  /** Amount without VAT in CZK (two decimals). */
  base: number
  /** VAT in CZK (two decimals). */
  vat: number
}

export type OrderTotals = {
  /** Sum of the line estimates, whole CZK incl. VAT. */
  goodsEstimate: number
  /** Delivery price, whole CZK incl. VAT (0 for pickup). */
  deliveryPrice: number
  /** goodsEstimate + deliveryPrice. */
  totalEstimate: number
  /** VAT breakdown of the estimated total (goods + delivery), ascending by rate. */
  vat: VatRow[]
}

/** Whole CZK → haléře. Only for whole or two-decimal amounts. */
export function toHalere(czk: number): number {
  return Math.round(czk * 100)
}

/** Haléře → CZK number with at most two decimals. */
export function fromHalere(halere: number): number {
  return Math.round(halere) / 100
}

/** Estimated price of one cart/order line in whole CZK, or null when it cannot be computed. */
export function lineEstimate(line: Omit<MoneyLineInput, 'vatRate'>): number | null {
  if (!Number.isInteger(line.quantity) || line.quantity < 1) return null
  return estimateVariantPrice(
    { unitPrice: line.unitPrice, priceUnit: line.priceUnit },
    { weightGrams: line.weightGrams },
    line.quantity,
  )
}

/** Estimated total weight of a line in grams (null for fixed-price items without a weight). */
export function lineWeightGrams(line: Pick<MoneyLineInput, 'weightGrams' | 'quantity'>) {
  return typeof line.weightGrams === 'number' && line.weightGrams > 0
    ? Math.round(line.weightGrams * line.quantity)
    : null
}

/** VAT contained in a VAT-inclusive amount (haléře in, haléře out). */
export function vatFromGross(grossHalere: number, ratePercent: number): number {
  if (ratePercent <= 0) return 0
  const base = Math.round((grossHalere * 100) / (100 + ratePercent))
  return grossHalere - base
}

/**
 * Splits the delivery price (haléře) between VAT rates in proportion to the goods value per rate.
 * Largest remainder method: the parts always add up to the delivery price exactly.
 */
export function splitDelivery(
  deliveryHalere: number,
  goodsByRate: Map<number, number>,
): Map<number, number> {
  const result = new Map<number, number>()
  const rates = [...goodsByRate.keys()].sort((a, b) => a - b)
  const goodsTotal = rates.reduce((sum, rate) => sum + (goodsByRate.get(rate) ?? 0), 0)
  if (deliveryHalere <= 0 || rates.length === 0) return result
  if (goodsTotal <= 0) {
    // Nothing to follow (cannot happen with a real order): the highest goods rate takes it.
    result.set(rates[rates.length - 1], deliveryHalere)
    return result
  }
  const exact = rates.map((rate) => ({
    rate,
    value: (deliveryHalere * (goodsByRate.get(rate) ?? 0)) / goodsTotal,
  }))
  const floors = exact.map((part) => ({ ...part, floor: Math.floor(part.value) }))
  let rest = deliveryHalere - floors.reduce((sum, part) => sum + part.floor, 0)
  // Give the remaining haléře to the parts with the largest fractions (ties: higher rate first).
  const order = [...floors].sort(
    (a, b) => b.value - b.floor - (a.value - a.floor) || b.rate - a.rate,
  )
  for (const part of order) {
    if (rest <= 0) break
    part.floor += 1
    rest -= 1
  }
  for (const part of floors) result.set(part.rate, part.floor)
  return result
}

/**
 * Totals of an order (or of the cart) from its lines and the delivery price.
 * Lines whose estimate cannot be computed must be rejected BEFORE calling this (they throw).
 */
export function computeTotals(lines: MoneyLineInput[], deliveryPrice: number): OrderTotals {
  if (!Number.isInteger(deliveryPrice) || deliveryPrice < 0) {
    throw new Error(`Invalid delivery price: ${deliveryPrice}`)
  }
  const goodsByRate = new Map<number, number>()
  let goodsEstimate = 0
  for (const line of lines) {
    const estimate = lineEstimate(line)
    if (estimate === null) throw new Error('Line estimate cannot be computed')
    goodsEstimate += estimate
    const rate = vatRateToNumber(line.vatRate)
    goodsByRate.set(rate, (goodsByRate.get(rate) ?? 0) + toHalere(estimate))
  }

  const deliveryByRate = splitDelivery(toHalere(deliveryPrice), goodsByRate)
  const rates = [...new Set([...goodsByRate.keys(), ...deliveryByRate.keys()])].sort(
    (a, b) => a - b,
  )
  const vat = rates.map((rate) => {
    const gross = (goodsByRate.get(rate) ?? 0) + (deliveryByRate.get(rate) ?? 0)
    const vatHalere = vatFromGross(gross, rate)
    return {
      rate,
      gross: fromHalere(gross),
      base: fromHalere(gross - vatHalere),
      vat: fromHalere(vatHalere),
    }
  })

  return {
    goodsEstimate,
    deliveryPrice,
    totalEstimate: goodsEstimate + deliveryPrice,
    vat,
  }
}
