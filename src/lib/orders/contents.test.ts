import { describe, expect, it } from 'vitest'

import { isEstimate, orderContents, paymentStep, preparationStep } from './contents'

const meat = { priceUnit: 'kg', variantId: 'abc123' }
const printed = { priceUnit: 'piece', variantId: 'printed' }
const box = { priceUnit: 'piece', variantId: null }

describe('order contents wording', () => {
  it('meat only: butcher wording and an estimate', () => {
    const c = orderContents([meat])
    expect(preparationStep(c)).toBe('Řezník maso naporcuje a zváží.')
    expect(isEstimate(c)).toBe(true)
    expect(paymentStep(c, { withDelivery: true })).toContain(
      'podle skutečné hmotnosti (včetně dopravy)',
    )
  })

  it('printed voucher only: no meat wording, fixed amount', () => {
    const c = orderContents([printed])
    expect(preparationStep(c)).toBe('Připravíme tištěný dárkový poukaz.')
    expect(preparationStep(c)).not.toMatch(/maso|řezník|zváž/i)
    expect(isEstimate(c)).toBe(false)
    expect(paymentStep(c, { withDelivery: false })).toBe('Zaplatíte částku uvedenou v objednávce.')
  })

  it('meat and printed voucher together', () => {
    const c = orderContents([meat, printed])
    expect(preparationStep(c)).toContain('naporcuje a zváží')
    expect(preparationStep(c)).toContain('dárkový poukaz')
    expect(isEstimate(c)).toBe(true)
  })

  it('printed voucher with a gift box, and fixed goods only', () => {
    expect(preparationStep(orderContents([printed, box]))).toBe(
      'Připravíme tištěný dárkový poukaz a ostatní zboží.',
    )
    expect(preparationStep(orderContents([box]))).toBe('Objednávku pro vás připravíme.')
    expect(isEstimate(orderContents([box]))).toBe(false)
  })
})
