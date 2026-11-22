'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { pushDataLayer } from '@/lib/analytics'
import { sanitizePageLocation } from '@/lib/measurement/pageView'

/**
 * `virtual_page_view` on the first load AND on every App Router client navigation (stage 6).
 * Next.js changes pages without reloading, so GTM's "All Pages" trigger fires only once; the GTM
 * container uses this event instead (GA4 Google tag with `send_page_view: false` + a GA4 event tag
 * `page_view`, Meta pixel PageView). `page_location` is sanitised (the thank-you page token never
 * leaves the browser). Rendered in a <Suspense> boundary (useSearchParams).
 */
export function PageViewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const last = useRef<string | null>(null)
  const query = searchParams.toString()

  useEffect(() => {
    const location = sanitizePageLocation(window.location.href)
    if (location === last.current) return
    const referrer = last.current ?? sanitizePageLocation(document.referrer || '')
    last.current = location
    // Wait a frame so document.title belongs to the new page.
    const frame = requestAnimationFrame(() => {
      pushDataLayer({
        event: 'virtual_page_view',
        page_location: location,
        page_path: new URL(location).pathname,
        page_title: document.title,
        page_referrer: referrer || undefined,
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [pathname, query])

  return null
}
