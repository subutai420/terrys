import { describe, expect, it } from 'vitest'

import { checkRedemption, effectiveVoucherStatus, statusForBalance } from './balance'
import { cartKind } from './cart'
import {
  BATCH_LETTERS,
  batchLetterOf,
  CODE_ALPHABET,
  formatVoucherCode,
  generateVoucherCode,
  isShopVoucherCode,
  normalizeVoucherCode,
} from './code'

describe('voucher codes', () => {
  it('has the XXXX-XXXX-XX[letter]-XXX format with the batch letter at a fixed place', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateVoucherCode('K')
      expect(code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{2}K-[2-9A-Z]{3}$/)
      const normalized = normalizeVoucherCode(code)
      expect(isShopVoucherCode(normalized)).toBe(true)
      expect(batchLetterOf(normalized)).toBe('K')
    }
  })

  it('never uses ambiguous characters', () => {
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/)
    expect(BATCH_LETTERS).not.toMatch(/[0-9OIL]/)
    const all = Array.from({ length: 300 }, () => generateVoucherCode('A')).join('')
    expect(all).not.toMatch(/[01OIL]/)
  })

  it('refuses an invalid batch letter', () => {
    expect(() => generateVoucherCode('O')).toThrow()
    expect(() => generateVoucherCode('1')).toThrow()
    expect(() => generateVoucherCode('AB')).toThrow()
  })

  it('is uniformly distributed (chi-square over 20 000 codes)', () => {
    const counts = new Map<string, number>()
    const n = 20_000
    for (let i = 0; i < n; i++) {
      const raw = normalizeVoucherCode(generateVoucherCode('B')).replace(/^(.{10})B/, '$1')
      for (const ch of raw) counts.set(ch, (counts.get(ch) ?? 0) + 1)
    }
    const total = n * 13
    const expected = total / CODE_ALPHABET.length
    let chi = 0
    for (const ch of CODE_ALPHABET) chi += ((counts.get(ch) ?? 0) - expected) ** 2 / expected
    // 30 degrees of freedom: p = 0.001 critical value ≈ 59.7
    expect(chi).toBeLessThan(59.7)
    expect(counts.size).toBe(CODE_ALPHABET.length)
  })

  it('produces no duplicates in 50 000 codes', () => {
    const set = new Set<string>()
    for (let i = 0; i < 50_000; i++) set.add(generateVoucherCode('C'))
    expect(set.size).toBe(50_000)
  })

  it('normalises typed input (spaces, dashes, lowercase)', () => {
    expect(normalizeVoucherCode(' k7mq 3xpa-9tc r4w ')).toBe('K7MQ3XPA9TCR4W')
    expect(normalizeVoucherCode('K7MQ–3XPA.9TC/R4W')).toBe('K7MQ3XPA9TCR4W')
    expect(formatVoucherCode('K7MQ3XPA9TCR4W')).toBe('K7MQ-3XPA-9TC-R4W')
    expect(formatVoucherCode('OLD123')).toBe('OLD123')
    expect(isShopVoucherCode('OLD123')).toBe(false)
  })

  it('uses the injected random source', () => {
    const zero = (bytes: Uint8Array) => bytes.fill(0)
    expect(generateVoucherCode('D', zero)).toBe('2222-2222-22D-222')
  })
})

describe('voucher balance', () => {
  const paid = { status: 'paid' as const, value: 2000, balance: 2000, expiresOn: '2027-12-31' }

  it('allows partial redemption and tracks the status', () => {
    const r = checkRedemption(paid, 1500, '2027-01-10')
    expect(r).toEqual({ ok: true, newBalance: 500, newStatus: 'partially-redeemed' })
    const rest = checkRedemption(
      { ...paid, balance: 500, status: 'partially-redeemed' },
      500,
      '2027-02-01',
    )
    expect(rest).toEqual({ ok: true, newBalance: 0, newStatus: 'redeemed' })
  })

  it('refuses more than the balance, unpaid, cancelled and expired vouchers', () => {
    expect(checkRedemption({ ...paid, balance: 300 }, 301, '2027-01-01')).toMatchObject({
      ok: false,
      code: 'insufficient',
    })
    expect(checkRedemption({ ...paid, status: 'issued' }, 100, '2027-01-01')).toMatchObject({
      code: 'not-paid',
    })
    expect(checkRedemption({ ...paid, status: 'cancelled' }, 100, '2027-01-01')).toMatchObject({
      code: 'cancelled',
    })
    expect(checkRedemption(paid, 100, '2028-01-01')).toMatchObject({ code: 'expired' })
    expect(
      checkRedemption({ ...paid, balance: 0, status: 'redeemed' }, 1, '2027-01-01'),
    ).toMatchObject({
      code: 'used-up',
    })
    expect(checkRedemption(paid, 0, '2027-01-01')).toMatchObject({ code: 'invalid-amount' })
    expect(checkRedemption(paid, 10.5, '2027-01-01')).toMatchObject({ code: 'invalid-amount' })
  })

  it('is valid ON the expiry day', () => {
    expect(checkRedemption(paid, 100, '2027-12-31').ok).toBe(true)
  })

  it('counts what the same order already redeemed (editing a payment row)', () => {
    const v = { ...paid, balance: 0, status: 'redeemed' as const }
    expect(checkRedemption(v, 1800, '2027-01-01', 2000)).toEqual({
      ok: true,
      newBalance: 200,
      newStatus: 'partially-redeemed',
    })
  })

  it('derives expired and the status for a balance', () => {
    expect(effectiveVoucherStatus(paid, '2028-01-01')).toBe('expired')
    expect(effectiveVoucherStatus({ ...paid, status: 'redeemed' }, '2028-01-01')).toBe('redeemed')
    expect(statusForBalance(1000, 1000)).toBe('paid')
    expect(statusForBalance(1000, 1)).toBe('partially-redeemed')
    expect(statusForBalance(1000, 0)).toBe('redeemed')
  })
})

describe('cart kind', () => {
  it('classifies carts', () => {
    expect(cartKind([])).toBe('empty')
    expect(cartKind([{ variantId: 'abc' }, { variantId: null }])).toBe('goods')
    expect(cartKind([{ variantId: 'printed' }, { variantId: 'abc' }])).toBe('goods')
    expect(cartKind([{ variantId: 'electronic' }, { variantId: 'electronic' }])).toBe(
      'electronic-vouchers',
    )
    expect(cartKind([{ variantId: 'electronic' }, { variantId: 'printed' }])).toBe(
      'mixed-electronic',
    )
  })
})
