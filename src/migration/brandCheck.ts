/**
 * Brand-rule check of migrated texts (business rules 1, 2 and 8 in CLAUDE.md).
 * Nothing is changed automatically: the hits are listed in migration/report.md so the owner can
 * review and edit the texts in the admin.
 */

export interface BrandHit {
  rule: 'sleva' | 'doprava-zdarma' | 'preskrtnuta-cena' | 'stary-nazev' | 'foto-kredit'
  snippet: string
}

const PATTERNS: { rule: BrandHit['rule']; re: RegExp }[] = [
  // slevy, sleva, slevový kód, slevové kupóny, akční cena, výprodej, -20 %
  { rule: 'sleva', re: /\b(slev\w*|akčn\w*\s+cen\w*|výprodej\w*|kup[oó]n\w*|promo\s*k[oó]d\w*|dárkov\w*\s+k[oó]d\w*)|-\s?\d{1,2}\s?%/gi },
  { rule: 'doprava-zdarma', re: /(doprav\w*|dopravn\w*|poštovn\w*|doruč\w*)\s+(je\s+|bude\s+)?zdarma|zdarma\s+(doprav\w*|doruč\w*)/gi },
  // Old brand name of the shop (SelaVita → Terrys).
  { rule: 'stary-nazev', re: /sela\s?vita/gi },
  {
    rule: 'foto-kredit',
    re: /(shutterstock|istock|depositphotos|freepik|unsplash|pixabay|adobe\s?stock|fotolia|123rf|dreamstime|pexels|getty\s?images)/gi,
  },
]

/** Short context around a match. */
function snippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 50)
  const end = Math.min(text.length, index + length + 50)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`
}

export function checkBrandRules(text: string, struckText: string[] = []): BrandHit[] {
  const hits: BrandHit[] = []
  for (const { rule, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      hits.push({ rule, snippet: snippetAround(text, m.index ?? 0, m[0].length) })
    }
  }
  for (const s of struckText) {
    // Struck-through text with a price is a crossed-out (sale) price.
    if (/\d/.test(s) && /(kč|,-|\d{2,})/i.test(s)) hits.push({ rule: 'preskrtnuta-cena', snippet: s })
  }
  return hits
}

export const BRAND_RULE_LABELS: Record<BrandHit['rule'], string> = {
  sleva: 'slevy / slevové kódy / akce',
  'doprava-zdarma': '„doprava zdarma“',
  'preskrtnuta-cena': 'přeškrtnutá cena',
  'stary-nazev': 'starý název SelaVita',
  'foto-kredit': 'kredit fotobanky',
}
