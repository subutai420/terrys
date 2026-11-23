import { randomUUID } from 'crypto'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { generateFeed } from '@/feeds/generate'
import { processDueJobs, setIntegrationFetch } from '@/integrations/jobs'
import { assertWellFormedXml } from '@/lib/feeds/xmlCheck'
import { serializeConsent } from '@/lib/measurement/consent'
import { sha256 } from '@/lib/measurement/metaCapi'
import { placeOrder } from '@/orders/placeOrder'

import { createTestImage, getTestPayload } from './helpers'

/**
 * Stage 6 against Payload + PostgreSQL (throwaway database): order placement queues and sends the
 * Meta CAPI / Heureka / Ecomail calls (HTTP MOCKED – never a real API), consent and opt-outs are
 * respected, failures are retried by the cron runner, and the feeds are generated from the
 * catalog with the public rules and the category mapping.
 */

let payload: Payload
const created: { collection: string; id: number }[] = []
const MONDAY_MORNING = new Date('2026-11-23T09:00:00Z')
const POSTCODE = '14100'
let vanId: number
let ribEyeId: number
let variant250: string
let variant500: string

const ENV = {
  INTEGRATIONS_ALLOW_NONPROD: '1',
  META_PIXEL_ID: '1234567890',
  META_CAPI_ACCESS_TOKEN: 'test-token',
  META_CAPI_TEST_EVENT_CODE: 'TEST42',
  HEUREKA_OVERENO_API_KEY: 'heureka-test',
  ECOMAIL_API_KEY: 'ecomail-test',
  ECOMAIL_LIST_ID: '7',
}
const savedEnv: Record<string, string | undefined> = {}

type Call = { url: string; body: Record<string, unknown> }
let calls: Call[] = []
let respond: (url: string) => Response = () => new Response('{}')

async function track<T extends { id: number }>(collection: string, promise: Promise<T>) {
  const doc = await promise
  created.push({ collection, id: doc.id })
  return doc
}

const consentCookie = (marketing: boolean) =>
  `terrys_consent=${serializeConsent({ analytics: true, marketing, version: '2026-11', timestamp: MONDAY_MORNING.toISOString() })}; _fbp=fb.1.1700000000000.123456; _fbc=fb.1.1700000000000.IwAR-test`

function input(overrides: Record<string, unknown> = {}) {
  return {
    checkoutId: randomUUID(),
    formToken: 'x',
    lines: [{ productId: ribEyeId, variantId: variant250, quantity: 2 }],
    delivery: { postcode: POSTCODE, methodId: vanId, date: '2026-11-24' },
    customer: {
      firstName: 'Jana',
      lastName: 'Měřená',
      email: 'Jana.Merena@example.test',
      phone: '602 123 456',
    },
    address: { street: 'Měřicí 1', city: 'Praha 4', postcode: POSTCODE },
    consents: { terms: true, newsletter: true, heurekaOptOut: false },
    ...overrides,
  }
}

async function orderByNumber(orderNumber: string) {
  const found = await payload.find({
    collection: 'orders',
    where: { orderNumber: { equals: orderNumber } },
    overrideAccess: true,
    depth: 0,
    limit: 1,
  })
  return found.docs[0]
}

async function jobsOf(orderId: number) {
  return (
    await payload.find({
      collection: 'integration-jobs',
      where: { order: { equals: orderId } },
      overrideAccess: true,
      depth: 0,
      sort: 'id',
    })
  ).docs
}

