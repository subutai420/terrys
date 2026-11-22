import { describe, expect, it } from 'vitest'

import {
  SpaydError,
  buildSpayd,
  czechAccountToIban,
  formatIban,
  isValidIban,
  normalizeIban,
  parseBankAccount,
  sanitizeSpaydText,
} from './spayd'

// All account numbers below are the examples from the official specification
// (https://qr-platba.cz/pro-vyvojare/specifikace-formatu/) or tiny made-up numbers that only
// exist to pass the checksums ("123/0600"). None of them is the shop's account.
const SPEC_IBAN = 'CZ9106000000000000000123' // = 123/0600
const SPEC_IBAN_2 = 'CZ5855000000001265098001' // = 1265098001/5500

describe('IBAN helpers', () => {
  it('normalizes and formats', () => {
    expect(normalizeIban(' cz91 0600 0000 0000 0000 0123 ')).toBe(SPEC_IBAN)
    expect(formatIban(SPEC_IBAN)).toBe('CZ91 0600 0000 0000 0000 0123')
  })

  it('accepts valid IBANs (with spaces, lower case)', () => {
    expect(isValidIban(SPEC_IBAN)).toBe(true)
    expect(isValidIban(SPEC_IBAN_2)).toBe(true)
    expect(isValidIban('cz91 0600 0000 0000 0000 0123')).toBe(true)
    // The well-known ISO 13616 / ECBS example IBANs.
    expect(isValidIban('GB82 WEST 1234 5698 7654 32')).toBe(true)
    expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true)
  })

  it('rejects wrong check digits, typos and wrong lengths', () => {
    expect(isValidIban('CZ9206000000000000000123')).toBe(false) // check digits changed
    expect(isValidIban('CZ9106000000000000000124')).toBe(false) // one digit typo
    expect(isValidIban('CZ91060000000000000001')).toBe(false) // too short for CZ
    expect(isValidIban('SK910600000000000000012')).toBe(false) // SK must be 24
    expect(isValidIban('XX12')).toBe(false)
    expect(isValidIban('')).toBe(false)
  })
})

describe('czechAccountToIban', () => {
  it('converts the spec example accounts', () => {
    expect(czechAccountToIban('123/0600')).toBe(SPEC_IBAN)
    expect(czechAccountToIban('1265098001/5500')).toBe(SPEC_IBAN_2)
    expect(czechAccountToIban(' 000000-0000000123 / 0600 ')).toBe(SPEC_IBAN)
  })

  it('handles a prefix (19 passes the mod-11 check: 1·2 + 9·1 = 11)', () => {
    const iban = czechAccountToIban('19-123/0800')
    expect(iban).toMatch(/^CZ\d{2}08000000190000000123$/)
    expect(isValidIban(iban)).toBe(true)
  })

  it('rejects numbers failing the ČNB mod-11 check', () => {
    expect(() => czechAccountToIban('124/0600')).toThrow(SpaydError)
    expect(() => czechAccountToIban('18-123/0800')).toThrow(/Předčíslí/)
    expect(() => czechAccountToIban('124/0600')).toThrow(/Číslo účtu není platné/)
  })

  it('rejects a wrong format', () => {
    for (const bad of ['123', '123/06', '1234567-123/0600', '1/0600', '12345678901/0600']) {
      expect(() => czechAccountToIban(bad), bad).toThrow(SpaydError)
    }
  })
})

describe('parseBankAccount', () => {
  it('accepts a domestic number and shows it in domestic form', () => {
    expect(parseBankAccount('000019-0000000123/0800')).toMatchObject({
      ok: true,
      display: '19-123/0800',
    })
    expect(parseBankAccount('123/0600')).toEqual({ ok: true, iban: SPEC_IBAN, display: '123/0600' })
  })

  it('accepts a Czech IBAN and displays the domestic form', () => {
    expect(parseBankAccount('CZ91 0600 0000 0000 0000 0123')).toEqual({
      ok: true,
      iban: SPEC_IBAN,
      display: '123/0600',
    })
  })

  it('accepts a foreign IBAN and displays it grouped', () => {
    expect(parseBankAccount('de89370400440532013000')).toEqual({
      ok: true,
      iban: 'DE89370400440532013000',
      display: 'DE89 3704 0044 0532 0130 00',
    })
  })

  it('returns Czech error messages', () => {
    const empty = parseBankAccount('  ')
    expect(empty.ok).toBe(false)
    const badIban = parseBankAccount('CZ9206000000000000000123')
    expect(badIban).toEqual({ ok: false, error: expect.stringContaining('IBAN není platný') })
    const badDomestic = parseBankAccount('124/0600')
    expect(badDomestic).toEqual({ ok: false, error: expect.stringContaining('není platné') })
    const garbage = parseBankAccount('abc')
    expect(garbage.ok).toBe(false)
  })
})

