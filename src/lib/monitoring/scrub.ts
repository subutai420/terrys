/**
 * Stage 9: removing personal data and secrets from anything that leaves the server for
 * monitoring (Sentry events, structured logs). Pure, unit-tested in `monitoring.test.ts`.
 *
 * What is removed: e-mail addresses, phone numbers (Czech and international formats), the
 * thank-you page / voucher PDF access tokens in URLs, JWTs and bearer tokens, query strings of
 * URLs (they may carry tokens or search terms), and whole fields whose NAME suggests personal data
 * (name, email, phone, street, address, token, password, cookie, …).
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
// +420 777 123 456, 777123456, 00420777123456 … (9–14 digits, optionally separated by single
// spaces). Dates (2026-11-24) and order numbers (6 digits) do not match.
const PHONE = /(?<![\w/.:-])(?:\+|00)?\d(?: ?\d){8,13}(?![\w/:-])/g
const ACCESS_TOKEN_PATH = /(\/(?:objednavka\/dekujeme|api\/gift-vouchers\/pdf)\/)[A-Za-z0-9_-]{8,}/g
const JWT = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g
const BEARER = /\b(Bearer|JWT)\s+[A-Za-z0-9._~+/=-]{8,}/gi
const URL_QUERY = /(https?:\/\/[^\s?#"']+|\/[\w\-./]*)\?[^\s#"']*/g

/**
 * Field names that hold personal data or secrets. Compared lower-case without `_`, `-` and
 * spaces: EXACT names, plus names ENDING with one of the suffixes (`customerEmail`,
 * `contactPhone`, `accessToken`). Deliberately not a substring match, so technical keys such as
 * `errorType` or `orderNumber` survive.
 */
const SENSITIVE_EXACT = new Set([
  'name',
  'firstname',
  'lastname',
  'customername',
  'recipientname',
  'city',
  'postcode',
  'zip',
  'ico',
  'dic',
  'note',
  'customernote',
  'message',
  'items',
  'ip',
  'ipaddress',
  'clientip',
  'useragent',
  'fbp',
  'fbc',
  'gclid',
  'fbclid',
  'referrer',
  'authorization',
])
const SENSITIVE_SUFFIXES = [
  'email',
  'phone',
  'telefon',
  'street',
  'address',
  'token',
  'password',
  'secret',
  'cookie',
  'cookies',
  'apikey',
]

export function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[\s_-]/g, '')
  return SENSITIVE_EXACT.has(k) || SENSITIVE_SUFFIXES.some((suffix) => k.endsWith(suffix))
}

export function scrubText(value: string): string {
  return value
    .replace(ACCESS_TOKEN_PATH, '$1[token]')
    .replace(JWT, '[jwt]')
    .replace(BEARER, '$1 [token]')
    .replace(URL_QUERY, '$1?[query]')
    .replace(EMAIL, '[email]')
    .replace(PHONE, '[phone]')
}

/** Deep copy with sensitive keys replaced and every string scrubbed. Depth-limited. */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[deep]'
  if (typeof value === 'string') return scrubText(value)
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => scrubValue(item, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] =
        isSensitiveKey(key) && item !== null && item !== undefined && item !== ''
          ? '[filtered]'
          : scrubValue(item, depth + 1)
    }
    return out
  }
  return value
}

/** Deep copy with every string scrubbed (keys kept). */
export function scrubStrings(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[deep]'
  if (typeof value === 'string') return scrubText(value)
  if (Array.isArray(value)) return value.map((item) => scrubStrings(item, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        scrubStrings(v, depth + 1),
      ]),
    )
  }
  return value
}

/**
 * Minimal shape of a Sentry event we touch (kept structural so this file has no Sentry import
 * and can be unit-tested without the SDK).
 */
export type ScrubbableEvent = {
  user?: unknown
  request?: {
    url?: string
    query_string?: unknown
    cookies?: unknown
    headers?: Record<string, string>
    data?: unknown
    env?: unknown
  }
  message?: string
  exception?: { values?: { value?: string }[] }
  breadcrumbs?: { message?: string; data?: unknown }[]
  extra?: Record<string, unknown>
  contexts?: Record<string, unknown>
  tags?: Record<string, unknown>
  server_name?: string
}

/** `beforeSend` for Sentry: never send who the customer is, only what broke. */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  delete event.user
  if (event.request) {
    const headers = event.request.headers ?? {}
    // Keep only harmless technical headers.
    const kept: Record<string, string> = {}
    for (const name of ['content-type', 'accept', 'sec-fetch-site', 'sec-fetch-mode']) {
      const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name)
      if (found) kept[name] = found[1]
    }
    event.request = {
      url: event.request.url ? scrubText(event.request.url) : undefined,
      headers: kept,
    }
  }
  if (event.message) event.message = scrubText(event.message)
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value)
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      message: crumb.message ? scrubText(crumb.message) : crumb.message,
      data: crumb.data ? scrubValue(crumb.data) : crumb.data,
    }))
  }
  if (event.extra) event.extra = scrubValue(event.extra) as Record<string, unknown>
  // Contexts (runtime, os, trace) and tags use technical keys like "name": scrub text only.
  if (event.contexts) event.contexts = scrubStrings(event.contexts) as Record<string, unknown>
  if (event.tags) event.tags = scrubStrings(event.tags) as Record<string, unknown>
  delete event.server_name
  return event
}