beforeAll(async () => {
  process.env.EMAIL_OUTBOX_DIR = `.emails-int-measure-${Date.now()}`
  for (const [key, value] of Object.entries(ENV)) {
    savedEnv[key] = process.env[key]
    process.env[key] = value
  }
  payload = await getTestPayload()
  vi.spyOn(payload, 'sendEmail').mockResolvedValue({})
  setIntegrationFetch(async (url, init) => {
    calls.push({ url, body: JSON.parse(String(init?.body ?? '{}')) })
    return respond(url)
  })
  await payload.updateGlobal({ slug: 'settings', data: { deliveryPrice: 229 } })

  const van = await track(
    'shipping-methods',
    payload.create({
      collection: 'shipping-methods',
      data: {
        name: 'Rozvoz měření',
        type: 'own-delivery',
        coverage: 'zones',
        weekdays: ['tue', 'wed', 'thu', 'fri'],
        cutoffTime: '12:00',
        leadDays: 1,
        sortOrder: 950,
      },
    }),
  )
  vanId = van.id
  await track(
    'delivery-zones',
    payload.create({
      collection: 'delivery-zones',
      data: { name: 'Měření', method: vanId, postcodes: POSTCODE, active: true },
    }),
  )
  const existing = await payload.find({
    collection: 'postcodes',
    where: { code: { equals: POSTCODE } },
    limit: 1,
  })
  if (!existing.docs[0]) {
    await track(
      'postcodes',
      payload.create({ collection: 'postcodes', data: { code: POSTCODE, city: 'Praha 4' } }),
    )
  }

  const parent = await track(
    'categories',
    payload.create({
      collection: 'categories',
      data: {
        title: 'Měření steaky',
        feeds: { googleProductCategory: '5805', heurekaCategory: 'Heureka.cz | Test | Maso' },
      },
      context: { disableRevalidate: true },
    }),
  )
  const child = await track(
    'categories',
    payload.create({
      collection: 'categories',
      data: { title: 'Měření rib eye', parent: parent.id },
      context: { disableRevalidate: true },
    }),
  )
  const excludedCategory = await track(
    'categories',
    payload.create({
      collection: 'categories',
      data: { title: 'Měření služby', feeds: { exclude: true } },
      context: { disableRevalidate: true },
    }),
  )
  const image = await track('media', createTestImage(payload, 'Měření test'))
  const product = (data: Record<string, unknown>) =>
    track(
      'products',
      payload.create({
        collection: 'products',
        data: { mainImage: image.id, _status: 'published', vatRate: '12', ...data } as never,
        context: { disableRevalidate: true },
      }),
    )
  const ribEye = await product({
    title: 'Měřený rib eye',
    price: 990,
    priceUnit: 'kg',
    availability: 'in-stock',
    categories: [child.id],
    brand: 'Farma Test',
    variants: [
      { label: '250 g', kind: 'weight', weightGrams: 250 },
      { label: '500 g', kind: 'weight', weightGrams: 500, availability: 'sold-out' },
    ],
  })
  ribEyeId = ribEye.id
  const variants = (ribEye as unknown as { variants: { id: string }[] }).variants
  variant250 = variants[0].id
  variant500 = variants[1].id
  await product({
    title: 'Měření vyřazený',
    price: 100,
    priceUnit: 'piece',
    availability: 'in-stock',
    feeds: { exclude: true },
  })
  await product({
    title: 'Měření broušení',
    price: 200,
    priceUnit: 'piece',
    availability: 'in-stock',
    categories: [excludedCategory.id],
  })
  await product({ title: 'Měření skrytý', price: 100, priceUnit: 'piece', availability: 'hidden' })
  await product({
    title: 'Měření koncept',
    price: 100,
    priceUnit: 'piece',
    availability: 'in-stock',
    _status: 'draft',
  })
})

beforeEach(() => {
  calls = []
  respond = (url) =>
    url.includes('graph.facebook.com')
      ? Response.json({ events_received: 1, fbtrace_id: 't' })
      : url.includes('heureka')
        ? Response.json({ code: 200, message: 'ok' })
        : Response.json({ id: 1, email: 'x' })
})

