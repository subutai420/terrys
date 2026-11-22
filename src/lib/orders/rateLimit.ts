/**
 * Small in-memory rate limiter (fixed window per key, e.g. per IP address).
 *
 * Honest limits (stage 9): on Vercel each warm function instance keeps its own counters and a
 * cold start begins at zero, so the real limit is "limit × running instances". That still stops
 * a single bot hammering the checkout, but it is not an exact quota. A shared store (Upstash
 * Redis via the Vercel marketplace, or a Postgres table) would make it exact; it was NOT built in
 * stage 9 because the forms have further protection (honeypot, timing token, optional Turnstile,
 * Payload's per-account login lock) and a shared store adds a paid service and a network call
 * to every request. Revisit if the logs show abuse (docs/provoz.md). Behind a proxy that hides
 * the visitor's address (Cloudflare "orange cloud") every visitor would share one key – keep
 * Cloudflare DNS-only, as Vercel recommends. Pure apart from the Map it owns; the clock is
 * injectable for tests.
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

/**
 * Client IP from proxy headers (first entry of X-Forwarded-For), or 'unknown'. On Vercel this is
 * trustworthy: Vercel overwrites X-Forwarded-For and does not forward external values
 * (https://vercel.com/docs/headers/request-headers, read 2026-11-22). On a self-hosted server put
 * a proxy in front that sets the header.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim().slice(0, 64)
  return (headers.get('x-real-ip') ?? 'unknown').slice(0, 64)
}
