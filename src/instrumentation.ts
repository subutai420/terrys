import type { Instrumentation } from 'next'

/**
 * Next.js instrumentation hook (stage 9). Runs once when a server instance starts.
 *
 * Sentry error tracking is loaded ONLY when `SENTRY_DSN` is set; without it this file does
 * nothing and the Sentry SDK is never imported. Only the Node.js runtime is instrumented (the
 * app has no edge routes). Options and the privacy scrubbing: src/lib/monitoring/sentryOptions.ts.
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN
  if (!dsn || process.env.NEXT_RUNTIME !== 'nodejs') return
  const [Sentry, { sentryOptions }] = await Promise.all([
    import('@sentry/nextjs'),
    import('./lib/monitoring/sentryOptions'),
  ])
  Sentry.init(sentryOptions(dsn, process.env) as Parameters<typeof Sentry.init>[0])
}

/** Errors thrown while rendering pages / route handlers (Next.js `onRequestError`). */
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN || process.env.NEXT_RUNTIME !== 'nodejs') return
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(...args)
}
