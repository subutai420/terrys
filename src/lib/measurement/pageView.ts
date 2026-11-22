/**
 * Page URLs as reported to analytics (stage 6). Pure, unit-tested in `measurement.test.ts`.
 *
 * - The thank-you page URL contains a secret token (`/objednavka/dekujeme/<token>`) that opens
 *   the order summary with the customer's name, phone and address → reported as
 *   `/objednavka/dekujeme`.
 * - Query parameters that could carry personal data or noise are dropped (`email`, `token`…);
 *   campaign parameters (utm_*, gclid, fbclid, …) and our filters stay.
 */

const THANK_YOU = /^\/objednavka\/dekujeme\/[^/]+\/?$/
const DROP_PARAMS = new Set(['email', 'e-mail', 'token', 'accessToken', 'phone', 'telefon'])

export function sanitizePageLocation(href: string): string {
  if (!href) return ''
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return ''
  }
  if (THANK_YOU.test(url.pathname)) url.pathname = '/objednavka/dekujeme'
  for (const key of [...url.searchParams.keys()]) {
    if (DROP_PARAMS.has(key)) url.searchParams.delete(key)
  }
  url.hash = ''
  return url.toString()
}
