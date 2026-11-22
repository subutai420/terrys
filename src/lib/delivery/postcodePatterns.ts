/**
 * Postcode patterns of a delivery zone, written by the admin in one text field, e.g.
 * "1*, 250 01, 252*":
 * - a full postcode ("250 01" or "25001") matches exactly that postcode,
 * - 1–4 digits followed by "*" match every postcode starting with them ("1*" = all of Prague,
 *   whose postcodes are 100 00–199 99; "252*" = 252 00–252 99).
 * Patterns are separated by commas, semicolons or new lines; spaces are ignored.
 *
 * Czech postcodes are hierarchical (first digit = region, the next ones narrow it down), so a few
 * prefixes describe a whole area and nobody has to list thousands of postcodes by hand.
 */

export type PostcodePattern = { prefix: string; exact: boolean }

export type ParsedPatterns = { patterns: PostcodePattern[]; invalid: string[] }

export function parsePostcodePatterns(text: string): ParsedPatterns {
  const patterns: PostcodePattern[] = []
  const invalid: string[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/[,;\n\r]+/)) {
    const token = raw.replace(/[\s ]/g, '')
    if (!token) continue
    let pattern: PostcodePattern | null = null
    if (/^[1-7]\d{4}$/.test(token)) pattern = { prefix: token, exact: true }
    else if (/^[1-7]\d{0,3}\*$/.test(token)) pattern = { prefix: token.slice(0, -1), exact: false }
    if (!pattern) {
      invalid.push(raw.trim())
      continue
    }
    const key = formatPattern(pattern)
    if (!seen.has(key)) {
      seen.add(key)
      patterns.push(pattern)
    }
  }
  return { patterns, invalid }
}

/** Canonical text form: "25001" or "252*". */
export function formatPattern(pattern: PostcodePattern): string {
  return pattern.exact ? pattern.prefix : `${pattern.prefix}*`
}

/** Normalised text of a pattern list (used to tidy up the admin field on save). */
export function normalizePatternText(text: string): string {
  return parsePostcodePatterns(text).patterns.map(formatPattern).join(', ')
}

/**
 * How specifically a pattern matches the postcode: 0 = no match, otherwise the prefix length
 * (an exact postcode scores 6, more than any prefix). A more specific zone wins over a broader
 * one, e.g. "250 01" beats "25*", which beats "2*".
 */
export function matchSpecificity(patterns: PostcodePattern[], code: string): number {
  let best = 0
  for (const pattern of patterns) {
    if (pattern.exact ? code === pattern.prefix : code.startsWith(pattern.prefix)) {
      best = Math.max(best, pattern.exact ? 6 : pattern.prefix.length)
    }
  }
  return best
}
