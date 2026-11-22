import { scrubValue } from './scrub'

/**
 * Stage 9: structured server logs – one JSON object per line, so Vercel's log search (and any log
 * drain) can filter by `event` or `error`. Personal data is scrubbed (`scrubValue`): log WHAT
 * happened (order number, error code, step), never WHO (no e-mail, name, phone, address, IP).
 *
 *   logEvent('warn', 'order.rejected', { error: 'delivery-unavailable', status: 409 })
 *   → {"ts":"…","level":"warn","event":"order.rejected","error":"delivery-unavailable","status":409}
 */
export type LogLevel = 'info' | 'warn' | 'error'

export function formatLogLine(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
  now: Date = new Date(),
): string {
  const safe = scrubValue(fields) as Record<string, unknown>
  return JSON.stringify({ ts: now.toISOString(), level, event, ...safe })
}

export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const line = formatLogLine(level, event, fields)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}

/** Error → short, scrubbed description for logs (`name: message`, first stack frame). */
export function describeError(error: unknown): { errorType: string; detail: string; at?: string } {
  if (error instanceof Error) {
    const frame = error.stack?.split('\n').find((line) => line.trim().startsWith('at '))
    return {
      errorType: error.name,
      detail: error.message.slice(0, 500),
      at: frame?.trim().slice(0, 200),
    }
  }
  return { errorType: 'NonError', detail: String(error).slice(0, 500) }
}
