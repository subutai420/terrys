import { scrubEvent, type ScrubbableEvent } from './scrub'

/**
 * Stage 9: Sentry options shared by the server (`src/instrumentation.ts`) and the browser
 * (`src/instrumentation-client.ts`). No Sentry import here – the SDK is loaded lazily and ONLY
 * when a DSN is configured, so without Sentry env variables nothing is loaded at all.
 *
 * Privacy: `dataCollection` switches off everything that could identify a customer (user info,
 * cookies, headers, bodies, query strings, database parameters, local variables), and
 * `beforeSend` runs `scrubEvent` as a second safety net (e-mails, phones, tokens in URLs).
 * Docs read 2026-11-22: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/,
 * https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/ (v11:
 * `sendDefaultPii` is deprecated in favour of `dataCollection`).
 */

type Env = Record<string, string | undefined>

export function sentryEnvironment(env: Env): string {
  return (
    env.SENTRY_ENVIRONMENT ||
    env.NEXT_PUBLIC_VERCEL_ENV ||
    env.VERCEL_ENV ||
    env.NODE_ENV ||
    'development'
  )
}

function sampleRate(value: string | undefined): number {
  const rate = Number(value)
  return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 0
}

export function sentryOptions(dsn: string, env: Env) {
  return {
    dsn,
    environment: sentryEnvironment(env),
    release: env.VERCEL_GIT_COMMIT_SHA || env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || undefined,
    // Errors only by default; performance tracing costs quota and is not needed to start.
    tracesSampleRate: sampleRate(
      env.SENTRY_TRACES_SAMPLE_RATE ?? env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    ),
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
      graphQL: { document: false, variables: false },
    },
    beforeSend<T extends ScrubbableEvent>(event: T): T {
      return scrubEvent(event)
    },
  }
}
