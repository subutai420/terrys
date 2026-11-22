/**
 * Text helpers for the storefront: plain text from Payload rich text (Lexical JSON) for meta
 * descriptions and structured data, shortening, and diacritics-insensitive search terms.
 * Pure module, unit-tested in `text.test.ts`.
 */

type LexicalNode = {
  type?: string
  text?: string
  children?: LexicalNode[]
  [key: string]: unknown
}

type LexicalDoc = { root?: LexicalNode } | null | undefined

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'listitem', 'quote', 'list'])

/** Plain text of a Lexical document: blocks separated by newlines, line breaks kept. */
export function lexicalToPlainText(doc: unknown): string {
  const root = (doc as LexicalDoc)?.root
  if (!root) return ''
  const out: string[] = []
  const walk = (node: LexicalNode) => {
    if (node.type === 'text' && typeof node.text === 'string') out.push(node.text)
    else if (node.type === 'linebreak') out.push('\n')
    node.children?.forEach(walk)
    if (node.type && BLOCK_TYPES.has(node.type)) out.push('\n')
  }
  walk(root)
  return out
    .join('')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** True when a rich text document contains any text or image. */
export function hasRichText(doc: unknown): boolean {
  const root = (doc as LexicalDoc)?.root
  if (!root) return false
  const visit = (node: LexicalNode): boolean =>
    (node.type === 'text' && Boolean(node.text?.trim())) ||
    node.type === 'upload' ||
    (node.children ?? []).some(visit)
  return visit(root)
}

/** Shortens text to at most `max` characters at a word boundary, adding "…". */
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, '')}…`
}

/** Meta description from the first non-empty candidate, shortened to ~160 characters. */
export function metaDescription(...candidates: (string | null | undefined)[]): string | undefined {
  for (const candidate of candidates) {
    const text = candidate?.replace(/\s+/g, ' ').trim()
    if (text) return truncate(text, 160)
  }
  return undefined
}

/**
 * Characters with diacritics and their plain versions. Used both here (search input) and in the
 * SQL `translate()` call of the product search (`src/storefront/search.ts`), so "svickova" finds
 * "Svíčková" without the Postgres `unaccent` extension.
 */
export const DIACRITICS_FROM = 'áäčďéěëíľĺňóôöŕřšťúůüýžÁÄČĎÉĚËÍĽĹŇÓÔÖŔŘŠŤÚŮÜÝŽ'
export const DIACRITICS_TO = 'aacdeeeillnooorrstuuuyzAACDEEEILLNOOORRSTUUUYZ'

/** Lower case without diacritics: "Svíčková" → "svickova". */
export function foldDiacritics(text: string): string {
  let out = ''
  for (const char of text) {
    const index = DIACRITICS_FROM.indexOf(char)
    out += index === -1 ? char : DIACRITICS_TO[index]
  }
  return out.toLowerCase()
}

/**
 * Search words from user input: folded, at most 6 words of at least 2 characters, without LIKE
 * wildcards. "Svíčková  wagyu%" → ["svickova", "wagyu"].
 */
export function searchTerms(query: string | null | undefined): string[] {
  if (!query) return []
  return [
    ...new Set(
      foldDiacritics(query.slice(0, 100))
        .replace(/[%_\\]/g, ' ')
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length >= 2),
    ),
  ].slice(0, 6)
}
