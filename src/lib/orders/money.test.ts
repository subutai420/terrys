import { describe, expect, it } from 'vitest'

import {
  computeFinalTotals,
  computeTotals,
  fromHalere,
  lineFinalPrice,
  VoucherCapError,
  voucherAmountError,
  lineEstimate,
  lineWeightGrams,
  splitDelivery,
  toHalere,
  vatFromGross,
} from './money'

describe('lineEstimate', () => {
  it('per-kg variant: unit price × weight × quantity, rounded once to whole CZK', () => {
    // 990 Kč/kg × 250 g = 247.5 → 248
    expect(lineEstimate({ unitPrice: 990, priceUnit: 'kg', weightGrams: 250, quantity: 1 })).toBe(
      248,
    )
    // 3 × 250 g = 742.5 → 743 (one rounding, not 3 × 248 = 744)
    expect(lineEstimate({ unitPrice: 990, priceUnit: 'kg', weightGrams: 250, quantity: 3 })).toBe(
      743,
    )
  })

  it('per-100 g product with decimal price', () => {
    // 89.90 Kč / 100 g × 150 g = 134.85 → 135
    expect(
      lineEstimate({ unitPrice: 89.9, priceUnit: '100g', weightGrams: 150, quantity: 1 }),
    ).toBe(135)
  })

  it('piece-priced product ignores the weight', () => {
    expect(
      lineEstimate({ unitPrice: 149.5, priceUnit: 'piece', weightGrams: null, quantity: 2 }),
    ).toBe(299)
  })

  it('returns null for impossible input', () => {
    expect(lineEstimate({ unitPrice: 990, priceUnit: 'kg', weightGrams: null, quantity: 1 })).toBe(
      null,
    )
    expect(lineEstimate({ unitPrice: 990, priceUnit: 'kg', weightGrams: 250, quantity: 0 })).toBe(
      null,
    )
    expect(lineEstimate({ unitPrice: 990, priceUnit: 'kg', weightGrams: 250, quantity: 1.5 })).toBe(
      null,
    )
  })

  it('line weight', () => {
    expect(lineWeightGrams({ weightGrams: 250, quantity: 3 })).toBe(750)
    expect(lineWeightGrams({ weightGrams: null, quantity: 3 })).toBe(null)
  })
})

describe('VAT back-calculation', () => {
  it('works in haléře', () => {
    expect(toHalere(229)).toBe(22900)
    expect(fromHalere(2453)).toBe(24.53)
    // 112 Kč incl. 12 % = 100 base + 12 VAT
    expect(vatFromGross(11200, 12)).toBe(1200)
    // 229 Kč incl. 12 %: base 204.46, VAT 24.54
    expect(vatFromGross(22900, 12)).toBe(2454)
    expect(vatFromGross(12100, 21)).toBe(2100)
    expect(vatFromGross(5000, 0)).toBe(0)
  })
})

describe('splitDelivery', () => {
  it('a single rate takes the whole delivery', () => {
    expect([...splitDelivery(22900, new Map([[12, 100000]]))]).toEqual([[12, 22900]])
  })

  it('splits proportionally and always adds up', () => {
    const parts = splitDelivery(
      22900,
      new Map([
        [12, 200000],
        [21, 100000],
      ]),
    )
    expect((parts.get(12) ?? 0) + (parts.get(21) ?? 0)).toBe(22900)
    expect(parts.get(12)).toBe(15267)
    expect(parts.get(21)).toBe(7633)
  })

  it('no delivery → empty', () => {
    expect(splitDelivery(0, new Map([[12, 1000]])).size).toBe(0)
  })
})

describe('computeTotals', () => {
  it('sums whole-CZK lines and the delivery, with a VAT breakdown per rate', () => {
    const totals = computeTotals(
      [
        { unitPrice: 990, priceUnit: 'kg', weightGrams: 500, quantity: 2, vatRate: '12' }, // 990
        { unitPrice: 149, priceUnit: 'piece', weightGrams: null, quantity: 1, vatRate: '21' }, // 149
      ],
      229,
    )
    expect(totals.goodsEstimate).toBe(1139)
    expect(totals.deliveryPrice).toBe(229)
    expect(totals.totalEstimate).toBe(1368)
    const grossSum = totals.vat.reduce((sum, row) => sum + toHalere(row.gross), 0)
    expect(grossSum).toBe(toHalere(1368))
    for (const row of totals.vat) {
      expect(toHalere(row.base) + toHalere(row.vat)).toBe(toHalere(row.gross))
    }
    expect(totals.vat.map((row) => row.rate)).toEqual([12, 21])
  })

  it('pickup: no delivery in the breakdown', () => {
    const totals = computeTotals(
      [{ unitPrice: 990, priceUnit: 'kg', weightGrams: 250, quantity: 1, vatRate: '12' }],
      0,
    )
    expect(totals.totalEstimate).toBe(248)
    expect(totals.vat).toEqual([{ rate: 12, gross: 248, base: 221.43, vat: 26.57 }])
  })

  it('0 % VAT rows have no VAT', () => {
    const totals = computeTotals(
      [{ unitPrice: 1000, priceUnit: 'piece', weightGrams: null, quantity: 1, vatRate: '0' }],
      0,
    )
    expect(totals.vat).toEqual([{ rate: 0, gross: 1000, base: 1000, vat: 0 }])
  })

  it('rejects lines without an estimate and invalid delivery prices', () => {
    expect(() =>
      computeTotals(
        [{ unitPrice: 990, priceUnit: 'kg', weightGrams: null, quantity: 1, vatRate: '12' }],
        229,
      ),
    ).toThrow()
    expect(() => computeTotals([], 229.5)).toThrow()
  })
})

