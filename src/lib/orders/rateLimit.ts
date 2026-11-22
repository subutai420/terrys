/**
 * Small in-memory rate limiter (fixed window per key, e.g. per IP address).
 *
 * Good enough for one Node.js server (the planned hosting). With several server instances each
 * keeps its own counters – then move it to Postgres or Redis. Pure apart from the Map it owns;
 * the clock is injectable for tests.
 */
export type RateLimiter = {
  /** True when the request may continue (and counts it). */
  hit(key: string, now?: number): boolean
  reset(): void
}

export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
}: {
  limit: number
  windowMs: number
  maxKeys?: number
}): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>()
  return {
    hit(key, now = Date.now()) {
      const current = windows.get(key)
      if (!current || now - current.start >= windowMs) {
        if (windows.size >= maxKeys) {
          // Forget expired windows; if still full, drop the oldest entry.
          for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k)
          if (windows.size >= maxKeys) windows.delete(windows.keys().next().value as string)
        }
        windows.set(key, { start: now, count: 1 })
        return true
      }
      current.count += 1
      return current.count <= limit
    },
    reset() {
      windows.clear()
    },
  }
}

/** Client IP from proxy headers (first entry of X-Forwarded-For), or 'unknown'. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim().slice(0, 64)
  return (headers.get('x-real-ip') ?? 'unknown').slice(0, 64)
}
