import type { PayloadRequest } from 'payload'

import { clientIp, createRateLimiter, type RateLimiter } from '@/lib/orders/rateLimit'

/** Helpers shared by the public checkout endpoints (`src/orders/endpoints.ts`). */

export const NO_STORE = { 'Cache-Control': 'no-store' }

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE })
}

/**
 * Same-origin check (CSRF): a browser always sends `Origin` with a POST; it must be our own site.
 * Requests without `Origin` (server-to-server, tests) pass – they cannot ride a visitor's session,
 * and these endpoints use no session anyway.
 */
export function isAllowedOrigin(headers: Headers): boolean {
  const origin = headers.get('origin')
  if (!origin) return true
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return false
  }
  const allowed = new Set<string>()
  const host = headers.get('x-forwarded-host') ?? headers.get('host')
  if (host) allowed.add(host.split(',')[0].trim())
  const site = process.env.NEXT_PUBLIC_SERVER_URL
  if (site) {
    try {
      allowed.add(new URL(site).host)
    } catch {
      // ignore an invalid env value
    }
  }
  return allowed.has(originHost)
}

/** Reads a JSON body (max ~64 kB), or null. */
export async function readJson(req: PayloadRequest): Promise<unknown> {
  try {
    const length = Number(req.headers.get('content-length') ?? 0)
    if (length > 64_000) return null
    return req.json ? await req.json() : null
  } catch {
    return null
  }
}

/** Per-IP limits (in memory, per server instance – see `rateLimit.ts`). */
export const limiters: Record<'placeOrder' | 'cart' | 'address' | 'withdrawal', RateLimiter> = {
  placeOrder: createRateLimiter({ limit: 10, windowMs: 10 * 60_000 }),
  cart: createRateLimiter({ limit: 60, windowMs: 60_000 }),
  address: createRateLimiter({ limit: 60, windowMs: 60_000 }),
  withdrawal: createRateLimiter({ limit: 5, windowMs: 10 * 60_000 }),
}

export function rateLimited(name: keyof typeof limiters, req: PayloadRequest): boolean {
  if (process.env.RATE_LIMIT_DISABLED === '1') return false
  return !limiters[name].hit(clientIp(req.headers))
}

export const TOO_MANY = () =>
  json(
    {
      ok: false,
      error: 'rate-limited',
      message: 'Příliš mnoho pokusů za krátkou dobu. Zkuste to prosím za pár minut znovu.',
    },
    429,
  )

export const FORBIDDEN_ORIGIN = () =>
  json({ ok: false, error: 'forbidden', message: 'Požadavek nepřišel z našeho webu.' }, 403)
