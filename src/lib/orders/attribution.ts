/**
 * Marketing attribution (first touch), captured in the browser in a first-party way: no
 * third-party script, only the visitor's own localStorage. `AttributionCapture` stores it on the
 * first visit, the checkout sends it with the order, the server keeps it on the order (stage 6:
 * reports, offline conversions). Pure helpers here, unit-tested.
 */

export type Attribution = {
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
  gclid?: string
  fbclid?: string
  referrer?: string
  landingPage?: string
  firstSeenAt?: string
}

export const ATTRIBUTION_STORAGE_KEY = 'terrys-attribution-v1'
/** First touch older than this is replaced by a new visit with campaign data. */
export const ATTRIBUTION_MAX_AGE_DAYS = 90

const PARAMS: [keyof Attribution, string][] = [
  ['utmSource', 'utm_source'],
  ['utmMedium', 'utm_medium'],
  ['utmCampaign', 'utm_campaign'],
  ['utmTerm', 'utm_term'],
  ['utmContent', 'utm_content'],
  ['gclid', 'gclid'],
  ['fbclid', 'fbclid'],
]

const clip = (value: string, max = 300) => value.trim().slice(0, max)

/**
 * Attribution of the current page view. `referrer` is kept only when it is another site (our own
 * pages are not a source). The landing page keeps the path and the campaign parameters only.
 */
export function attributionFromVisit(
  url: string,
  referrer: string,
  now: Date,
): Attribution & { hasCampaign: boolean } {
  const parsed = new URL(url)
  const result: Attribution = {}
  let hasCampaign = false
  const landing = new URL(parsed.pathname, parsed.origin)
  for (const [key, param] of PARAMS) {
    const value = parsed.searchParams.get(param)
    if (value) {
      result[key] = clip(value)
      landing.searchParams.set(param, clip(value))
      hasCampaign = true
    }
  }
  if (referrer) {
    try {
      const ref = new URL(referrer)
      if (ref.host !== parsed.host) {
        // Keep origin + path only: query strings of other sites may contain personal data.
        result.referrer = clip(`${ref.origin}${ref.pathname}`)
        hasCampaign = true
      }
    } catch {
      // Invalid referrer: ignore.
    }
  }
  result.landingPage = clip(`${landing.pathname}${landing.search}`, 500)
  result.firstSeenAt = now.toISOString()
  return { ...result, hasCampaign }
}

/**
 * Decides what to store: keep the first touch; replace it only when it is older than
 * `ATTRIBUTION_MAX_AGE_DAYS` and the new visit carries campaign data (or nothing is stored).
 */
export function nextAttribution(
  stored: Attribution | null,
  visit: Attribution & { hasCampaign: boolean },
  now: Date,
): Attribution | null {
  const { hasCampaign, ...data } = visit
  if (!stored) return data
  const firstSeen = Date.parse(stored.firstSeenAt ?? '')
  const expired =
    !Number.isFinite(firstSeen) ||
    now.getTime() - firstSeen > ATTRIBUTION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  return expired && hasCampaign ? data : null
}

/** Parses the stored JSON defensively. */
export function parseStoredAttribution(raw: string | null): Attribution | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const result: Attribution = {}
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'string') result[key as keyof Attribution] = clip(item, 500)
    }
    return result
  } catch {
    return null
  }
}