describe('buildSpayd', () => {
  it('reproduces the official example exactly', () => {
    // Source: https://qr-platba.cz/pro-vyvojare/specifikace-formatu/ (section "Příklad").
    const official =
      'SPD*1.0*ACC:CZ9106000000000000000123*AM:450.00*CC:CZK*MSG:PLATBA ZA ZBOZI*X-VS:1234567890'
    expect(
      buildSpayd({
        iban: 'CZ91 0600 0000 0000 0000 0123',
        amount: 450,
        message: 'PLATBA ZA ZBOZI',
        variableSymbol: '1234567890',
      }),
    ).toBe(official)
  })

  it('writes ACC with +BIC like the spec attribute example', () => {
    // Spec attribute example: "ACC:CZ5855000000001265098001+RZBCCZPP*"
    const spayd = buildSpayd({ iban: SPEC_IBAN_2, bic: 'rzbcczpp', amount: 480.55 })
    expect(spayd).toBe('SPD*1.0*ACC:CZ5855000000001265098001+RZBCCZPP*AM:480.55*CC:CZK')
  })

  it('writes every supported field in the documented order', () => {
    expect(
      buildSpayd({
        iban: SPEC_IBAN,
        amount: 1000,
        currency: 'czk',
        dueDate: '2012-12-31',
        recipientName: 'PETR DVORAK',
        message: 'PLATBA ZA ELEKTRINU',
        variableSymbol: 1234567890,
        specificSymbol: '42',
        constantSymbol: '0308',
      }),
    ).toBe(
      'SPD*1.0*ACC:CZ9106000000000000000123*AM:1000.00*CC:CZK*DT:20121231*RN:PETR DVORAK' +
        '*MSG:PLATBA ZA ELEKTRINU*X-VS:1234567890*X-SS:42*X-KS:0308',
    )
  })

  it('omits optional fields that are empty', () => {
    expect(
      buildSpayd({
        iban: SPEC_IBAN,
        amount: 1,
        message: '',
        recipientName: null,
        variableSymbol: null,
        specificSymbol: '',
        dueDate: null,
      }),
    ).toBe('SPD*1.0*ACC:CZ9106000000000000000123*AM:1.00*CC:CZK')
  })

  it('formats amounts', () => {
    const am = (amount: number) => /\*AM:([^*]+)/.exec(buildSpayd({ iban: SPEC_IBAN, amount }))![1]
    expect(am(1000)).toBe('1000.00')
    expect(am(0.1 + 0.2)).toBe('0.30') // float noise is fine
    expect(am(2000.5)).toBe('2000.50')
    expect(am(9_999_999.99)).toBe('9999999.99')
  })

  it('rejects invalid amounts', () => {
    for (const amount of [0, -5, 10_000_000, 1.234, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => buildSpayd({ iban: SPEC_IBAN, amount }), String(amount)).toThrow(SpaydError)
    }
  })

  it('rejects an invalid IBAN, BIC, currency, symbol or date', () => {
    const base = { iban: SPEC_IBAN, amount: 100 }
    const code = (fn: () => unknown) => {
      try {
        fn()
      } catch (err) {
        return (err as SpaydError).code
      }
      return null
    }
    expect(code(() => buildSpayd({ ...base, iban: 'CZ9206000000000000000123' }))).toBe(
      'INVALID_IBAN',
    )
    expect(code(() => buildSpayd({ ...base, bic: 'RZB' }))).toBe('INVALID_BIC')
    expect(code(() => buildSpayd({ ...base, currency: 'KC' }))).toBe('INVALID_CURRENCY')
    expect(code(() => buildSpayd({ ...base, variableSymbol: '12345678901' }))).toBe(
      'INVALID_SYMBOL',
    )
    expect(code(() => buildSpayd({ ...base, variableSymbol: '12a' }))).toBe('INVALID_SYMBOL')
    expect(code(() => buildSpayd({ ...base, dueDate: '2026-02-30' }))).toBe('INVALID_DATE')
    expect(code(() => buildSpayd({ ...base, dueDate: '31.12.2026' }))).toBe('INVALID_DATE')
  })

  it('percent-encodes * and %, strips diacritics and typographic characters', () => {
    const spayd = buildSpayd({
      iban: SPEC_IBAN,
      amount: 100,
      message: 'Dárkový poukaz *2* – 100% „Žluťoučký kůň“ 🥩',
      recipientName: 'Terrys – řeznictví a steaky',
    })
    expect(spayd).toContain('*RN:Terrys - reznictvi a steaky*')
    expect(spayd).toContain('*MSG:Darkovy poukaz %2A2%2A - 100%25 "Zlutoucky kun"')
    // "SPD", "1.0" + 5 pairs (ACC, AM, CC, RN, MSG) → 7 parts; no literal * inside values.
    expect(spayd.split('*')).toHaveLength(7)
  })

  it('truncates MSG to 60 and RN to 35 characters without splitting an escape', () => {
    const spayd = buildSpayd({
      iban: SPEC_IBAN,
      amount: 100,
      message: 'x'.repeat(58) + '*abc',
      recipientName: 'R'.repeat(50),
    })
    const msg = /\*MSG:([^*]*)/.exec(spayd)![1]!
    const rn = /\*RN:([^*]*)/.exec(spayd)![1]!
    // "%2A" would need 3 characters at position 59 → it is left out entirely.
    expect(msg).toBe('x'.repeat(58))
    expect(rn).toBe('R'.repeat(35))
  })
})

describe('sanitizeSpaydText', () => {
  it('collapses whitespace and trims, returns empty for nothing usable', () => {
    expect(sanitizeSpaydText('  a \n\t b  ', 60)).toBe('a b')
    expect(sanitizeSpaydText('🥩🥩', 60)).toBe('')
    expect(sanitizeSpaydText('ab cd', 3)).toBe('ab')
  })
})
