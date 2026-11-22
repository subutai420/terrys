import * as cheerio from 'cheerio'

import { normalizeUrl } from './urls'

export type CheerioRoot = cheerio.CheerioAPI

/** Parses an HTML document. */
export function loadHtml(html: string): CheerioRoot {
  return cheerio.load(html)
}

/** Collapses whitespace (incl. non-breaking spaces) and trims. */
export function cleanText(text: string | undefined | null): string {
  return (text ?? '').replace(/[\s ]+/g, ' ').trim()
}

export interface PageMeta {
  title: string
  canonical?: string
  metaDescription?: string
  ogTitle?: string
  ogDescription?: string
  ogImage?: string
  robots?: string
  h1?: string
  /** JSON passed by EasyWeb to `EwCore.extendPageContextData({...})` – tells the page kind. */
  context?: Record<string, unknown>
}

/** Title, canonical, SEO texts and the EasyWeb page context of any old-site page. */
export function extractPageMeta($: CheerioRoot, pageUrl: string): PageMeta {
  const meta = (selector: string) => cleanText($(selector).attr('content')) || undefined
  const canonicalHref = $('link[rel="canonical"]').attr('href')
  return {
    title: cleanText($('head title').first().text()),
    canonical: canonicalHref ? (normalizeUrl(canonicalHref, pageUrl) ?? canonicalHref) : undefined,
    metaDescription: meta('meta[name="description"]'),
    ogTitle: meta('meta[property="og:title"]'),
    ogDescription: meta('meta[property="og:description"]'),
    ogImage: $('meta[property="og:image"]').attr('content')?.replace(/&amp;/g, '&'),
    robots: meta('meta[name="robots"]'),
    h1: cleanText($('h1').first().text()) || undefined,
    context: extractPageContext($.html()),
  }
}

/** Parses `EwCore.extendPageContextData({...});` from inline scripts. */
export function extractPageContext(html: string): Record<string, unknown> | undefined {
  const marker = 'EwCore.extendPageContextData('
  const start = html.indexOf(marker)
  if (start < 0) return undefined
  // The argument is a JSON object literal; find its matching closing brace.
  let depth = 0
  let inString = false
  let escaped = false
  const from = start + marker.length
  for (let i = from; i < html.length; i++) {
    const ch = html[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(from, i + 1)) as Record<string, unknown>
        } catch {
          return undefined
        }
      }
    }
  }
  return undefined
}

/** All links (`<a href>`) of the page that point to the old site, normalised and de-duplicated. */
export function extractInternalLinks($: CheerioRoot, pageUrl: string): string[] {
  const out = new Set<string>()
  $('a[href]').each((_, el) => {
    const url = normalizeUrl($(el).attr('href'), pageUrl)
    if (url) out.add(url)
  })
  return [...out]
}

/** Absolute URL for an image `src`/`href` on the old site (handles `&amp;amp;` double escaping). */
export function absoluteImageUrl(src: string | undefined, pageUrl: string): string | null {
  if (!src) return null
  const decoded = src.replace(/&amp;/g, '&').replace(/&amp;/g, '&').trim()
  if (!decoded || decoded.startsWith('data:')) return null
  try {
    const url = new URL(decoded, pageUrl)
    if (url.hostname === 'terrys.cz') url.hostname = 'www.terrys.cz'
    return url.toString()
  } catch {
    return null
  }
}
