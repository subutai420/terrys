import { type NextRequest, NextResponse } from 'next/server'

import { LEGACY_CATEGORY_HEADER, legacyCategorySegment } from '@/lib/urls'

/**
 * Next.js proxy (formerly "middleware"), stage 3.
 *
 * Old category URLs (`/produkty/argentinske-hovezi-23`) and old product URLs
 * (`/produkty/argentinsky-hovezi-rib-eye-detail-406`) share one URL level. Product pages are
 * statically generated (catch-all route), category pages read filter parameters (?puvod=…) and
 * render per request. This proxy internally rewrites category-shaped paths to the category route
 * `/produkty/kategorie/<segment>` and passes the original path in a request header; the visitor
 * keeps seeing the old URL. The header is always removed from incoming requests first, so nobody
 * can set it from outside.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.delete(LEGACY_CATEGORY_HEADER)

  const segment = legacyCategorySegment(request.nextUrl.pathname)
  if (segment) {
    headers.set(LEGACY_CATEGORY_HEADER, `/produkty/${segment}`)
    const url = request.nextUrl.clone()
    url.pathname = `/produkty/kategorie/${segment}`
    return NextResponse.rewrite(url, { request: { headers } })
  }
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/produkty/:path*'],
}
