/**
 * Next.js client instrumentation (stage 9): runs in the browser before the app starts.
 *
 * Browser error tracking (Sentry) – three gates, all must pass:
 * 1. `NEXT_PUBLIC_SENTRY_DSN` was set at BUILD time (without it this whole block is removed by
 *    the bundler and no Sentry code is ever downloaded),
 * 2. not the admin (staff errors are visible on the server side anyway),
 * 3. the visitor accepted ANALYTICS cookies (checked after the page loaded and again whenever the
 *    choice changes; the SDK is downloaded only then, as a separate chunk).
 * Privacy options (no user data, no cookies, no query strings, scrubbed e-mails/phones/tokens):
 * src/lib/monitoring/sentryOptions.ts.
 */
import { hasConsent, onConsentChange } from './lib/consent/browser'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn && typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin')) {
  let started = false
  const start = () => {
    if (started || !hasConsent('analytics')) return
    started = true
    void Promise.all([import('@sentry/nextjs'), import('./lib/monitoring/sentryOptions')]).then(
      ([Sentry, { sentryOptions }]) => {
        const options = sentryOptions(dsn, {
          NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
          NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
          NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
          NODE_ENV: process.env.NODE_ENV,
        })
        Sentry.init(options as Parameters<typeof Sentry.init>[0])
      },
    )
  }
  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
  onConsentChange(start)
}
