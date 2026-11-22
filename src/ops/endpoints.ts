import type { Endpoint } from 'payload'

import { logEvent } from '@/lib/monitoring/log'
import { clientIp, createRateLimiter } from '@/lib/orders/rateLimit'
import { parseCspReport } from '@/lib/security/cspReport'

import { checkHealth } from './health'

/**
 * Stage 9 operations endpoints (public, read-only, no personal data):
 * - `GET /api/health`      – health check for an uptime monitor (src/ops/health.ts),
 * - `POST /api/csp-report` – browsers report Content-Security-Policy violations here
 *   (report-only mode, src/lib/security/headers.ts); logged as one scrubbed line each.
 * Both are rate limited per IP (in memory, per server instance – see rateLimit.ts).
 */

const healthLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 })
const cspLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 })

const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

export const opsEndpoints: Endpoint[] = [
  {
    path: '/health',
    method: 'get',
    handler: async (req) => {
      if (process.env.RATE_LIMIT_DISABLED !== '1' && !healthLimiter.hit(clientIp(req.headers))) {
        return Response.json({ status: 'rate-limited' }, { status: 429, headers })
      }
      const report = await checkHealth(req.payload)
      return Response.json(report, { status: report.status === 'down' ? 503 : 200, headers })
    },
  },
  {
    path: '/csp-report',
    method: 'post',
    handler: async (req) => {
      const noContent = () => new Response(null, { status: 204, headers })
      if (!cspLimiter.hit(clientIp(req.headers))) return noContent()
      const length = Number(req.headers.get('content-length') ?? 0)
      if (length > 20_000) return noContent()
      let body: unknown = null
      try {
        body = req.text ? JSON.parse(await req.text()) : null
      } catch {
        return noContent()
      }
      for (const violation of parseCspReport(body).slice(0, 5)) {
        logEvent('warn', 'csp.violation', violation)
      }
      return noContent()
    },
  },
]
