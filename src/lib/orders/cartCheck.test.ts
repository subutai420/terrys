import { describe, expect, it } from 'vitest'

import { type CatalogProduct, checkCartLines, mergeLines } from './cartCheck'

const ribEye: CatalogProduct = {
  id: 1,
  title: 'Rib Eye',
  price: 990,
  priceUnit: 'kg',
  vatRate: '12',
  availability: 'in-stock',
  sku: null,
  url: '/rib-eye',
  imageUrl: null,
  variants: [
    {
      id: 'v250',
      label: '250 g',
      kind: 'weight',
      weightGrams: 250,
      availability: null,
      sortOrder: null,
    },
    {
      id: 'v500',
      label: '500 g',
      kind: 'weight',
      weightGrams: 500,
      availability: 'sold-out',
      sortOrder: null,
    },
  ],
}
const sauce: CatalogProduct = {
  ...ribEye,
  id: 2,
  title: 'Omáčka',
  price: 149,
  priceUnit: 'piece',
  vatRate: '21',
  variants: [],
}
const soldOut: CatalogProduct = { ...ribEye, id: 3, title: 'Picanha', availability: 'sold-out' }
const products = new Map([ribEye, sauce, soldOut].map((p) => [p.id, p]))

describe('checkCartLines', () => {
  it('resolves valid lines with server prices', () => {
    const result = checkCartLines(
      [
        { productId: 1, variantId: 'v250', quantity: 3 },
        { productId: 2, variantId: null, quantity: 2 },
      ],
      products,
    )
    expect(result.problems).toEqual([])
    expect(result.lines.map((l) => [l.estimatedPrice, l.lineEstimate])).toEqual([
      [248, 743],
      [149, 298],
    ])
    expect(result.lines[1].weightGrams).toBe(null)
  })

  it('reports gone products, sold-out products and variants, missing variants', () => {
    const result = checkCartLines(
      [
        { productId: 99, variantId: 'x', quantity: 1, snapshot: { title: 'Zmizelý steak' } },
        { productId: 3, variantId: 'v250', quantity: 1 },
        { productId: 1, variantId: 'v500', quantity: 1 },
        { productId: 1, variantId: 'nope', quantity: 1, snapshot: { variantLabel: '1 kg' } },
        { productId: 1, variantId: null, quantity: 1 },
      ],
      products,
    )
    expect(result.lines).toEqual([])
    expect(result.problems.map((p) => p.code)).toEqual([
      'gone',
      'sold-out',
      'sold-out',
      'variant-gone',
      'variant-gone',
    ])
    expect(result.problems[0].message).toContain('Zmizelý steak')
    expect(result.problems[3].message).toContain('1 kg')
  })

  it('tells about price and weight changes since the line was added', () => {
    const result = checkCartLines(
      [
        {
          productId: 1,
          variantId: 'v250',
          quantity: 1,
          snapshot: { unitPrice: 890, weightGrams: 250 },
        },
        { productId: 2, variantId: null, quantity: 1, snapshot: { unitPrice: 149 } },
      ],
      new Map([
        [1, { ...ribEye, variants: [{ ...ribEye.variants[0], weightGrams: 300 }] }],
        [2, sauce],
      ]),
    )
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0].message).toMatch(/890.*990/)
    expect(result.lines[0].lineEstimate).toBe(297)
  })

  it('merges duplicate lines', () => {
    expect(
      mergeLines([
        { productId: 1, variantId: 'a', quantity: 60 },
        { productId: 1, variantId: 'a', quantity: 60 },
      ]),
    ).toEqual([{ productId: 1, variantId: 'a', quantity: 99 }])
  })
})