afterAll(async () => {
  setIntegrationFetch(null)
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  if (!payload) return
  await payload.delete({
    collection: 'integration-jobs',
    where: { id: { exists: true } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'orders',
    where: { id: { exists: true } },
    overrideAccess: true,
  })
  for (const { collection, id } of created.reverse()) {
    await payload
      .delete({
        collection: collection as 'products',
        id,
        overrideAccess: true,
        context: { disableRevalidate: true },
      })
      .catch(() => undefined)
  }
  const { rm } = await import('fs/promises')
  await rm(process.env.EMAIL_OUTBOX_DIR as string, { recursive: true, force: true })
})

describe('order → Meta CAPI, Heureka, Ecomail', () => {
  it('with marketing consent sends all three, deduplicable, and records it on the order', async () => {
    const result = await placeOrder(payload, input(), {
      now: MONDAY_MORNING,
      skipBotChecks: true,
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0 test',
      cookieHeader: consentCookie(true),
      integrations: 'await',
    })
    expect(result.ok).toBe(true)
    const order = await orderByNumber((result as { orderNumber: string }).orderNumber)
    const itemId = `${ribEyeId}-${variant250}`

    const meta = calls.find((c) => c.url.includes('graph.facebook.com'))
    expect(meta?.url).toBe('https://graph.facebook.com/v27.0/1234567890/events')
    const event = (meta?.body.data as Record<string, unknown>[])[0] as {
      event_id: string
      event_source_url: string
      user_data: Record<string, unknown>
      custom_data: Record<string, unknown>
    }
    expect(meta?.body.test_event_code).toBe('TEST42')
    expect(event.event_id).toBe(order.eventId)
    expect(event.event_source_url).toMatch(/\/objednavka$/)
    expect(event.user_data.em).toEqual([sha256('jana.merena@example.test')])
    expect(event.user_data).toMatchObject({
      client_ip_address: '203.0.113.7',
      client_user_agent: 'Mozilla/5.0 test',
      fbp: 'fb.1.1700000000000.123456',
      fbc: 'fb.1.1700000000000.IwAR-test',
    })
    expect(event.custom_data).toMatchObject({
      value: 495,
      currency: 'CZK',
      content_ids: [itemId],
      order_id: order.orderNumber,
    })

    const heureka = calls.find((c) => c.url.includes('heureka'))
    expect(heureka?.body).toEqual({
      apiKey: 'heureka-test',
      email: 'jana.merena@example.test',
      orderId: Number(order.orderNumber),
      productItemIds: [itemId],
    })
    const ecomail = calls.find((c) => c.url.includes('ecomailapp'))
    expect(ecomail?.body).toMatchObject({
      subscriber_data: {
        email: 'jana.merena@example.test',
        name: 'Jana',
        surname: 'Měřená',
        source: 'objednavka',
      },
      update_existing: true,
      skip_confirmation: false,
    })

    const fresh = await orderByNumber(order.orderNumber)
    expect(fresh.integrations).toMatchObject({
      metaStatus: 'sent',
      heurekaStatus: 'sent',
      ecomailStatus: 'sent',
    })
    const jobs = await jobsOf(order.id)
    expect(jobs.map((job) => [job.kind, job.status])).toEqual([
      ['meta-capi-purchase', 'sent'],
      ['heureka-order', 'sent'],
      ['ecomail-subscribe', 'sent'],
    ])
    // IP and user agent are not kept after the send.
    const stored = JSON.stringify(jobs[0].payload)
    expect(stored).not.toContain('203.0.113.7')
    expect(stored).not.toContain('Mozilla')
  })

  it('without marketing consent no CAPI; Heureka opt-out and no newsletter are respected', async () => {
    const result = await placeOrder(
      payload,
      input({ consents: { terms: true, newsletter: false, heurekaOptOut: true } }),
      {
        now: MONDAY_MORNING,
        skipBotChecks: true,
        cookieHeader: consentCookie(false),
        integrations: 'await',
      },
    )
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(0)
    const order = await orderByNumber((result as { orderNumber: string }).orderNumber)
    expect(order.integrations).toMatchObject({
      metaStatus: 'skipped',
      heurekaStatus: 'skipped',
      ecomailStatus: 'skipped',
    })
    expect(await jobsOf(order.id)).toHaveLength(0)
  })

  it('a failing service never breaks the order and is retried by the cron runner', async () => {
    respond = () => new Response('{"message":"down"}', { status: 503 })
    const result = await placeOrder(
      payload,
      input({ consents: { terms: true, newsletter: false, heurekaOptOut: false } }),
      {
        now: MONDAY_MORNING,
        skipBotChecks: true,
        cookieHeader: consentCookie(true),
        integrations: 'await',
      },
    )
    expect(result.ok).toBe(true)
    const order = await orderByNumber((result as { orderNumber: string }).orderNumber)
    let jobs = await jobsOf(order.id)
    expect(jobs.map((job) => job.status)).toEqual(['failed', 'failed'])
    expect(jobs[0].nextAttemptAt).toBeTruthy()
    expect((await orderByNumber(order.orderNumber)).integrations?.heurekaStatus).toBe('failed')

    // Not due yet: nothing happens.
    calls = []
    respond = (url) =>
      url.includes('graph.facebook.com')
        ? Response.json({ events_received: 1 })
        : Response.json({ code: 200, message: 'ok' })
    await processDueJobs(payload, new Date())
    expect(calls).toHaveLength(0)
    // Due later: sent.
    await processDueJobs(payload, new Date(Date.now() + 10 * 60_000))
    jobs = await jobsOf(order.id)
    expect(jobs.map((job) => [job.status, job.attempts])).toEqual([
      ['sent', 2],
      ['sent', 2],
    ])
    expect((await orderByNumber(order.orderNumber)).integrations?.metaStatus).toBe('sent')
  })

  it('without keys everything is "disabled" and nothing is queued', async () => {
    const saved = process.env.HEUREKA_OVERENO_API_KEY
    delete process.env.HEUREKA_OVERENO_API_KEY
    const result = await placeOrder(
      payload,
      input({ consents: { terms: true, newsletter: false, heurekaOptOut: false } }),
      {
        now: MONDAY_MORNING,
        skipBotChecks: true,
        integrations: 'await',
      },
    )
    process.env.HEUREKA_OVERENO_API_KEY = saved
    const order = await orderByNumber((result as { orderNumber: string }).orderNumber)
    expect(order.integrations).toMatchObject({ heurekaStatus: 'disabled', metaStatus: 'skipped' })
  })
})

describe('feeds from the catalog', () => {
  it('google: public products only, category mapping, unit pricing', async () => {
    const feed = await generateFeed(payload, 'google', MONDAY_MORNING)
    assertWellFormedXml(feed.xml)
    expect(feed.xml).toContain(`<g:id>${ribEyeId}-${variant250}</g:id>`)
    expect(feed.xml).toContain(`<g:id>${ribEyeId}-${variant500}</g:id>`)
    expect(feed.xml).toContain('<g:google_product_category>5805</g:google_product_category>')
    expect(feed.xml).toContain('<g:product_type>Měření steaky &gt; Měření rib eye</g:product_type>')
    expect(feed.xml).toContain('<g:brand>Farma Test</g:brand>')
    expect(feed.xml).toContain('<g:unit_pricing_measure>250 g</g:unit_pricing_measure>')
    expect(feed.xml).toContain('<g:price>229.00 CZK</g:price>')
    for (const hidden of [
      'Měření vyřazený',
      'Měření broušení',
      'Měření skrytý',
      'Měření koncept',
    ]) {
      expect(feed.xml).not.toContain(hidden)
    }
    // Only this file's products ("Měření …"): the test database is shared with the other
    // integration test files, which leave their own products behind (e.g. access.int.test.ts).
    const excludedHere = feed.excluded
      .map((e) => e.title)
      .filter((title) => title.startsWith('Měření '))
      .sort()
    expect(excludedHere).toEqual(['Měření broušení', 'Měření vyřazený'])
  })

  it('heureka: mapped category inherited from the parent, sold-out variant left out', async () => {
    const feed = await generateFeed(payload, 'heureka', MONDAY_MORNING)
    assertWellFormedXml(feed.xml)
    expect(feed.xml).toContain(`<ITEM_ID>${ribEyeId}-${variant250}</ITEM_ID>`)
    expect(feed.xml).not.toContain(`${ribEyeId}-${variant500}`)
    expect(feed.xml).toContain('<CATEGORYTEXT>Heureka.cz | Test | Maso</CATEGORYTEXT>')
  })

  it('meta and zboží are well-formed and use the defaults', async () => {
    const meta = await generateFeed(payload, 'meta', MONDAY_MORNING)
    assertWellFormedXml(meta.xml)
    const zbozi = await generateFeed(payload, 'zbozi', MONDAY_MORNING)
    assertWellFormedXml(zbozi.xml)
    expect(zbozi.xml).toContain(
      '<CATEGORYTEXT>Potraviny a nápoje | Potraviny | Maso a ryby</CATEGORYTEXT>',
    )
  })
})
