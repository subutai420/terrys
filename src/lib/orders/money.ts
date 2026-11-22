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

  return {
    goodsEstimate,
    deliveryPrice,
    totalEstimate: goodsEstimate + deliveryPrice,
    vat: vatBreakdown(goodsByRate, deliveryPrice),
  }
}

/** VAT rows of goods (haléře per rate) + delivery (whole CZK, split by `splitDelivery`). */
export function vatBreakdown(goodsByRate: Map<number, number>, deliveryPrice: number): VatRow[] {
  const deliveryByRate = splitDelivery(toHalere(deliveryPrice), goodsByRate)
  const rates = [...new Set([...goodsByRate.keys(), ...deliveryByRate.keys()])].sort(
    (a, b) => a - b,
  )
  return rates
    .map((rate) => {
      const gross = (goodsByRate.get(rate) ?? 0) + (deliveryByRate.get(rate) ?? 0)
      const vatHalere = vatFromGross(gross, rate)
      return {
        rate,
        gross: fromHalere(gross),
        base: fromHalere(gross - vatHalere),
        vat: fromHalere(vatHalere),
      }
    })
    .filter((row) => row.gross !== 0)
}

// ---------------------------------------------------------------------------------------------
// Stage 5: final price after weighing
// ---------------------------------------------------------------------------------------------
//
// RULES (same as the estimate, also in CLAUDE.md "Final price"):
// 6. Final line price = unit price × ACTUAL weight of the whole line (all pieces together),
//    rounded ONCE per line to whole CZK (half up) – the same rounding as the estimate.
//    Piece-priced items: unit price × quantity (no weighing). Unavailable lines: 0.
//    A substituted line is priced with the ORIGINAL unit price (the butcher cannot set prices).
// 7. goodsFinal = sum of whole-CZK final lines; totalFinal = goodsFinal + delivery price (the
//    delivery price never changes after the order – business rule 2). No further rounding.
// 8. VAT breakdown recomputed from the final lines exactly like the estimate (haléře per rate,
//    delivery split in proportion to the FINAL goods value).
// 9. Gift vouchers are a MEANS OF PAYMENT, not a discount: they do not change any price or the
//    VAT breakdown, they only reduce the amount the customer pays on delivery (doplatek).
//    Each voucher amount is whole CZK > 0; their sum may not exceed totalFinal.

export type FinalLineInput = {
  unitPrice: number
  priceUnit: PriceUnit
  quantity: number
  vatRate: string
  /** Weight of the whole line in grams (all pieces), null when not weighed. */
  actualWeightGrams: number | null | undefined
  resolution: 'weighed' | 'substituted' | 'unavailable' | 'piece' | null | undefined
}

export type FinalTotals = {
  goodsFinal: number
  deliveryPrice: number
  totalFinal: number
  vat: VatRow[]
  voucherTotal: number
  /** What the customer pays on delivery/pickup (dobírka / doplatek): totalFinal − vouchers. */
  amountDue: number
}

/** Final price of one line in whole CZK, or null when the line is not resolved yet. */
export function lineFinalPrice(line: FinalLineInput): number | null {
  if (line.resolution === 'unavailable') return 0
  if (line.priceUnit === 'piece') {
    return estimateVariantPrice(
      { unitPrice: line.unitPrice, priceUnit: 'piece' },
      {},
      line.quantity,
    )
  }
  if (line.resolution !== 'weighed' && line.resolution !== 'substituted') return null
  const grams = line.actualWeightGrams
  if (typeof grams !== 'number' || !Number.isFinite(grams) || grams <= 0) return null
  // The whole line was weighed at once → quantity 1 with the total weight.
  return estimateVariantPrice(
    { unitPrice: line.unitPrice, priceUnit: line.priceUnit },
    { weightGrams: grams },
    1,
  )
}

export class VoucherCapError extends Error {
  constructor(
    public voucherTotal: number,
    public totalFinal: number,
  ) {
    super(`Vouchers (${voucherTotal}) exceed the final total (${totalFinal})`)
  }
}

/** Validates voucher amounts (whole CZK > 0). Returns a Czech message or null. */
export function voucherAmountError(amount: unknown): string | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 'Zadejte částku poukazu.'
  if (!Number.isInteger(amount)) return 'Částka poukazu musí být v celých korunách.'
  if (amount <= 0) return 'Částka poukazu musí být větší než 0 Kč.'
  return null
}

/**
 * Final totals of a weighed order. Throws when a line is not resolved, and `VoucherCapError`
 * when the vouchers exceed the final total.
 */
export function computeFinalTotals(
  lines: FinalLineInput[],
  deliveryPrice: number,
  voucherAmounts: number[] = [],
): FinalTotals {
  if (!Number.isInteger(deliveryPrice) || deliveryPrice < 0) {
    throw new Error(`Invalid delivery price: ${deliveryPrice}`)
  }
  const goodsByRate = new Map<number, number>()
  const allRates = new Set<number>()
  let goodsFinal = 0
  for (const line of lines) {
    const price = lineFinalPrice(line)
    if (price === null) throw new Error('Line is not resolved')
    goodsFinal += price
    const rate = vatRateToNumber(line.vatRate)
    allRates.add(rate)
    if (price > 0) goodsByRate.set(rate, (goodsByRate.get(rate) ?? 0) + toHalere(price))
  }
  // Nothing delivered at all (every line unavailable): the delivery still needs a VAT rate.
  if (goodsByRate.size === 0) for (const rate of allRates) goodsByRate.set(rate, 0)
  const totalFinal = goodsFinal + deliveryPrice
  for (const amount of voucherAmounts) {
    if (voucherAmountError(amount)) throw new Error(`Invalid voucher amount: ${amount}`)
  }
  const voucherTotal = voucherAmounts.reduce((sum, amount) => sum + amount, 0)
  if (voucherTotal > totalFinal) throw new VoucherCapError(voucherTotal, totalFinal)
  return {
    goodsFinal,
    deliveryPrice,
    totalFinal,
    vat: vatBreakdown(goodsByRate, deliveryPrice),
    voucherTotal,
    amountDue: totalFinal - voucherTotal,
  }
}

/** Sum of the final prices of the resolved lines (live preview while weighing; null = none). */
export function partialGoodsFinal(lines: FinalLineInput[]): {
  total: number
  resolved: number
} {
  let total = 0
  let resolved = 0
  for (const line of lines) {
    const price = lineFinalPrice(line)
    if (price !== null) {
      total += price
      resolved += 1
    }
  }
  return { total, resolved }
}
