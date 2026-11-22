/**
 * Czech "QR Platba" – the SPAYD string (Short Payment Descriptor) that Czech banking apps read
 * from a QR code to pre-fill a bank transfer.
 *
 * Specification: Czech Banking Association (ČBA) standard, published at
 * https://qr-platba.cz/pro-vyvojare/specifikace-formatu/ (checked 2026-11). In short:
 *
 *   SPD*1.0*ACC:CZ9106000000000000000123*AM:450.00*CC:CZK*MSG:PLATBA ZA ZBOZI*X-VS:1234567890
 *
 * - header `SPD*1.0*`, then `KEY:value` pairs separated by `*`;
 * - a value must never contain a literal `*`; values may be percent-encoded (URL encoding),
 *   so `*` is written as `%2A`;
 * - when a value is longer than the key's maximum, banks read only the first N characters.
 *
 * Decisions made here (the spec leaves them open):
 *
 * - **Key order** is fixed and documented: ACC, AM, CC, DT, RN, MSG, X-VS, X-SS, X-KS.
 *   The spec says the order does not matter (only the header must be first); this order matches
 *   the official example so our output for the same data is byte-identical to it.
 *   No trailing `*` after the last pair, again as in the official example.
 * - **Diacritics are removed** from MSG and RN ("Dárkový poukaz" → "Darkovy poukaz"). The spec
 *   allows percent-encoded UTF-8, but Table 3 of the spec lists only which keys all Czech banks
 *   process, not how they decode non-ASCII text, and some banking apps show such text garbled.
 *   Plain ASCII is shown correctly everywhere. Letter case is kept.
 * - Other characters outside printable ASCII (emoji, typographic quotes…) are replaced by an
 *   ASCII look-alike or dropped; `*` and `%` are percent-encoded (`%2A`, `%25` – `%` must be
 *   encoded too, otherwise a bank that URL-decodes values would misread e.g. "100%2A").
 * - **MSG and RN are truncated** (to 60 / 35 characters of the encoded value, never cutting an
 *   `%XX` sequence in half). A shortened note is harmless; everything that decides where the money
 *   goes or how much (IBAN, BIC, amount, currency, symbols, date) is validated instead and an
 *   invalid value throws a `SpaydError`.
 * - The optional CRC32 key is not written (banks do not require it).
 *
 * This file is pure (no dependencies) so it can be used anywhere – admin validation, e-mails,
 * tests.
 */

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

export type SpaydErrorCode =
  | 'INVALID_IBAN'
  | 'INVALID_BIC'
  | 'INVALID_AMOUNT'
  | 'INVALID_CURRENCY'
  | 'INVALID_SYMBOL'
  | 'INVALID_DATE'
  | 'INVALID_ACCOUNT'

/**
 * Thrown for input that would make a wrong payment (bad IBAN, amount, symbol…).
 * `message` is in Czech for `INVALID_ACCOUNT` / `INVALID_IBAN` (it can be shown in the admin),
 * English otherwise (programming errors).
 */
export class SpaydError extends Error {
  readonly code: SpaydErrorCode

  constructor(code: SpaydErrorCode, message: string) {
    super(message)
    this.name = 'SpaydError'
    this.code = code
  }
}

// ---------------------------------------------------------------------------------------------
// IBAN
// ---------------------------------------------------------------------------------------------

/** Removes all whitespace and upper-cases: "cz91 0600 …" → "CZ910600…". */
export function normalizeIban(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase()
}

/**
 * Known IBAN lengths for the countries a Czech shop is likely to see. Other countries are only
 * checked against the general ISO 13616 range of 15–34 characters.
 */
const IBAN_LENGTHS: Record<string, number> = {
  CZ: 24,
  SK: 24,
  AT: 20,
  DE: 22,
  PL: 28,
  HU: 28,
}

/** ISO 7064 mod 97-10 of a long digit string, computed in chunks (no BigInt needed). */
function mod97(digits: string): number {
  let remainder = 0
  for (let i = 0; i < digits.length; i += 7) {
    remainder = Number(String(remainder) + digits.slice(i, i + 7)) % 97
  }
  return remainder
}

/**
 * ISO 13616 IBAN check: format, country length and the mod-97 checksum
 * (move the first 4 characters to the end, letters → numbers A=10…Z=35, result mod 97 must be 1).
 * Accepts spaces / lower case (the input is normalised first).
 */
export function isValidIban(iban: string): boolean {
  const value = normalizeIban(iban)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(value)) return false
  const expectedLength = IBAN_LENGTHS[value.slice(0, 2)]
  if (expectedLength !== undefined) {
    if (value.length !== expectedLength) return false
  } else if (value.length < 15 || value.length > 34) {
    return false
  }
  const rearranged = value.slice(4) + value.slice(0, 4)
  const digits = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55))
  return mod97(digits) === 1
}

/** Groups of four for display: "CZ9106000000000000000123" → "CZ91 0600 0000 0000 0000 0123". */
export function formatIban(iban: string): string {
  return normalizeIban(iban).replace(/(.{4})(?=.)/g, '$1 ')
}

