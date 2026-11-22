import { describe, expect, it } from 'vitest'

import {
  cutList,
  estimatedLineGrams,
  formatDeviation,
  isOverTolerance,
  isWeighingComplete,
  lineProblem,
  orderGrams,
  ordersCountText,
  parseGrams,
  type WeighLine,
  weighingNeedsReview,
  weightDeviation,
} from './fulfilment'

const line = (over: Partial<WeighLine> = {}): WeighLine => ({
  productTitle: 'Rib Eye',
  variantLabel: '250 g',
  quantity: 2,
  unitPrice: 990,
  priceUnit: 'kg',
  vatRate: '12',
  estimatedWeightGrams: 250,
  estimatedPrice: 495,
  ...over,
})

describe('tolerance', () => {
  it('compares the actual line weight with the estimated total', () => {
    expect(estimatedLineGrams(line())).toBe(500)
    expect(weightDeviation(500, 575)).toBeCloseTo(0.15)
  })

  it('exactly 15 % is fine, more is over (both directions)', () => {
    expect(isOverTolerance(500, 575, 15)).toBe(false)
    expect(isOverTolerance(500, 425, 15)).toBe(false)
    expect(isOverTolerance(500, 576, 15)).toBe(true)
    expect(isOverTolerance(500, 424, 15)).toBe(true)
    expect(isOverTolerance(500, 560, 10)).toBe(true)
    expect(isOverTolerance(null, 560, 10)).toBe(false)
  })

  it('formats the deviation', () => {
    expect(formatDeviation(0.123)).toBe('+12 %')
    expect(formatDeviation(-0.04)).toBe('−4 %')
    expect(formatDeviation(0)).toBe('±0 %')
    expect(formatDeviation(null)).toBe('')
  })
})

describe('line resolution', () => {
  it('unweighed / weighed / over tolerance without and with a note', () => {
    expect(lineProblem(line(), 15)).toBe('nezváženo')
    expect(lineProblem(line({ resolution: 'weighed', actualWeightGrams: 520 }), 15)).toBe(null)
    expect(lineProblem(line({ resolution: 'weighed', actualWeightGrams: 700 }), 15)).toMatch(
      /důvod/,
    )
    expect(
      lineProblem(
        line({ resolution: 'weighed', actualWeightGrams: 700, toleranceNote: 'celý kus' }),
        15,
      ),
    ).toBe(null)
  })

  it('substitution needs a note, unavailable and piece items need nothing', () => {
    expect(lineProblem(line({ resolution: 'substituted', actualWeightGrams: 500 }), 15)).toMatch(
      /nahrazeno/,
    )
    expect(
      lineProblem(
        line({ resolution: 'substituted', actualWeightGrams: 500, weighNote: 'Chuck' }),
        15,
      ),
    ).toBe(null)
    expect(lineProblem(line({ resolution: 'unavailable' }), 15)).toBe(null)
    expect(lineProblem(line({ priceUnit: 'piece', estimatedWeightGrams: null }), 15)).toBe(null)
  })

  it('weighing is complete only when every line is resolved', () => {
    const done = line({ resolution: 'weighed', actualWeightGrams: 510 })
    expect(isWeighingComplete([done, line({ priceUnit: 'piece' })], 15)).toBe(true)
    expect(isWeighingComplete([done, line()], 15)).toBe(false)
    expect(isWeighingComplete([], 15)).toBe(false)
  })

  it('review reasons for staff', () => {
    const reasons = weighingNeedsReview(
      [
        line({ resolution: 'weighed', actualWeightGrams: 700, toleranceNote: 'celý kus' }),
        line({ resolution: 'unavailable', weighNote: 'došlo' }),
        line({ resolution: 'weighed', actualWeightGrams: 500 }),
      ],
      15,
    )
    expect(reasons).toHaveLength(2)
    expect(reasons[0]).toContain('+40 %')
    expect(reasons[1]).toContain('není k dispozici')
  })
})

describe('parseGrams', () => {
  it('accepts grams with spaces and kg with a comma', () => {
    expect(parseGrams('523')).toBe(523)
    expect(parseGrams('1 250')).toBe(1250)
    expect(parseGrams('1,25 kg')).toBe(1250)
    expect(parseGrams('480g')).toBe(480)
  })
  it('rejects nonsense', () => {
    expect(parseGrams('')).toBe(null)
    expect(parseGrams('0')).toBe(null)
    expect(parseGrams('abc')).toBe(null)
    expect(parseGrams('12.5')).toBe(null)
    expect(parseGrams('9999999')).toBe(null)
  })
})

describe('cut list and kg', () => {
  it('sums pieces and target weights per product + variant across orders', () => {
    const rows = cutList([
      {
        orderNumber: '1',
        lines: [line(), line({ variantLabel: '500 g', estimatedWeightGrams: 500, quantity: 1 })],
      },
      {
        orderNumber: '2',
        lines: [
          line({ quantity: 1 }),
          line({
            productTitle: 'Omáčka',
            priceUnit: 'piece',
            estimatedWeightGrams: null,
            variantLabel: null,
            quantity: 3,
          }),
        ],
      },
    ])
    expect(rows).toEqual([
      { productTitle: 'Omáčka', variantLabel: null, pieces: 3, totalGrams: null, orders: ['2'] },
      {
        productTitle: 'Rib Eye',
        variantLabel: '250 g',
        pieces: 3,
        totalGrams: 750,
        orders: ['1', '2'],
      },
      { productTitle: 'Rib Eye', variantLabel: '500 g', pieces: 1, totalGrams: 500, orders: ['1'] },
    ])
  })

  it('order weight uses the actual weight once weighed', () => {
    expect(
      orderGrams([
        line(),
        line({ resolution: 'weighed', actualWeightGrams: 610 }),
        line({ resolution: 'unavailable' }),
      ]),
    ).toBe(1110)
  })
})

describe('ordersCountText', () => {
  it('Czech plural', () => {
    expect([1, 3, 5, 0].map(ordersCountText)).toEqual([
      '1 objednávka',
      '3 objednávky',
      '5 objednávek',
      '0 objednávek',
    ])
  })
})
