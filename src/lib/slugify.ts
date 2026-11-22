/**
 * Letters that Unicode normalisation (NFD) does not split into "base letter + accent",
 * so they need an explicit replacement. Czech letters (á, č, ď, é, ě, í, ň, ó, ř, š, ť, ú, ů, ý, ž)
 * are all handled by normalisation; this map covers the rest that may appear in product names.
 */
const SPECIAL_LETTERS: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ł: 'l',
  þ: 'th',
}

/**
 * Turns a (Czech) title into a URL-friendly slug.
 *
 * Examples:
 *   "Svíčková"                       -> "svickova"
 *   "Wagyu Rib Eye Japonsko A5+"     -> "wagyu-rib-eye-japonsko-a5"
 *   "Doprava a platba"               -> "doprava-a-platba"
 *
 * Rules: lower case, accents removed, "&" becomes "a" (Czech "and"),
 * every run of other characters becomes a single dash, no leading/trailing dashes.
 */
export function slugify(input: string | null | undefined): string {
  if (!input) return ''

  return (
    input
      .toLowerCase()
      // Split letters and accents ("č" -> "c" + "ˇ"), then drop the accents.
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[ßæœøđłþ]/g, (letter) => SPECIAL_LETTERS[letter] ?? letter)
      .replace(/&/g, ' a ')
      // Apostrophes inside words should not create a dash ("Terry's" -> "terrys").
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  )
}
