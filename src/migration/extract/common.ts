import type { CheerioRoot } from '../html'
import { cleanText } from '../html'
import { normalizeUrl, toPathAndQuery } from '../urls'

/** SEO texts of a page; empty when the old site used a generic boilerplate. */
export interface ExtractedSeo {
  title?: string
  description?: string
}

/** <title> without the site suffix (" | Terrys", " - Terrys.cz"). */
export function seoFromPage($: CheerioRoot): ExtractedSeo {
  const rawTitle = cleanText($('head title').first().text())
  const title = rawTitle.replace(/\s*[|–-]\s*Terrys(\.cz| Steak)?\s*$/i, '').trim() || undefined
  const description = cleanText($('meta[name="description"]').attr('content')) || undefined
  return { title, description }
}

/** Legacy URL (path) of a page: its canonical URL when declared, otherwise the URL itself. */
export function legacyPath($: CheerioRoot, pageUrl: string): string {
  const canonical = normalizeUrl($('link[rel="canonical"]').attr('href'), pageUrl)
  const ogUrl = normalizeUrl($('meta[property="og:url"]').attr('content'), pageUrl)
  return toPathAndQuery(canonical ?? ogUrl ?? pageUrl).replace(/\?$/, '')
}

/** Czech date "09.03.2022" or "9. 3. 2022" → ISO date at noon UTC (Payload dayOnly convention). */
export function parseCzechDate(text: string | undefined): string | undefined {
  const m = /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(text ?? '')
  if (!m) return undefined
  const [, d, mo, y] = m
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12))
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

/** Product links ("/produkty/…-detail-123") found inside an element, as legacy paths. */
export function productLinksIn($: CheerioRoot, selector: string, pageUrl: string): string[] {
  const out = new Set<string>()
  $(selector)
    .find('a[href]')
    .each((_, a) => {
      const url = normalizeUrl($(a).attr('href'), pageUrl)
      if (url && /\/produkty\/.+-detail-\d+/i.test(url)) out.add(toPathAndQuery(url))
    })
  return [...out]
}

/** Parses a Czech number ("1,5", "2 475", "247.5"). */
export function parseCzechNumber(text: string | undefined): number | undefined {
  if (!text) return undefined
  const cleaned = text.replace(/[\s ]/g, '').replace(',', '.')
  const m = /-?\d+(?:\.\d+)?/.exec(cleaned)
  return m ? Number(m[0]) : undefined
}

/** Weight in grams from texts such as "250g", "1,5kg", "2,5 Kg", "500 g". */
export function parseWeightGrams(text: string | undefined): number | undefined {
  const m = /(\d+(?:[.,]\d+)?)\s*(kg|g|dkg)\b/i.exec((text ?? '').replace(/ /g, ' '))
  if (!m) return undefined
  const value = Number(m[1].replace(',', '.'))
  const unit = m[2].toLowerCase()
  const grams = unit === 'kg' ? value * 1000 : unit === 'dkg' ? value * 10 : value
  return Math.round(grams)
}

/** "250g" → "250 g", "1,5kg" → "1,5 kg" (Czech typography); other labels unchanged. */
export function formatWeightLabel(label: string): string {
  return cleanText(label).replace(/(\d)\s*(kg|g)\b/gi, (_, d: string, u: string) => `${d} ${u.toLowerCase()}`)
}
