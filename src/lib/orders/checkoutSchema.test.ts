import { describe, expect, it } from 'vitest'

import { parseCheckoutInput } from './checkoutSchema'
import { isValidEmail, normalizeDic, normalizeIco, normalizePhone } from './validators'

describe('validators', () => {
  it('normalises Czech phone numbers', () => {
    expect(normalizePhone('602123456')).toBe('+420 602 123 456')
    expect(normalizePhone('602 123 456')).toBe('+420 602 123 456')
    expect(normalizePhone('+420 602-123-456')).toBe('+420 602 123 456')
    expect(normalizePhone('00420602123456')).toBe('+420 602 123 456')
    expect(normalizePhone('+421 902 123 456')).toBe('+421 902 123 456')
    expect(normalizePhone('12345678')).toBe(null)
    expect(normalizePhone('012345678')).toBe(null)
    expect(normalizePhone('+49 1512 3456789')).toBe(null)
    expect(normalizePhone('abc')).toBe(null)
  })

  it('checks IČO with the modulo-11 digit', () => {
    expect(normalizeIco('45274649')).toBe('45274649') // valid check digit
    expect(normalizeIco('25596641')).toBe('25596641')
    expect(normalizeIco('45274648')).toBe(null)
    expect(normalizeIco('1234')).toBe(null)
  })

  it('normalises DIČ', () => {
    expect(normalizeDic('cz 27082440')).toBe('CZ27082440')
    expect(normalizeDic('27082440')).toBe('CZ27082440')
    expect(normalizeDic('SK2020')).toBe(null)
  })

  it('checks e-mails pragmatically', () => {
    expect(isValidEmail('jana@example.cz')).toBe(true)
    expect(isValidEmail('jana@example')).toBe(false)
    expect(isValidEmail('jana example.cz')).toBe(false)
  })
})

const valid = {
  checkoutId: '7b0c3c8e-8a8b-4bb4-9a8d-3f1c4c2b9d10',
  formToken: 'x',
  lines: [{ productId: 1, variantId: 'abc', quantity: 2 }],
  delivery: { postcode: '120 00', methodId: 1, date: '2026-11-24' },
  customer: {
    firstName: ' Jana ',
    lastName: 'Nováková',
    email: 'Jana@Example.cz',
    phone: '602 123 456',
  },
  address: { street: 'Italská 17', city: 'Praha 2', postcode: '12000' },
  consents: { terms: true, newsletter: false, heurekaOptOut: false },
}

describe('parseCheckoutInput', () => {
  it('accepts a valid order and normalises values', () => {
    const result = parseCheckoutInput(valid, true)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.customer.firstName).toBe('Jana')
    expect(result.data.customer.email).toBe('jana@example.cz')
    expect(result.data.customer.phone).toBe('+420 602 123 456')
    expect(result.data.delivery?.postcode).toBe('12000')
    expect(result.address?.postcode).toBe('12000')
  })

  it('drops prices sent by the client', () => {
    const result = parseCheckoutInput(
      { ...valid, lines: [{ ...valid.lines[0], unitPrice: 1, estimatedPrice: 1 }], total: 1 },
      true,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.lines[0]).toEqual({ productId: 1, variantId: 'abc', quantity: 2 })
    expect(result.data).not.toHaveProperty('total')
  })

  it('returns Czech messages per field', () => {
    const result = parseCheckoutInput(
      {
        ...valid,
        customer: { ...valid.customer, email: 'nope', phone: '123', ico: '1234' },
        consents: { terms: false },
      },
      true,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors['customer.email']).toMatch(/e-mail/)
    expect(result.errors['customer.phone']).toMatch(/telefon/)
    expect(result.errors['customer.ico']).toMatch(/IČO/)
    expect(result.errors['consents.terms']).toMatch(/obchodními podmínkami/)
  })

  it('requires an address for delivery, matching the delivery postcode', () => {
    const missing = parseCheckoutInput({ ...valid, address: undefined }, true)
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.errors['address.street']).toBeTruthy()

    const other = parseCheckoutInput(
      { ...valid, address: { ...valid.address, postcode: '25001' } },
      true,
    )
    expect(other.ok).toBe(false)
    if (!other.ok) expect(other.errors['address.postcode']).toMatch(/PSČ/)

    const noNumber = parseCheckoutInput(
      { ...valid, address: { ...valid.address, street: 'Italská' } },
      true,
    )
    expect(noNumber.ok).toBe(false)
  })

  it('pickup needs no address', () => {
    expect(parseCheckoutInput({ ...valid, address: undefined }, false).ok).toBe(true)
  })

  it('rejects absurd quantities and empty carts', () => {
    expect(parseCheckoutInput({ ...valid, lines: [] }, true).ok).toBe(false)
    expect(
      parseCheckoutInput(
        { ...valid, lines: [{ productId: 1, variantId: null, quantity: 500 }] },
        true,
      ).ok,
    ).toBe(false)
  })
})
