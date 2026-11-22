import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildPurchaseEvent } from '@/lib/measurement/metaCapi'

import { ecomailConfig, heurekaConfig, metaCapiConfig } from './config'
import { type FetchLike, sendEcomailSubscribe, sendHeurekaOrder, sendMetaPurchase } from './senders'

/**
 * Senders against a MOCKED fetch with the documented request/response shapes (no real API is
 * called – there are no credentials, and tests must never send data to Meta/Heureka/Ecomail).
 */

const ENV_KEYS = [
  'NODE_ENV',
  'INTEGRATIONS_ALLOW_NONPROD',
  'META_PIXEL_ID',
  'META_CAPI_ACCESS_TOKEN',
  'META_CAPI_TEST_EVENT_CODE',
  'HEUREKA_OVERENO_API_KEY',
  'ECOMAIL_API_KEY',
  'ECOMAIL_LIST_ID',
] as const
let saved: Record<string, string | undefined> = {}
const env = process.env as Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, env[key]]))
  for (const key of ENV_KEYS) delete env[key]
  env.NODE_ENV = 'test'
})
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete env[key]
    else env[key] = saved[key]
  }
})

function mockFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit; json: Record<string, unknown> }[] = []
  const impl: FetchLike = async (url, init = {}) => {
    calls.push({ url, init, json: JSON.parse(String(init.body)) })
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return { calls, impl }
}

const event = buildPurchaseEvent(
  {
    orderNumber: '100042',
    eventId: 'evt-1',
    createdAt: '2026-11-23T09:00:00.000Z',
    goodsEstimate: 495,
    customer: { email: 'jana@example.test' },
    lines: [{ productId: 406, variantId: 'v500', quantity: 1, estimatedPrice: 495 }],
  },
  { ip: '1.2.3.4', userAgent: 'UA' },
  'https://www.terrys.cz',
)
const NOW = new Date('2026-11-23T09:05:00Z')

describe('configuration gates', () => {
  it('everything is off without credentials', () => {
    expect(metaCapiConfig()).toBeNull()
    expect(heurekaConfig()).toBeNull()
    expect(ecomailConfig()).toBeNull()
  })
  it('outside production credentials alone are not enough', () => {
    env.META_PIXEL_ID = '1234567890'
    env.META_CAPI_ACCESS_TOKEN = 'token'
    env.HEUREKA_OVERENO_API_KEY = 'key'
    env.ECOMAIL_API_KEY = 'key'
    env.ECOMAIL_LIST_ID = '7'
    expect(metaCapiConfig()).toBeNull()
    expect(heurekaConfig()).toBeNull()
    expect(ecomailConfig()).toBeNull()
    env.INTEGRATIONS_ALLOW_NONPROD = '1'
    expect(heurekaConfig()).not.toBeNull()
    expect(ecomailConfig()).not.toBeNull()
    // Meta outside production only with a test event code.
    expect(metaCapiConfig()).toBeNull()
    env.META_CAPI_TEST_EVENT_CODE = 'TEST42'
    expect(metaCapiConfig()).toMatchObject({ pixelId: '1234567890', testEventCode: 'TEST42' })
  })
})

describe('Meta CAPI sender', () => {
  beforeEach(() => {
    env.INTEGRATIONS_ALLOW_NONPROD = '1'
    env.META_PIXEL_ID = '1234567890'
    env.META_CAPI_ACCESS_TOKEN = 'secret-token'
    env.META_CAPI_TEST_EVENT_CODE = 'TEST42'
  })
  it('posts the event to the pixel endpoint and redacts IP/UA afterwards', async () => {
    const { calls, impl } = mockFetch(200, { events_received: 1, fbtrace_id: 'abc' })
    const result = await sendMetaPurchase({ event }, impl, NOW)
    expect(result.outcome).toBe('sent')
    expect(calls[0].url).toBe('https://graph.facebook.com/v27.0/1234567890/events')
    expect(calls[0].json).toMatchObject({ access_token: 'secret-token', test_event_code: 'TEST42' })
    expect((calls[0].json.data as { event_id: string }[])[0].event_id).toBe('evt-1')
    const stored = (result as { storedPayload: { event: typeof event } }).storedPayload.event
    expect(stored.user_data).not.toHaveProperty('client_ip_address')
  })
  it('retries transient errors and 5xx, gives up on validation errors and old events', async () => {
    expect((await sendMetaPurchase({ event }, mockFetch(500, {}).impl, NOW)).outcome).toBe('retry')
    expect(
      (
        await sendMetaPurchase(
          { event },
          mockFetch(400, { error: { message: 'x', is_transient: true } }).impl,
          NOW,
        )
      ).outcome,
    ).toBe('retry')
    expect(
      (
        await sendMetaPurchase(
          { event },
          mockFetch(400, { error: { message: 'Invalid parameter' } }).impl,
          NOW,
        )
      ).outcome,
    ).toBe('give-up')
    expect(
      (await sendMetaPurchase({ event }, mockFetch(200, {}).impl, new Date('2026-12-05T00:00:00Z')))
        .outcome,
    ).toBe('give-up')
    const network: FetchLike = async () => {
      throw new Error('ECONNRESET')
    }
    expect((await sendMetaPurchase({ event }, network, NOW)).outcome).toBe('retry')
  })
  it('is disabled without configuration', async () => {
    delete env.META_PIXEL_ID
    expect((await sendMetaPurchase({ event }, mockFetch(200, {}).impl, NOW)).outcome).toBe(
      'disabled',
    )
  })
})

