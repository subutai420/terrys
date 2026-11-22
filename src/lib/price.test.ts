import { describe, expect, it } from 'vitest'

import { vatRateToNumber } from './catalog'
import { estimateVariantPrice, pricePerKg } from './price'

describe('estimateVariantPrice', () => {
  it('multiplies price per kg by the target weight', () => {
    expect(
      estimateVariantPrice(
        { unitPrice: 990, priceUnit: 'kg' },
        { kind: 'weight', weightGrams: 500 },
      ),
    ).toBe(495)
    expect(
      estimateVariantPrice(
        { unitPrice: 990, priceUnit: 'kg' },
        { kind: 'weight', weightGrams: 1000 },
      ),
    ).toBe(990)
    expect(
      estimateVariantPrice(
        { unitPrice: 9990, priceUnit: 'kg' },
        { kind: 'weight', weightGrams: 200 },
      ),
    ).toBe(1998)
  })

  it('rounds to whole CZK (half up)', () => {
    // 990 * 0.25 = 247.5 -> 248
    expect(
      estimateVariantPrice(
        { unitPrice: 990, priceUnit: 'kg' },
        { kind: 'weight', weightGrams: 250 },
      ),
    ).toBe(248)
    // 1890 * 0.333 = 629.37 -> 629
    expect(
      estimateVariantPrice(
        { unitPrice: 1890, priceUnit: 'kg' },
        { kind: 'weight', weightGrams: 333 },
      ),
    ).toBe(629)
    // floating point: 1.15 * 100 would be 114.99999999999999 without care
    expect(
      estimateVariantPrice(
        { unitPrice: 1.15, priceUnit: '100g' },
        { kind: 'weight', weightGrams: 10000 },
      ),
    ).toBe(115)
  })

  it('handles prices per 100 g', () => {
    expect(
      estimateVariantPrice(
        { unitPrice: 99, priceUnit: '100g' },
        { kind: 'weight', weightGrams: 250 },
      ),
    ).toBe(248)
    expect(
      estimateVariantPrice(
        { unitPrice: 750, priceUnit: '100g' },
        { kind: 'weight', weightGrams: 100 },
      ),
    ).toBe(750)
  })

  it('uses the average weight for piece variants', () => {
    // Whole piece of about 2.5 kg at 990 Kč/kg
    expect(
      estimateVariantPrice(
        { unitPrice: 990, priceUnit: 'kg' },
        { kind: 'piece', weightGrams: 2500 },
      ),
    ).toBe(2475)
  })

  it('returns the fixed price for items sold per piece, ignoring weight', () => {
    expect(estimateVariantPrice({ unitPrice: 189, priceUnit: 'piece' }, {})).toBe(189)
    expect(
      estimateVariantPrice(
        { unitPrice: 189, priceUnit: 'piece' },
        { kind: 'weight', weightGrams: 250 },
      ),
    ).toBe(189)
    expect(estimateVariantPrice({ unitPrice: 189, priceUnit: 'piece' }, {}, 3)).toBe(567)
  })

  it('multiplies by quantity', () => {
    expect(
      estimateVariantPrice(
        { unitPrice: 990, priceUnit: 'kg' },
        { kind: 'weight', weightGrams: 250 },
        2,
      ),
    ).toBe(495)
  })

  it('returns null when the estimate cannot be computed', () => {
    expect(estimateVariantPrice({ unitPrice: 990, priceUnit: 'kg' }, { kind: 'weight' })).toBeNull()
    expect(
      estimateVariantPrice({ unitPrice: 990, priceUnit: 'kg' }, { kind: 'weight', weightGrams: 0 }),
    ).toBeNull()
    expect(
      estimateVariantPrice(
        { unitPrice: 990, priceUnit: 'kg' },
        { kind: 'weight', weightGrams: null },
      ),
    ).toBeNull()
    expect(
      estimateVariantPrice(
        { unitPrice: -1, priceUnit: 'kg' },
        { kind: 'weight', weightGrams: 200 },
      ),
    ).toBeNull()
    expect(
      estimateVariantPrice(
        { unitPrice: Number.NaN, priceUnit: 'kg' },
        { kind: 'weight', weightGrams: 200 },
      ),
    ).toBeNull()
    expect(
      estimateVariantPrice(
        { unitPrice: 990, priceUnit: 'kg' },
        { kind: 'weight', weightGrams: 200 },
        0,
      ),
    ).toBeNull()
  })
})

describe('pricePerKg', () => {
  it('normalises to price per kg', () => {
    expect(pricePerKg({ unitPrice: 990, priceUnit: 'kg' })).toBe(990)
    expect(pricePerKg({ unitPrice: 99, priceUnit: '100g' })).toBe(990)
    expect(pricePerKg({ unitPrice: 189, priceUnit: 'piece' })).toBeNull()
  })
})

describe('vatRateToNumber', () => {
  it('converts stored select values to numbers', () => {
    expect(vatRateToNumber('12')).toBe(12)
    expect(vatRateToNumber('21')).toBe(21)
    expect(vatRateToNumber('0')).toBe(0)
  })

  it('falls back to the default food rate for missing values', () => {
    expect(vatRateToNumber(null)).toBe(12)
    expect(vatRateToNumber('abc')).toBe(12)
  })
})
