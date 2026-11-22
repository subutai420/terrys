/**
 * Voucher codes (stage 7), pure.
 *
 * Format `XXXX-XXXX-XX[B]-XXX` (owner's spec): 13 random characters + ONE batch letter `B` at the
 * fixed 11th position (counting only characters, dashes excluded). The batch letter tells which
 * batch ("šarže") the voucher belongs to; every voucher of a batch shares one expiry date.
 *
 * Alphabet: digits 2–9 and letters without the look-alikes 0/O, 1/I/L (31 characters), so a code
 * read from paper or dictated by phone cannot be mistyped into another valid code. Batch letters
 * are letters of the same alphabet (23 possibilities). 31^13 ≈ 2.5 · 10^19 combinations: guessing
 * a valid code is hopeless even with thousands of vouchers issued. The randomness comes from the
 * Web Crypto API (`crypto.getRandomValues`, available in Node ≥ 19 and browsers) with rejection
 * sampling, so every character is uniformly distributed (no modulo bias). Uniqueness is enforced
 * by the database (unique index on `vouchers.codeNormalized`); the issuer retries on a clash.
 */

export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const BATCH_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ'

/** Number of random characters in a code (the batch letter is extra). */
export const RANDOM_LENGTH = 13
/** Index of the batch letter in the normalised (dash-less) code. */
export const BATCH_LETTER_INDEX = 10

export type RandomSource = (bytes: Uint8Array) => Uint8Array

const webCrypto: RandomSource = (bytes) => globalThis.crypto.getRandomValues(bytes)

/** Uniform random index in [0, n) – rejection sampling over random bytes (n ≤ 256). */
function randomIndex(n: number, random: RandomSource): number {
  const limit = 256 - (256 % n) // values ≥ limit would bias the result
  const buffer = new Uint8Array(1)
  for (;;) {
    random(buffer)
    if (buffer[0] < limit) return buffer[0] % n
  }
}

export function isBatchLetter(value: unknown): value is string {
  return typeof value === 'string' && value.length === 1 && BATCH_LETTERS.includes(value)
}

/** `ABCDEFGHJKLMN` (14 chars incl. batch letter) → `ABCD-EFGH-JK[L]-MNP` display form. */
export function formatVoucherCode(normalized: string): string {
  if (!/^[0-9A-Z]{14}$/.test(normalized)) return normalized
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 11)}-${normalized.slice(11)}`
}

/**
 * Generates a new code for a batch: returns the display form (with dashes). `random` can be
 * replaced in tests.
 */
export function generateVoucherCode(batchLetter: string, random: RandomSource = webCrypto): string {
  if (!isBatchLetter(batchLetter)) {
    throw new Error(`Neplatné písmeno šarže „${batchLetter}“ (povolená: ${BATCH_LETTERS}).`)
  }
  const chars: string[] = []
  for (let i = 0; i < RANDOM_LENGTH; i++) {
    chars.push(CODE_ALPHABET[randomIndex(CODE_ALPHABET.length, random)])
  }
  chars.splice(BATCH_LETTER_INDEX, 0, batchLetter)
  return formatVoucherCode(chars.join(''))
}

/**
 * Normalises whatever staff or a customer typed: case, spaces, dashes, dots and other separators
 * do not matter ("k7mq 3xpa-9tc r4w" = "K7MQ-3XPA-9TC-R4W"). Used for lookup and uniqueness
 * (`vouchers.codeNormalized`), also for legacy codes from the old shop. Ambiguous characters are
 * NOT guessed (an "O" stays an "O"): our codes never contain them, so a typo simply does not match.
 */
export function normalizeVoucherCode(input: string | null | undefined): string {
  return String(input ?? '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
}

/** True when the normalised code has the shape of a code issued by this shop. */
export function isShopVoucherCode(normalized: string): boolean {
  if (normalized.length !== RANDOM_LENGTH + 1) return false
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    if (i === BATCH_LETTER_INDEX ? !BATCH_LETTERS.includes(ch) : !CODE_ALPHABET.includes(ch)) {
      return false
    }
  }
  return true
}

/** Batch letter of a shop code (null for legacy / malformed codes). */
export function batchLetterOf(normalized: string): string | null {
  return isShopVoucherCode(normalized) ? normalized[BATCH_LETTER_INDEX] : null
}

/** Display form: shop codes with dashes, other (old-shop) codes as typed, uppercase, trimmed. */
export function displayVoucherCode(input: string): string {
  const normalized = normalizeVoucherCode(input)
  return isShopVoucherCode(normalized)
    ? formatVoucherCode(normalized)
    : String(input).normalize('NFKC').trim().toUpperCase().replace(/\s+/g, ' ')
}
