/**
 * Cookie consent model (stage 6). Pure – shared by the browser (banner, GTM loader, attribution)
 * and the server (Meta CAPI reads the same cookie from the order request). Unit-tested in
 * `consent.test.ts`.
 *
 * Categories:
 * - `necessary`  – always on: cart, checkout state, this consent cookie. No consent needed
 *                  (§ 89 odst. 3 ZEK: strictly necessary for a service the visitor asked for).
 * - `analytics`  – GA4 (`analytics_storage`) and our own first-touch attribution in localStorage.
 * - `marketing`  – Google Ads, Meta pixel + Conversions API, Heureka/Zboží conversion codes
 *                  (`ad_storage`, `ad_user_data`, `ad_personalization`).
 * There is no "preferences" category: the shop stores no preference cookies.
 *
 * Storage: first-party cookie `terrys_consent` (readable by the server), value = URI-encoded JSON
 * `{"v":"<text version>","a":0|1,"m":0|1,"t":"<ISO time>"}`, 180 days. A stored choice with a
 * different text version than the current one (Marketing → "Verze textu souhlasu") counts as no
 * choice: the banner asks again.
 */

export const CONSENT_COOKIE = 'terrys_consent'
export const CONSENT_MAX_AGE_DAYS = 180

export type ConsentCategory = 'analytics' | 'marketing'

export type ConsentState = {
  analytics: boolean
  marketing: boolean
  /** Version of the banner text the visitor answered. */
  version: string
  /** When the choice was made (ISO). */
  timestamp: string
}

export type GoogleConsent = {
  ad_storage: 'granted' | 'denied'
  ad_user_data: 'granted' | 'denied'
  ad_personalization: 'granted' | 'denied'
  analytics_storage: 'granted' | 'denied'
  functionality_storage: 'granted' | 'denied'
  personalization_storage: 'granted' | 'denied'
  security_storage: 'granted' | 'denied'
}

/** Consent Mode v2 defaults: everything denied except security (necessary). */
export const GOOGLE_CONSENT_DEFAULT: GoogleConsent = {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  functionality_storage: 'denied',
  personalization_storage: 'denied',
  security_storage: 'granted',
}

export function toGoogleConsent(state: Pick<ConsentState, 'analytics' | 'marketing'> | null) {
  const g = (on: boolean | undefined) => (on ? 'granted' : 'denied') as 'granted' | 'denied'
  return {
    ...GOOGLE_CONSENT_DEFAULT,
    analytics_storage: g(state?.analytics),
    ad_storage: g(state?.marketing),
    ad_user_data: g(state?.marketing),
    ad_personalization: g(state?.marketing),
  } satisfies GoogleConsent
}

export function serializeConsent(state: ConsentState): string {
  return encodeURIComponent(
    JSON.stringify({
      v: state.version,
      a: state.analytics ? 1 : 0,
      m: state.marketing ? 1 : 0,
      t: state.timestamp,
    }),
  )
}

/** Parses the cookie value; null for anything missing or malformed. */
export function parseConsent(raw: string | null | undefined): ConsentState | null {
  if (!raw) return null
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>
    if (typeof value !== 'object' || value === null) return null
    if (typeof value.v !== 'string' || typeof value.t !== 'string') return null
    if (![0, 1].includes(value.a as number) || ![0, 1].includes(value.m as number)) return null
    return {
      version: value.v.slice(0, 40),
      analytics: value.a === 1,
      marketing: value.m === 1,
      timestamp: value.t.slice(0, 40),
    }
  } catch {
    return null
  }
}

/** The stored choice if it answers the CURRENT text version, else null (ask again). */
export function currentConsent(
  raw: string | null | undefined,
  version: string,
): ConsentState | null {
  const state = parseConsent(raw)
  return state && state.version === version ? state : null
}

/** Value of one cookie from a `Cookie` header (server) or `document.cookie` (browser). */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim()
  }
  return null
}

/**
 * Server side: does the request carry marketing consent? Any stored choice counts here (also an
 * older text version) – the visitor did agree; the banner re-asks on the next page view.
 */
export function hasMarketingConsent(cookieHeader: string | null | undefined): boolean {
  return parseConsent(readCookie(cookieHeader, CONSENT_COOKIE))?.marketing === true
}
