'use client'

import { useEffect } from 'react'

import {
  ATTRIBUTION_STORAGE_KEY,
  attributionFromVisit,
  nextAttribution,
  parseStoredAttribution,
} from '@/lib/orders/attribution'

/**
 * First-touch marketing attribution (stage 4): on page load, remembers where the visitor first
 * came from (UTM parameters, gclid/fbclid, external referrer, landing page) in localStorage of
 * our own domain. No cookie, no third-party script, nothing sent anywhere until the visitor places
 * an order (then it is stored on the order). Rendered once in the storefront layout.
 *
 * Owner/lawyer to confirm (see CLAUDE.md): whether this needs consent under § 89 zákona
 * č. 127/2005 Sb. – if so, stage 6 gates it behind the cookie consent.
 */
export function AttributionCapture() {
  useEffect(() => {
    try {
      const now = new Date()
      const stored = parseStoredAttribution(window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY))
      const visit = attributionFromVisit(window.location.href, document.referrer, now)
      const next = nextAttribution(stored, visit, now)
      if (next) window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Storage blocked: no attribution, the shop works the same.
    }
  }, [])
  return null
}
