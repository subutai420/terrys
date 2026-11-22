/**
 * Consent state API for browser code (stage 6). Everything that stores or sends something
 * non-essential asks here first:
 *
 *   getConsent()                 → ConsentState | null (null = not decided for the current text)
 *   hasConsent('analytics' | 'marketing')
 *   saveConsent({ analytics, marketing })   (banner / preferences dialog)
 *   onConsentChange(listener)    → unsubscribe
 *   openConsentSettings()        (footer link "Nastavení soukromí")
 *
 * The choice lives in the first-party cookie `terrys_consent` (see `src/lib/measurement/consent.ts`),
 * so the server sees it too (Meta CAPI is sent only with marketing consent). Saving pushes Google
 * Consent Mode v2 `update` (when GTM runs) and a `consent_update` dataLayer event, and on a
 * withdrawal deletes what the categories had stored (attribution, GA/Ads/Meta cookies).
 */

import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_DAYS,
  type ConsentCategory,
  type ConsentState,
  currentConsent,
  readCookie,
  serializeConsent,
  toGoogleConsent,
} from '@/lib/measurement/consent'
import { ATTRIBUTION_STORAGE_KEY } from '@/lib/orders/attribution'

export const OPEN_CONSENT_EVENT = 'terrys:open-consent'
const CHANGE_EVENT = 'terrys:consent-change'

let version = '1'

/** Called once by the banner with the current text version from the admin (Marketing). */
export function setConsentVersion(value: string): void {
  version = value
}

export function getConsentVersion(): string {
  return version
}

export function getConsent(): ConsentState | null {
  if (typeof document === 'undefined') return null
  try {
    return currentConsent(readCookie(document.cookie, CONSENT_COOKIE), version)
  } catch {
    return null
  }
}

export function hasConsent(category: ConsentCategory): boolean {
  return getConsent()?.[category] === true
}

type Gtag = (...args: unknown[]) => void

/** Removes first-party cookies of a tool (all domain variants we could have set them on). */
function deleteCookies(prefixes: string[]): void {
  const host = window.location.hostname
  const parts = host.split('.')
  const domains = ['', host, ...parts.map((_, i) => `.${parts.slice(i).join('.')}`)]
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0]?.trim()
    if (!name || !prefixes.some((prefix) => name.startsWith(prefix))) continue
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`
    }
  }
}

export function saveConsent(choice: { analytics: boolean; marketing: boolean }): ConsentState {
  const previous = getConsent()
  const state: ConsentState = {
    analytics: choice.analytics,
    marketing: choice.marketing,
    version,
    timestamp: new Date().toISOString(),
  }
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(state)}; Max-Age=${CONSENT_MAX_AGE_DAYS * 86400}; path=/; SameSite=Lax${secure}`

  const w = window as unknown as { gtag?: Gtag; dataLayer?: unknown[] }
  const google = toGoogleConsent(state)
  if (typeof w.gtag === 'function') {
    w.gtag('consent', 'update', {
      analytics_storage: google.analytics_storage,
      ad_storage: google.ad_storage,
      ad_user_data: google.ad_user_data,
      ad_personalization: google.ad_personalization,
    })
  }
  ;(w.dataLayer ??= []).push({
    event: 'consent_update',
    consent_analytics: google.analytics_storage,
    consent_marketing: google.ad_storage,
  })

  try {
    if (!state.analytics) {
      window.localStorage.removeItem(ATTRIBUTION_STORAGE_KEY)
      if (previous?.analytics) deleteCookies(['_ga'])
    }
    if (!state.marketing && previous?.marketing) deleteCookies(['_gcl', '_fbp', '_fbc', '_gac'])
  } catch {
    // storage blocked – nothing stored either
  }

  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: state }))
  return state
}

export function onConsentChange(listener: (state: ConsentState) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<ConsentState>).detail)
  window.addEventListener(CHANGE_EVENT, handler)
  return () => window.removeEventListener(CHANGE_EVENT, handler)
}

export function openConsentSettings(): void {
  window.dispatchEvent(new CustomEvent(OPEN_CONSENT_EVENT))
}