describe('Heureka sender', () => {
  beforeEach(() => {
    env.INTEGRATIONS_ALLOW_NONPROD = '1'
    env.HEUREKA_OVERENO_API_KEY = 'heureka-key'
  })
  it('sends e-mail, numeric order id and feed item ids', async () => {
    const { calls, impl } = mockFetch(200, { code: 200, message: 'ok' })
    const result = await sendHeurekaOrder(
      { email: 'jana@example.test', orderId: '100042', productItemIds: ['406-v500'] },
      impl,
    )
    expect(result.outcome).toBe('sent')
    expect(calls[0].url).toBe('https://api.heureka.cz/shop-certification/v2/order/log')
    expect(calls[0].json).toEqual({
      apiKey: 'heureka-key',
      email: 'jana@example.test',
      orderId: 100042,
      productItemIds: ['406-v500'],
    })
  })
  it('gives up on 401, retries on 503', async () => {
    const input = { email: 'a@b.cz', orderId: '1', productItemIds: [] }
    expect(
      (await sendHeurekaOrder(input, mockFetch(401, { code: 401, message: 'unauthorized' }).impl))
        .outcome,
    ).toBe('give-up')
    expect((await sendHeurekaOrder(input, mockFetch(503, {}).impl)).outcome).toBe('retry')
  })
})

describe('Ecomail sender', () => {
  beforeEach(() => {
    env.INTEGRATIONS_ALLOW_NONPROD = '1'
    env.ECOMAIL_API_KEY = 'ecomail-key'
    env.ECOMAIL_LIST_ID = '7'
  })
  it('subscribes with double opt-in, key header, tags only for new contacts', async () => {
    const { calls, impl } = mockFetch(200, { id: 1, email: 'jana@example.test' })
    await sendEcomailSubscribe(
      {
        email: 'jana@example.test',
        source: 'web-paticka',
        tags: ['web-paticka'],
        updateExisting: false,
      },
      impl,
    )
    expect(calls[0].url).toBe('https://api2.ecomailapp.cz/lists/7/subscribe')
    expect((calls[0].init.headers as Record<string, string>).key).toBe('ecomail-key')
    expect(calls[0].json).toEqual({
      subscriber_data: { email: 'jana@example.test', source: 'web-paticka', tags: ['web-paticka'] },
      trigger_autoresponders: true,
      update_existing: false,
      skip_confirmation: false,
      resubscribe: false,
    })
    await sendEcomailSubscribe(
      {
        email: 'jana@example.test',
        name: 'Jana',
        surname: 'Nová',
        source: 'objednavka',
        tags: ['x'],
        updateExisting: true,
      },
      impl,
    )
    expect(calls[1].json).toMatchObject({
      subscriber_data: {
        email: 'jana@example.test',
        name: 'Jana',
        surname: 'Nová',
        source: 'objednavka',
      },
      update_existing: true,
    })
    expect((calls[1].json.subscriber_data as Record<string, unknown>).tags).toBeUndefined()
  })
  it('422 is final, 429 is retried', async () => {
    const input = { email: 'x@y.cz', source: 's', updateExisting: false }
    expect(
      (await sendEcomailSubscribe(input, mockFetch(422, { message: 'Validation errors' }).impl))
        .outcome,
    ).toBe('give-up')
    expect((await sendEcomailSubscribe(input, mockFetch(429, {}).impl)).outcome).toBe('retry')
  })
})
