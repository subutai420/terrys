import { describe, expect, it } from 'vitest'

import {
  computeTotals,
  fromHalere,
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