// ---------------------------------------------------------------------------------------------
// Czech domestic account numbers
// ---------------------------------------------------------------------------------------------

/**
 * Weights of the Czech account-number check (vyhláška ČNB č. 169/2011 Sb.). The 10-digit basic
 * number, left-padded with zeros, is multiplied digit by digit with these weights (the rightmost
 * digit has weight 1); the sum must be divisible by 11. The 6-digit prefix uses the last six
 * weights (10, 5, 8, 4, 2, 1).
 */
const ACCOUNT_WEIGHTS = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1]

function passesMod11(digits: string): boolean {
  const weights = ACCOUNT_WEIGHTS.slice(ACCOUNT_WEIGHTS.length - digits.length)
  let sum = 0
  for (let i = 0; i < digits.length; i++) sum += Number(digits[i]) * weights[i]!
  return sum % 11 === 0
}

const DOMESTIC_ACCOUNT = /^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/

/** Computes the two IBAN check digits for a country + BBAN. */
function ibanCheckDigits(country: string, bban: string): string {
  const digits = (bban + country + '00').replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55))
  return String(98 - mod97(digits)).padStart(2, '0')
}

/**
 * Czech domestic account "[prefix-]number/bankCode" → IBAN "CZkk BBBB PPPPPP NNNNNNNNNN"
 * (returned without spaces). Throws `SpaydError('INVALID_ACCOUNT')` with a Czech message when the
 * format or the mod-11 check of the prefix or number is wrong.
 */
export function czechAccountToIban(account: string): string {
  const match = DOMESTIC_ACCOUNT.exec(account.replace(/\s+/g, ''))
  if (!match) {
    throw new SpaydError(
      'INVALID_ACCOUNT',
      'Číslo účtu musí mít tvar „předčíslí-číslo/kód banky“ nebo „číslo/kód banky“ (kód banky má 4 číslice).',
    )
  }
  const prefix = (match[1] ?? '').padStart(6, '0')
  const number = match[2]!.padStart(10, '0')
  const bankCode = match[3]!
  if (!passesMod11(prefix)) {
    throw new SpaydError(
      'INVALID_ACCOUNT',
      'Předčíslí účtu není platné (neprošlo kontrolou podle vyhlášky ČNB). Zkontrolujte překlepy.',
    )
  }
  if (Number(number) === 0 || !passesMod11(number)) {
    throw new SpaydError(
      'INVALID_ACCOUNT',
      'Číslo účtu není platné (neprošlo kontrolou podle vyhlášky ČNB). Zkontrolujte překlepy.',
    )
  }
  const bban = bankCode + prefix + number
  return `CZ${ibanCheckDigits('CZ', bban)}${bban}`
}

/** Czech IBAN → domestic display form, e.g. "123/0600" or "19-…/0800" (leading zeros dropped). */
function czechIbanToDomestic(iban: string): string {
  const bankCode = iban.slice(4, 8)
  const prefix = iban.slice(8, 14).replace(/^0+/, '')
  const number = iban.slice(14).replace(/^0+/, '')
  return `${prefix ? `${prefix}-` : ''}${number}/${bankCode}`
}

export type ParsedBankAccount =
  { ok: true; iban: string; display: string } | { ok: false; error: string }

/**
 * Parses what an admin types into a "bank account" field: either an IBAN (spaces allowed) or a
 * Czech domestic number. Returns the IBAN (no spaces) and a display form (domestic format for
 * Czech accounts, grouped IBAN otherwise), or a Czech error message for field validation.
 */
