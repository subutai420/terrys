import { describeError, logEvent } from '@/lib/monitoring/log'
import { scrubValue } from '@/lib/monitoring/scrub'

/**
 * Stage 9: report an unexpected server error – always a structured log line, plus a Sentry
 * event when `SENTRY_DSN` is set (the SDK was initialised in `src/instrumentation.ts`).
 * Never throws: monitoring must not break the request that is being handled.
 */
export async function reportServerError(
  event: string,
  error: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  logEvent('error', event, { ...context, ...describeError(error) })
  if (!process.env.SENTRY_DSN) return
  try {
    const Sentry = await import('@sentry/nextjs')
    Sentry.captureException(error, {
      tags: { event },
      extra: scrubValue(context) as Record<string, unknown>,
    })
  } catch {
    // ignore: monitoring is best effort
  }
}
