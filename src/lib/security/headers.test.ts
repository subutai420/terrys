import { describe, expect, it } from 'vitest'

import {
  buildCsp,
  cspModeFromEnv,
  extraSources,
  securityHeaderRules,
  sentryIngestOrigin,
} from './headers'

const prod = { NEXT_PUBLIC_SERVER_URL: 'https://www.terrys.cz' }

function headerOf(rules: ReturnType<typeof securityHeaderRules>, key: string) {
  for (const rule of rules) {
    const found = rule.headers.find((h) => h.key === key)
    if (found) return { source: rule.source, value: found.value }
  }
  return null
}

describe('security headers', () => {
  it('defaults to report-only and accepts only known modes', () => {
    expect(cspModeFromEnv({})).toBe('report-only')
    expect(cspModeFromEnv({ CSP_MODE: 'nonsense' })).toBe('report-only')
    expect(cspModeFromEnv({ CSP_MODE: ' Enforce ' })).toBe('enforce')
    expect(cspModeFromEnv({ CSP_MODE: 'off' })).toBe('off')
  })

  it('sends a report-only CSP on storefront pages by default, never on admin/api', () => {
    const rules = securityHeaderRules(prod, false)
    const csp = headerOf(rules, 'Content-Security-Policy-Report-Only')
    expect(csp).not.toBeNull()
    expect(headerOf(rules, 'Content-Security-Policy')).toBeNull()
    const pattern = new RegExp(`^${csp!.source.replace('/(', '(')}$`)
    expect(pattern.test('/produkty/detail/rib-eye'.slice(1))).toBe(true)
    expect(pattern.test('admin/collections/orders')).toBe(false)
    expect(pattern.test('api/checkout/place-order')).toBe(false)
  })

  it('enforce mode uses the real header and upgrade-insecure-requests on https', () => {
    const rules = securityHeaderRules({ ...prod, CSP_MODE: 'enforce' }, false)
    const csp = headerOf(rules, 'Content-Security-Policy')
    expect(csp?.value).toContain('upgrade-insecure-requests')
    expect(headerOf(rules, 'Content-Security-Policy-Report-Only')).toBeNull()
  })

  it('no CSP and no HSTS in development or over http', () => {
    const dev = securityHeaderRules(prod, true)
    expect(headerOf(dev, 'Content-Security-Policy-Report-Only')).toBeNull()
    expect(headerOf(dev, 'Strict-Transport-Security')).toBeNull()
    const http = securityHeaderRules({ NEXT_PUBLIC_SERVER_URL: 'http://localhost:3000' }, false)
    expect(headerOf(http, 'Strict-Transport-Security')).toBeNull()
    expect(headerOf(http, 'X-Content-Type-Options')?.value).toBe('nosniff')
  })

  it('HSTS without includeSubDomains on the https production site', () => {
    expect(headerOf(securityHeaderRules(prod, false), 'Strict-Transport-Security')?.value).toBe(
      'max-age=31536000',
    )
  })

  it('CSP allows GTM, Turnstile, the Sentry ingest host and blocks plugins', () => {
    const csp = buildCsp({
      mode: 'report-only',
      env: { NEXT_PUBLIC_SENTRY_DSN: 'https://abc@o12.ingest.de.sentry.io/34' },
    })
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://www.googletagmanager.com")
    expect(csp).toContain('https://challenges.cloudflare.com')
    expect(csp).toMatch(/connect-src[^;]*https:\/\/o12\.ingest\.de\.sentry\.io/)
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'self'")
    expect(csp).toContain('report-uri /api/csp-report')
    expect(csp).not.toContain('upgrade-insecure-requests')
  })

  it('extra sources must be https origins', () => {
    expect(
      extraSources({
        CSP_EXTRA_SOURCES: 'https://a.example, http://b.example javascript:x https://*.c.cz',
      }),
    ).toEqual(['https://a.example', 'https://*.c.cz'])
    expect(sentryIngestOrigin('not a dsn')).toBeNull()
    expect(sentryIngestOrigin(undefined)).toBeNull()
  })
})