// ------------------------------------------------------------------ stage 5: final price
describe('lineFinalPrice (stage 5)', () => {
  const base = { unitPrice: 990, priceUnit: 'kg' as const, quantity: 2, vatRate: '12' }

  it('unit price × actual weight of the WHOLE line, rounded once to whole CZK', () => {
    // 990 × 0.523 = 517.77 → 518 (quantity does not multiply again: the weight is the total)
    expect(lineFinalPrice({ ...base, actualWeightGrams: 523, resolution: 'weighed' })).toBe(518)
    // half up like the estimate: 990 × 0.25 = 247.5 → 248
    expect(lineFinalPrice({ ...base, actualWeightGrams: 250, resolution: 'weighed' })).toBe(248)
  })

  it('per-100 g prices with haléře', () => {
    // 89.90 × 1.37 = 123.163 → 123
    expect(
      lineFinalPrice({
        unitPrice: 89.9,
        priceUnit: '100g',
        quantity: 1,
        vatRate: '12',
        actualWeightGrams: 137,
        resolution: 'weighed',
      }),
    ).toBe(123)
  })

  it('substitution is priced with the original unit price; unavailable is 0', () => {
    expect(lineFinalPrice({ ...base, actualWeightGrams: 500, resolution: 'substituted' })).toBe(495)
    expect(lineFinalPrice({ ...base, actualWeightGrams: 500, resolution: 'unavailable' })).toBe(0)
  })

  it('piece-priced items need no weight', () => {
    expect(
      lineFinalPrice({
        unitPrice: 149.5,
        priceUnit: 'piece',
        quantity: 2,
        vatRate: '21',
        actualWeightGrams: null,
        resolution: null,
      }),
    ).toBe(299)
  })

  it('null while not weighed', () => {
    expect(lineFinalPrice({ ...base, actualWeightGrams: null, resolution: null })).toBe(null)
    expect(lineFinalPrice({ ...base, actualWeightGrams: 0, resolution: 'weighed' })).toBe(null)
    expect(lineFinalPrice({ ...base, actualWeightGrams: 300, resolution: null })).toBe(null)
  })
})

describe('computeFinalTotals (stage 5)', () => {
  const steak = {
    unitPrice: 990,
    priceUnit: 'kg' as const,
    quantity: 1,
    vatRate: '12',
    actualWeightGrams: 540,
    resolution: 'weighed' as const,
  }
  const sauce = {
    unitPrice: 149,
    priceUnit: 'piece' as const,
    quantity: 1,
    vatRate: '21',
    actualWeightGrams: null,
    resolution: 'piece' as const,
  }

  it('sums whole-CZK lines + delivery, VAT per rate with delivery split by FINAL goods value', () => {
    const t = computeFinalTotals([steak, sauce], 229)
    // 990 × 0.54 = 534.6 → 535
    expect(t.goodsFinal).toBe(535 + 149)
    expect(t.totalFinal).toBe(684 + 229)
    expect(t.amountDue).toBe(913)
    expect(t.voucherTotal).toBe(0)
    const gross = t.vat.reduce((sum, row) => sum + row.gross, 0)
    expect(Math.round(gross * 100)).toBe(913 * 100)
    for (const row of t.vat)
      expect(Math.round((row.base + row.vat) * 100)).toBe(Math.round(row.gross * 100))
    // the same VAT split rule as the estimate (computeTotals) for identical amounts
    const sameAsEstimate = computeTotals(
      [
        { unitPrice: 990, priceUnit: 'kg', weightGrams: 540, quantity: 1, vatRate: '12' },
        { unitPrice: 149, priceUnit: 'piece', weightGrams: null, quantity: 1, vatRate: '21' },
      ],
      229,
    )
    expect(t.vat).toEqual(sameAsEstimate.vat)
  })

  it('vouchers are a payment: prices and VAT stay, only the amount due drops', () => {
    const without = computeFinalTotals([steak], 229)
    const withVoucher = computeFinalTotals([steak], 229, [500, 100])
    expect(withVoucher.totalFinal).toBe(without.totalFinal)
    expect(withVoucher.vat).toEqual(without.vat)
    expect(withVoucher.voucherTotal).toBe(600)
    expect(withVoucher.amountDue).toBe(without.totalFinal - 600)
  })

  it('voucher cap: may equal the total, never exceed it', () => {
    const total = computeFinalTotals([steak], 229).totalFinal
    expect(computeFinalTotals([steak], 229, [total]).amountDue).toBe(0)
    expect(() => computeFinalTotals([steak], 229, [total + 1])).toThrow(VoucherCapError)
  })

  it('rejects invalid voucher amounts and unresolved lines', () => {
    expect(() => computeFinalTotals([steak], 229, [10.5])).toThrow()
    expect(() => computeFinalTotals([steak], 229, [0])).toThrow()
    expect(() => computeFinalTotals([{ ...steak, resolution: null }], 229)).toThrow()
    expect(voucherAmountError(500)).toBe(null)
    expect(voucherAmountError(-1)).toMatch(/větší než 0/)
    expect(voucherAmountError(1.5)).toMatch(/celých/)
  })

  it('everything unavailable: goods 0, delivery still has a VAT row', () => {
    const t = computeFinalTotals([{ ...steak, resolution: 'unavailable' }], 229)
    expect(t.goodsFinal).toBe(0)
    expect(t.totalFinal).toBe(229)
    expect(t.vat).toHaveLength(1)
    expect(t.vat[0].rate).toBe(12)
    expect(t.vat[0].gross).toBe(229)
  })
})
