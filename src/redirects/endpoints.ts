import type { Endpoint } from 'payload'

import { getLegacyIndexData } from './legacyIndex'

/**
 * `GET /api/legacy-redirects/index` – the redirect table for `src/proxy.ts` (stage 8b).
 *
 * The proxy cannot use Payload or the database (it runs before routing, possibly in another
 * process), so it loads this table over HTTP from the app itself and keeps it in memory for a
 * minute. Public on purpose: it lists only public page addresses, old addresses of hidden products
 * (they were public on the old site) and the redirects – the same as the sitemap plus the 308s
 * anyone can observe. No personal data, no drafts' content.
 */
export const legacyRedirectIndexEndpoint: Endpoint = {
  path: '/legacy-redirects/index',
  method: 'get',
  handler: async () => {
    const data = await getLegacyIndexData()
    return Response.json(data, {
      headers: {
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
      },
    })
  },
}
