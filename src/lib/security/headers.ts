/**
 * Stage 9: HTTP security headers (used by `next.config.ts` → `headers()`).
 *
 * Pure functions, unit-tested in `headers.test.ts`. Next.js evaluates `headers()` when the app is
 * BUILT, so changing any of the env variables below needs a new deploy (on Vercel: "Redeploy").
 *
 * Content Security Policy (CSP) – decisions:
 * - The storefront is mostly ISR/static (cached HTML), so per-request nonces are not possible
 *   (Next.js docs, "Content Security Policy": nonces require dynamic rendering of every page).
 *   We use the documented "without nonces" variant: `'unsafe-inline'` for scripts and styles plus
 *   an allow-list of hosts. It still blocks scripts from unknown hosts, plugins (`object-src`),
 *   `<base>` hijacking and form posts to other sites.
 * - GTM loads third-party tags chosen by the marketer (GA4, Google Ads, Meta, Sklik, Heureka…),
 *   so the host list can never be complete in advance. Default mode is therefore REPORT-ONLY:
 *   the browser blocks nothing and only reports violations to `/api/csp-report` (visible in the
 *   server logs). After a few days without unexpected reports, switch `CSP_MODE=enforce`.
 * - The Payload admin (`/admin`) and the API get no CSP (the admin's code editor uses web workers
 *   and inline styles; it is protected by login). Every route gets the other headers.
 */

export type CspMode = 'off' | 'report-only' | 'enforce'

type Env = Record<string, string | undefined>

/** `CSP_MODE` → mode; anything unknown or empty = report-only (cannot break the shop). */
export function cspModeFromEnv(env: Env): CspMode {
  const value = (env.CSP_MODE ?? '').trim().toLowerCase()
  if (value === 'off' || value === 'enforce') return value
  return 'report-only'
}

/** Host of the Sentry ingest endpoint from a DSN (`https://key@o1.ingest.de.sentry.io/2`). */
export function sentryIngestOrigin(dsn: string | undefined): string | null {
  if (!dsn) return null
  try {
    const url = new URL(dsn)
    return url.protocol === 'https:' ? `https://${url.host}` : null
  } catch {
    return null
  }
}

/** `CSP_EXTRA_SOURCES="https://a.example https://b.example"` → valid https origins only. */
export function extraSources(env: Env): string[] {
  return (env.CSP_EXTRA_SOURCES ?? '')
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter((value) => /^https:\/\/[a-z0-9.*-]+(:\d+)?$/i.test(value))
}

/** Hosts used by the tags GTM typically loads (GA4, Google Ads, Meta pixel, Sklik, Heureka). */
const TAG_SCRIPT_HOSTS = [
  'https://www.googletagmanager.com',
  'https://*.googletagmanager.com',
  'https://www.google-analytics.com',
  'https://*.google-analytics.com',
  'https://www.googleadservices.com',
  'https://googleads.g.doubleclick.net',
  'https://www.google.com',
  'https://connect.facebook.net',
  'https://c.seznam.cz',
  'https://*.seznam.cz',
  'https://im9.cz',
  'https://*.heureka.cz',
]
const TAG_CONNECT_HOSTS = [
  'https://*.google-analytics.com',
  'https://*.analytics.google.com',
  'https://*.googletagmanager.com',
  'https://www.google.com',
  'https://*.doubleclick.net',
  'https://www.facebook.com',
  'https://connect.facebook.net',
  'https://*.seznam.cz',
  'https://*.heureka.cz',
]
const TAG_FRAME_HOSTS = [
  'https://www.googletagmanager.com',
  'https://td.doubleclick.net',
  'https://www.facebook.com',
]
/** Cloudflare Turnstile (checkout and withdrawal forms). */
const TURNSTILE = 'https://challenges.cloudflare.com'

export const CSP_REPORT_PATH = '/api/csp-report'

export function buildCsp({ mode, env }: { mode: Exclude<CspMode, 'off'>; env: Env }): string {
  const extra = extraSources(env)
  const sentry = sentryIngestOrigin(env.NEXT_PUBLIC_SENTRY_DSN)
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", "'unsafe-inline'", ...TAG_SCRIPT_HOSTS, TURNSTILE, ...extra]],
    [
      'style-src',
      [
        "'self'",
        "'unsafe-inline'",
        'https://www.googletagmanager.com',
        'https://fonts.googleapis.com',
      ],
    ],
    // Tracking pixels come from many hosts; images cannot run code, so any https image is fine.
    ['img-src', ["'self'", 'data:', 'blob:', 'https:']],
    ['font-src', ["'self'", 'data:', 'https://fonts.gstatic.com']],
    [
      'connect-src',
      ["'self'", ...TAG_CONNECT_HOSTS, TURNSTILE, ...(sentry ? [sentry] : []), ...extra],
    ],
    ['frame-src', ["'self'", TURNSTILE, ...TAG_FRAME_HOSTS, ...extra]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'self'"]],
    ['report-uri', [CSP_REPORT_PATH]],
  ]
  // Only meaningful (and only honoured) in an enforced policy on an https site.
  if (mode === 'enforce' && (env.NEXT_PUBLIC_SERVER_URL ?? '').startsWith('https://')) {
    directives.push(['upgrade-insecure-requests', []])
  }
  return directives.map(([name, values]) => [name, ...values].join(' ')).join('; ')
}

type HeaderRule = { source: string; headers: { key: string; value: string }[] }

/**
 * All security headers as Next.js `headers()` rules. `isDev` = `next dev` (no CSP and no HSTS:
 * hot reload uses eval and websockets, localhost is plain http).
 */
export function securityHeaderRules(env: Env, isDev: boolean): HeaderRule[] {
  const common = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // Clickjacking: only our own pages may frame our pages (also covers the admin).
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    },
  ]
  const httpsSite = (env.NEXT_PUBLIC_SERVER_URL ?? '').startsWith('https://')
  if (!isDev && httpsSite) {
    // One year, no includeSubDomains/preload yet: other subdomains of terrys.cz (mail, old
    // services) may still use plain http. Raise it after the launch (docs/spusteni.md).
    common.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000' })
  }
  const rules: HeaderRule[] = [{ source: '/:path*', headers: common }]

  const mode = cspModeFromEnv(env)
  if (!isDev && mode !== 'off') {
    rules.push({
      // Storefront pages only – not the admin, the API, Next internals or the feeds.
      source: '/((?!admin|api|_next|feeds).*)',
      headers: [
        {
          key:
            mode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
          value: buildCsp({ mode, env }),
        },
      ],
    })
  }
  return rules
}
