import type { IntegrationKind } from '@/collections/IntegrationJobs'
import {
  capiBody,
  capiEndpoint,
  type CapiEvent,
  isTooOld,
  redactEvent,
} from '@/lib/measurement/metaCapi'

import { ecomailConfig, heurekaConfig, metaCapiConfig } from './config'

/**
 * Stage 6: one HTTP call per outbox row (`integration-jobs`). Each sender returns
 * - `sent` (with the service's answer),
 * - `retry` (network error, timeout, HTTP 429/5xx, Meta "is_transient") → tried again later,
 * - `give-up` (4xx validation/auth errors, Meta event older than 7 days) → no point in retrying,
 * - `disabled` (credentials not configured any more).
 * `fetchImpl` is injectable for tests (all tests use a mocked fetch – no real API is ever called).
 */

export type SendResult =
  | { outcome: 'sent'; response: unknown; storedPayload?: unknown }
  | { outcome: 'retry' | 'give-up' | 'disabled'; error: string; response?: unknown }

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type HeurekaJobPayload = { email: string; orderId: string; productItemIds: string[] }
export type EcomailJobPayload = {
  email: string
  name?: string | null
  surname?: string | null
  source: string
  tags?: string[]
  /** Order customers: update the existing contact (name); footer signups: never overwrite. */
  updateExisting: boolean
  /** Evidence: which consent text the person agreed to and when. */
  consentText?: string
  consentAt?: string
}
export type MetaJobPayload = { event: CapiEvent }

const TIMEOUT_MS = 8000

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '')
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return text.slice(0, 500)
  }
}

function classify(status: number): 'retry' | 'give-up' {
  return status === 429 || status >= 500 ? 'retry' : 'give-up'
}

async function postJson(
  fetchImpl: FetchLike,
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  method = 'POST',
): Promise<{ response: Response; body: unknown } | { error: string }> {
  try {
    const response = await fetchImpl(url, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return { response, body: await readBody(response) }
  } catch (error) {
    return { error: `Síťová chyba: ${String((error as Error)?.message ?? error)}` }
  }
}

export async function sendMetaPurchase(
  payload: MetaJobPayload,
  fetchImpl: FetchLike,
  now = new Date(),
): Promise<SendResult> {
  const config = metaCapiConfig()
  if (!config) return { outcome: 'disabled', error: 'Meta CAPI není nastavené (env).' }
  if (isTooOld(payload.event, now)) {
    return { outcome: 'give-up', error: 'Událost je starší než 7 dní – Meta ji už nepřijme.' }
  }
  const result = await postJson(
    fetchImpl,
    capiEndpoint(config.pixelId, config.apiVersion),
    capiBody([payload.event], config.accessToken, config.testEventCode),
  )
  if ('error' in result) return { outcome: 'retry', error: result.error }
  const body = result.body as {
    events_received?: number
    error?: { message?: string; is_transient?: boolean; code?: number }
  } | null
  if (result.response.ok && body?.events_received) {
    return {
      outcome: 'sent',
      response: body,
      storedPayload: { event: redactEvent(payload.event) },
    }
  }
  const message = `Meta ${result.response.status}: ${body?.error?.message ?? 'neznámá chyba'}`
  return {
    outcome: body?.error?.is_transient ? 'retry' : classify(result.response.status),
    error: message,
    response: body,
  }
}

export async function sendHeurekaOrder(
  payload: HeurekaJobPayload,
  fetchImpl: FetchLike,
): Promise<SendResult> {
  const config = heurekaConfig()
  if (!config)
    return { outcome: 'disabled', error: 'Heureka Ověřeno zákazníky není nastavené (env).' }
  // Heureka's own PHP client sends the order id as an integer; our order numbers are digits.
  const orderId = /^\d+$/.test(payload.orderId) ? Number(payload.orderId) : payload.orderId
  const result = await postJson(fetchImpl, config.endpoint, {
    apiKey: config.apiKey,
    email: payload.email,
    orderId,
    productItemIds: payload.productItemIds,
  })
  if ('error' in result) return { outcome: 'retry', error: result.error }
  const body = result.body as { code?: number; message?: string; description?: string } | null
  if (result.response.ok && (body?.code === 200 || body?.message === 'ok')) {
    return { outcome: 'sent', response: body }
  }
  return {
    outcome: classify(result.response.status),
    error:
      `Heureka ${result.response.status}: ${body?.message ?? ''} ${body?.description ?? ''}`.trim(),
    response: body,
  }
}

/**
 * Ecomail API v2 `POST /lists/{id}/subscribe` (https://docs.ecomail.cz/api-reference/lists/subscribe).
 * Double opt-in: `skip_confirmation: false` → Ecomail sends its confirmation e-mail and keeps the
 * contact "unconfirmed" until the person clicks it.
 */
export async function sendEcomailSubscribe(
  payload: EcomailJobPayload,
  fetchImpl: FetchLike,
): Promise<SendResult> {
  const config = ecomailConfig()
  if (!config) return { outcome: 'disabled', error: 'Ecomail není nastavený (env).' }
  const subscriber: Record<string, unknown> = { email: payload.email, source: payload.source }
  if (payload.name) subscriber.name = payload.name
  if (payload.surname) subscriber.surname = payload.surname
  // Tags overwrite existing ones in Ecomail, so they are sent only for new contacts.
  if (payload.tags?.length && !payload.updateExisting) subscriber.tags = payload.tags
  const result = await postJson(
    fetchImpl,
    `${config.baseUrl}/lists/${encodeURIComponent(config.listId)}/subscribe`,
    {
      subscriber_data: subscriber,
      trigger_autoresponders: true,
      update_existing: payload.updateExisting,
      skip_confirmation: false,
      resubscribe: false,
    },
    { key: config.apiKey },
  )
  if ('error' in result) return { outcome: 'retry', error: result.error }
  if (result.response.ok) return { outcome: 'sent', response: result.body }
  const body = result.body as { message?: string } | null
  return {
    outcome: classify(result.response.status),
    error: `Ecomail ${result.response.status}: ${body?.message ?? JSON.stringify(result.body ?? '').slice(0, 200)}`,
    response: result.body,
  }
}

export function sendJob(
  kind: IntegrationKind,
  payload: unknown,
  fetchImpl: FetchLike,
  now = new Date(),
): Promise<SendResult> {
  switch (kind) {
    case 'meta-capi-purchase':
      return sendMetaPurchase(payload as MetaJobPayload, fetchImpl, now)
    case 'heureka-order':
      return sendHeurekaOrder(payload as HeurekaJobPayload, fetchImpl)
    case 'ecomail-subscribe':
      return sendEcomailSubscribe(payload as EcomailJobPayload, fetchImpl)
  }
}