export function parseBankAccount(input: string): ParsedBankAccount {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, error: 'Vyplňte číslo účtu.' }

  const compact = normalizeIban(trimmed)
  if (/^[A-Z]{2}/.test(compact)) {
    if (!isValidIban(compact)) {
      return {
        ok: false,
        error: 'IBAN není platný (špatná délka nebo kontrolní číslice). Zkontrolujte překlepy.',
      }
    }
    if (compact.startsWith('CZ')) {
      // A Czech IBAN also carries a domestic number; check it too, it catches more typos.
      const domestic = czechIbanToDomestic(compact)
      try {
        czechAccountToIban(domestic)
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
      return { ok: true, iban: compact, display: domestic }
    }
    return { ok: true, iban: compact, display: formatIban(compact) }
  }

  try {
    const iban = czechAccountToIban(trimmed)
    return { ok: true, iban, display: czechIbanToDomestic(iban) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// ---------------------------------------------------------------------------------------------
// SPAYD
// ---------------------------------------------------------------------------------------------

export type SpaydInput = {
  /** IBAN, spaces allowed. Validated (mod-97). */
  iban: string
  /** Optional SWIFT/BIC, appended to ACC as "+BIC". */
  bic?: string | null
  /** Amount in currency units, > 0, max 9 999 999.99, at most 2 decimals. */
  amount: number
  /** ISO 4217 code, default CZK. */
  currency?: string
  /** Variabilní symbol – up to 10 digits. */
  variableSymbol?: string | number | null
  /** Specifický symbol – up to 10 digits. */
  specificSymbol?: string | number | null
  /** Konstantní symbol – up to 10 digits. */
  constantSymbol?: string | number | null
  /** Message for the payee – diacritics removed, truncated to 60 characters. */
  message?: string | null
  /** Payee name – diacritics removed, truncated to 35 characters. */
  recipientName?: string | null
  /** Due date 'YYYY-MM-DD'. */
  dueDate?: string | null
}

export const SPAYD_MAX_AMOUNT = 9_999_999.99
export const SPAYD_MSG_MAX = 60
export const SPAYD_RN_MAX = 35

/** Common non-ASCII punctuation that has an obvious ASCII stand-in. */
const ASCII_REPLACEMENTS: Record<string, string> = {
  '–': '-',
  '—': '-',
  '‑': '-',
  '„': '"',
  '“': '"',
  '”': '"',
  '‚': "'",
  '‘': "'",
  '’': "'",
  '…': '...',
  ' ': ' ',
  ' ': ' ',
}

/**
 * Makes free text safe for a SPAYD value: removes diacritics, replaces/drops other non-ASCII
 * characters, collapses whitespace, percent-encodes `%` and `*`, and cuts the encoded value to
 * `maxLength` without splitting an `%XX` sequence. Returns '' when nothing is left.
 */
export function sanitizeSpaydText(text: string, maxLength: number): string {
  const ascii = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining accents: "á" = "a" + U+0301 after NFD
    .replace(/./gu, (ch) => ASCII_REPLACEMENTS[ch] ?? ch)
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7e]/g, '')
    .trim()

  let out = ''
  for (const ch of ascii) {
    const encoded = ch === '%' ? '%25' : ch === '*' ? '%2A' : ch
    if (out.length + encoded.length > maxLength) break
    out += encoded
  }
  // No whitespace may touch the ':' / '*' delimiters.
  return out.trimEnd()
}

function formatAmount(amount: number): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new SpaydError('INVALID_AMOUNT', `Amount must be a positive number, got ${amount}.`)
  }
  if (amount > SPAYD_MAX_AMOUNT) {
    throw new SpaydError('INVALID_AMOUNT', `Amount ${amount} exceeds ${SPAYD_MAX_AMOUNT}.`)
  }
  const cents = Math.round(amount * 100)
  if (Math.abs(amount * 100 - cents) > 1e-6) {
    throw new SpaydError('INVALID_AMOUNT', `Amount ${amount} has more than 2 decimal places.`)
  }
  return (cents / 100).toFixed(2)
}

function formatSymbol(name: string, value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  const str = String(value).trim()
  if (!/^\d{1,10}$/.test(str)) {
    throw new SpaydError('INVALID_SYMBOL', `${name} must be 1–10 digits, got "${str}".`)
  }
  return str
}

function formatDueDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match) {
    const [, y, m, d] = match
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
    if (
      date.getUTCFullYear() === Number(y) &&
      date.getUTCMonth() === Number(m) - 1 &&
      date.getUTCDate() === Number(d)
    ) {
      return `${y}${m}${d}`
    }
  }
  throw new SpaydError('INVALID_DATE', `Due date must be a real date 'YYYY-MM-DD', got "${value}".`)
}

/**
 * Builds the SPAYD string for a QR Platba code. Throws `SpaydError` for an invalid IBAN, BIC,
 * amount, currency, symbol or date; truncates MSG / RN (see the decisions at the top of the file).
 */
export function buildSpayd(input: SpaydInput): string {
  const iban = normalizeIban(input.iban)
  if (!isValidIban(iban)) {
    throw new SpaydError('INVALID_IBAN', 'IBAN není platný.')
  }
  let acc = iban
  if (input.bic) {
    const bic = input.bic.replace(/\s+/g, '').toUpperCase()
    // ISO 9362: 4 letters bank, 2 letters country, 2 alnum location, optional 3 alnum branch.
    if (!/^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(bic)) {
      throw new SpaydError('INVALID_BIC', `Invalid BIC "${input.bic}".`)
    }
    acc += `+${bic}`
  }

  const currency = (input.currency ?? 'CZK').trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new SpaydError(
      'INVALID_CURRENCY',
      `Currency must be an ISO 4217 code, got "${currency}".`,
    )
  }

  const pairs: Array<[string, string | null]> = [
    ['ACC', acc],
    ['AM', formatAmount(input.amount)],
    ['CC', currency],
    ['DT', input.dueDate ? formatDueDate(input.dueDate) : null],
    ['RN', input.recipientName ? sanitizeSpaydText(input.recipientName, SPAYD_RN_MAX) : null],
    ['MSG', input.message ? sanitizeSpaydText(input.message, SPAYD_MSG_MAX) : null],
    ['X-VS', formatSymbol('Variable symbol', input.variableSymbol)],
    ['X-SS', formatSymbol('Specific symbol', input.specificSymbol)],
    ['X-KS', formatSymbol('Constant symbol', input.constantSymbol)],
  ]

  return ['SPD', '1.0', ...pairs.filter(([, v]) => v).map(([k, v]) => `${k}:${v}`)].join('*')
}
