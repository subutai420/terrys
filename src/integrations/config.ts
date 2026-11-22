import { META_GRAPH_VERSION } from '@/lib/measurement/metaCapi'

/**
 * Stage 6: which server-side marketing integrations are switched on – ONLY from env (secrets never
 * live in the database or the repo). Everything is OFF unless its credentials are set, and outside
 * a production server additionally needs `INTEGRATIONS_ALLOW_NONPROD=1` (so a developer who copies
 * production keys into a local `.env` still sends nothing by accident). Meta outside production
 * also requires `META_CAPI_TEST_EVENT_CODE` (events then land only in Events Manager → Test events).
 */

type Env = Record<string, string | undefined>

function allowedHere(env: Env): boolean {
  return env.NODE_ENV === 'production' || env.INTEGRATIONS_ALLOW_NONPROD === '1'
}

export type MetaCapiConfig = {
  pixelId: string
  accessToken: string
  testEventCode?: string
  apiVersion: string
}

export function metaCapiConfig(env: Env = process.env): MetaCapiConfig | null {
  const pixelId = env.META_PIXEL_ID?.trim()
  const accessToken = env.META_CAPI_ACCESS_TOKEN?.trim()
  if (!pixelId || !/^\d{5,20}$/.test(pixelId) || !accessToken) return null
  if (!allowedHere(env)) return null
  const testEventCode = env.META_CAPI_TEST_EVENT_CODE?.trim() || undefined
  if (env.NODE_ENV !== 'production' && !testEventCode) return null
  return {
    pixelId,
    accessToken,
    testEventCode,
    apiVersion: env.META_CAPI_API_VERSION?.trim() || META_GRAPH_VERSION,
  }
}

export type HeurekaConfig = { apiKey: string; endpoint: string }

/** Heureka "Ověřeno zákazníky" API v2 (CZ). */
export const HEUREKA_ORDER_ENDPOINT = 'https://api.heureka.cz/shop-certification/v2/order/log'

export function heurekaConfig(env: Env = process.env): HeurekaConfig | null {
  const apiKey = env.HEUREKA_OVERENO_API_KEY?.trim()
  if (!apiKey || !allowedHere(env)) return null
  return { apiKey, endpoint: HEUREKA_ORDER_ENDPOINT }
}

export type EcomailConfig = { apiKey: string; listId: string; baseUrl: string }

export const ECOMAIL_BASE_URL = 'https://api2.ecomailapp.cz'

export function ecomailConfig(env: Env = process.env): EcomailConfig | null {
  const apiKey = env.ECOMAIL_API_KEY?.trim()
  const listId = env.ECOMAIL_LIST_ID?.trim()
  if (!apiKey || !listId || !/^\d+$/.test(listId) || !allowedHere(env)) return null
  return { apiKey, listId, baseUrl: ECOMAIL_BASE_URL }
}

/** Shared secret of the retry cron (`Authorization: Bearer <CRON_SECRET>`, Vercel Cron sends it). */
export function cronSecret(env: Env = process.env): string | null {
  const value = env.CRON_SECRET?.trim()
  return value && value.length >= 16 ? value : null
}
