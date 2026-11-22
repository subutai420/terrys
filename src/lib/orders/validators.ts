/**
 * Validators of customer input (pure, used in the browser for inline messages and on the server
 * as the source of truth). Messages are Czech, addressed to the customer.
 */

/** Removes spaces, dashes, dots, slashes and brackets people type into phone numbers. */
function phoneDigits(input: string): string {
  return input.replace(/[\s\-./()]/g, '')
}

/**
 * Czech (or Slovak) phone number → `+420 123 456 789`, or null when it is not a valid number.
 * Accepts `123456789`, `123 456 789`, `+420123456789`, `00420 123 456 789`, `+421 …`.
 * Czech numbers have 9 digits and never start with 0 or 1.
 */
export function normalizePhone(input: string): string | null {
  let value = phoneDigits(input.trim())
  if (value.startsWith('00')) value = `+${value.slice(2)}`
  let prefix = '+420'
  const match = /^\+(420|421)(\d+)$/.exec(value)
  if (match) {
    prefix = `+${match[1]}`
    value = match[2]
  } else if (value.startsWith('+')) {
    return null
  }
  if (!/^[2-9]\d{8}$/.test(value)) return null
  return `${prefix} ${value.slice(0, 3)} ${value.slice(3, 6)} ${value.slice(6)}`
}

/** IČO: 8 digits with the official modulo-11 check digit. Returns the normalised value or null. */
export function normalizeIco(input: string): string | null {
  const value = input.replace(/\s/g, '')
  if (!/^\d{8}$/.test(value)) return null
  const digits = value.split('').map(Number)
  const sum = digits.slice(0, 7).reduce((acc, digit, index) => acc + digit * (8 - index), 0)
  const check = (11 - (sum % 11)) % 10
  return check === digits[7] ? value : null
}

/** DIČ: `CZ` + 8–10 digits (the prefix is added when missing). */
export function normalizeDic(input: string): string | null {
  const value = input.replace(/\s/g, '').toUpperCase()
  const match = /^(CZ)?(\d{8,10})$/.exec(value)
  return match ? `CZ${match[2]}` : null
}

/** Pragmatic e-mail check (the real check is the confirmation e-mail arriving). */
export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.trim()) && input.trim().length <= 254
}
