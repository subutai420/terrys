'use client'

import { useEffect } from 'react'

import { hasConsent, onConsentChange } from '@/lib/consent/browser'
import {
  ATTRIBUTION_STORAGE_KEY,
  attributionFromVisit,
  nextAttribution,
  parseStoredAttribution,
} from '@/lib/orders/attribution'

function capture(): void {
  try {
    const now = new Date()
    const stored = parseStoredAttribution(window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY))
    const visit = attributionFromVisit(window.location.href, document.referrer, now)
    const next = nextAttribution(stored, visit, now)
    if (next) window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage blocked: no attribution, the shop works the same.
  }
}

/**
 * First-touch marketing attribution (stage 4): remembers where the visitor first came from (UTM
 * parameters, gclid/fbclid, external referrer, landing page) in localStorage of our own domain and
 * stores it on the order. No third-party script, nothing sent anywhere before an order.
 *
 * Stage 6 – ONLY WITH ANALYTICS CONSENT. § 89 odst. 3 zákona č. 127/2005 Sb. (ZEK) requires
 * consent for storing or reading any information in the visitor's device (localStorage included –
 * the law is technology-neutral) unless it is strictly necessary for a service the visitor asked
 * for. Knowing which campaign brought the visitor is not necessary for selling meat, so it needs
 * consent. Category "analytics": the purpose is measuring which channels bring orders (statistics
 * for the shop itself, first party, not shared with or used by an ad platform for targeting). When
 * the visitor withdraws analytics consent, the stored record is deleted (`saveConsent`). If the
 * consent is given later on the landing page, the current page still counts as the first touch.
 */
export function AttributionCapture() {
  useEffect(() => {
    if (hasConsent('analytics')) capture()
    return onConsentChange((state) => {
      if (state.analytics) capture()
    })
  }, [])
  return null
}
