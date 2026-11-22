import type { MetadataRoute } from 'next'

import { absoluteUrl } from '@/lib/urls'

/**
 * /robots.txt. Blocks the admin, the API (except uploaded images), search results, the cart, the preview route and
 * filtered/sorted category lists (they are noindex anyway; blocking saves crawl budget).
 * Paging (?strana=) stays crawlable. AI crawlers are explicitly welcome under the same rules.
 */
const DISALLOW = [
  '/admin',
  '/api/',
  '/next/',
  '/vyhledavani',
  '/kosik',
  // Stage 4: checkout and thank-you pages (noindex anyway).
  '/objednavka',
  '/*?*druh=',
  '/*?*rez=',
  '/*?*puvod=',
  '/*?*pouziti=',
  '/*?*dostupnost=',
  '/*?*razeni=',
]

const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: ['/', '/api/media/file/'], disallow: DISALLOW },
      { userAgent: AI_CRAWLERS, allow: ['/', '/api/media/file/'], disallow: DISALLOW },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
