import { type NextFetchEvent, type NextRequest, NextResponse } from 'next/server'

import {
  decideRedirect,
  isOldSpace,
  normalizePathShape,
  REDIRECT_STATUS,
} from '@/lib/redirects/legacy'
import { getProxyLegacyIndex } from '@/lib/redirects/proxyIndex'
import { LEGACY_CATEGORY_HEADER, legacyCategorySegment } from '@/lib/urls'

/**
 * Next.js proxy (formerly "middleware").
 *
 * 1. Stage 8b – redirects of old terrys.cz addresses (`src/lib/redirects/legacy.ts`): aliases
 *    with old parameters (`?list=hide`, `?catId=`, `?Id=807`, `/produkty?Page=3`), category page
 *    suffixes (`/produkty/wagyu-98/2`), upper case, trailing slashes, old slugs of the same ID,
 *    hidden products, rubrics, old cart, and redirects entered in the admin. One 308 hop to the
 *    final page; tracking parameters (utm_*, gclid, fbclid …) are kept. Pages that exist are never
 *    redirected. The table comes from `GET /api/legacy-redirects/index` (cached in memory, see
 *    `proxyIndex.ts`); without it requests pass through and the storefront's not-found fallback
 *    redirects instead. Only GET/HEAD (never form posts / server actions), never in draft mode
 *    (editor preview of unpublished pages).
 *
 * 2. Stage 3 – old category URLs (`/produkty/argentinske-hovezi-23`) and old product URLs
 *    (`/produkty/argentinsky-hovezi-rib-eye-detail-406`) share one URL level. Product pages are
 *    statically generated (catch-all route), category pages read filter parameters (?puvod=…)
 *    and render per request. Category-shaped paths are rewritten internally to the category route
 *    `/produkty/kategorie/<segment>` with the original path in a request header; the visitor keeps
 *    seeing the old URL. The header is always removed from incoming requests first, so nobody can
 *    set it from outside.
 *
 * `next.config.ts` sets `skipTrailingSlashRedirect`, so the trailing slash is handled here too
 * (in one hop with the rest instead of Next's own redirect followed by ours).
 */
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const headers = new Headers(request.headers)
  headers.delete(LEGACY_CATEGORY_HEADER)
  // From the raw URL: NextURL may hide a trailing slash (skipTrailingSlashRedirect).
  const { pathname, search } = new URL(request.url)

  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    !request.cookies.has('__prerender_bypass')
  ) {
    const oldSpace = isOldSpace(normalizePathShape(pathname).toLowerCase())
    const index = oldSpace
      ? await getProxyLegacyIndex(
          process.env.INTERNAL_SERVER_URL || request.nextUrl.origin,
          (promise) => event.waitUntil(promise),
        )
      : null
    const decision = decideRedirect(pathname, search, index)
    if (decision) {
      // A plain URL (not nextUrl.clone(): NextURL would put the trailing slash back).
      return NextResponse.redirect(new URL(decision.location, request.url), REDIRECT_STATUS)
    }
  }

  const segment = legacyCategorySegment(pathname)
  if (segment) {
    headers.set(LEGACY_CATEGORY_HEADER, `/produkty/${segment}`)
    const url = request.nextUrl.clone()
    url.pathname = `/produkty/kategorie/${segment}`
    return NextResponse.rewrite(url, { request: { headers } })
  }
  return NextResponse.next({ request: { headers } })
}

export const config = {
  // Every page request except Next internals, the admin, the API (incl. media files) and static
  // files from /public. Must be a constant (Next reads it at build time).
  matcher: [
    '/((?!_next/|__next|api/|api$|admin/|admin$|img/|favicon\\.ico|icon\\.svg|apple-icon\\.png).*)',
  ],
}
