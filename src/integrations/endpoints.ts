import type { Endpoint } from 'payload'

import { isAdminUser } from '@/access'
import { FEED_CHANNELS, feedPath } from '@/lib/feeds/channels'
import { gtmConfigFromEnv, parseHostList } from '@/lib/measurement/gtm'
import { absoluteUrl, getSiteUrl } from '@/lib/urls'

import { cronSecret, ecomailConfig, heurekaConfig, metaCapiConfig } from './config'
import { processDueJobs } from './jobs'

const noStore = { 'Cache-Control': 'no-store' }

/**
 * Stage 6 endpoints:
 * - `GET /api/integrations/retry` – cron: sends due/failed rows of `integration-jobs`. Needs
 *   `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends exactly that when CRON_SECRET is set);
 *   without CRON_SECRET configured it refuses (503), so it can never be triggered anonymously.
 * - `GET /api/marketing/status` – admin only: env-derived facts for the "Marketing" admin page.
 */
export const integrationEndpoints: Endpoint[] = [
  {
    path: '/integrations/retry',
    method: 'get',
    handler: async (req) => {
      const secret = cronSecret()
      if (!secret)
        return Response.json(
          { ok: false, error: 'CRON_SECRET not set' },
          { status: 503, headers: noStore },
        )
      if (req.headers.get('authorization') !== `Bearer ${secret}`) {
        return Response.json(
          { ok: false, error: 'unauthorized' },
          { status: 401, headers: noStore },
        )
      }
      const result = await processDueJobs(req.payload)
      return Response.json(
        { ok: true, found: result.found, outcomes: result.outcomes.filter(Boolean) },
        { headers: noStore },
      )
    },
  },
  {
    path: '/marketing/status',
    method: 'get',
    handler: async (req) => {
      if (!isAdminUser(req.user)) {
        return Response.json({ ok: false }, { status: req.user ? 403 : 401, headers: noStore })
      }
      const marketing = await req.payload.findGlobal({
        slug: 'marketing',
        depth: 0,
        overrideAccess: true,
      })
      const gtm = gtmConfigFromEnv(process.env, marketing.consentVersion ?? '')
      const meta = metaCapiConfig()
      const stats = (marketing.feedStats ?? {}) as Record<
        string,
        { generatedAt?: string; items?: number; products?: number; excluded?: number; ms?: number }
      >
      return Response.json(
        {
          ok: true,
          siteUrl: getSiteUrl(),
          gtm: {
            enabled: Boolean(gtm),
            id: process.env.GTM_ID ?? null,
            allowedHosts: parseHostList(process.env.GTM_ALLOWED_HOSTS),
          },
          integrations: {
            metaCapi: Boolean(meta),
            metaTestMode: Boolean(meta?.testEventCode),
            heureka: Boolean(heurekaConfig()),
            ecomail: Boolean(ecomailConfig()),
            retryCron: Boolean(cronSecret()),
          },
          feeds: FEED_CHANNELS.map((channel) => ({
            channel,
            url: absoluteUrl(feedPath(channel)),
            ...stats[channel],
          })),
        },
        { headers: noStore },
      )
    },
  },
]
