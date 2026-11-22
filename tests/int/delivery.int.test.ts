import type { Payload, PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prefillHolidayExceptions } from '@/delivery/holidayPrefill'
import { deliveryOptionsResponse, getDeliveryOptionsForPostcode } from '@/delivery/options'
import { postcodeImportEndpoint } from '@/delivery/postcodeEndpoints'
import { exportPostcodesCsv, importPostcodesCsv } from '@/delivery/postcodeImport'

import { getTestPayload, type TestUser } from './helpers'

/**
 * Integration test of the delivery module: real Payload + real PostgreSQL (throwaway database).
 *
 * The users below are NOT saved in the database (the access test relies on being the first to
 * create a user); access functions only look at `user.role`.
 */

let payload: Payload
const fakeUser = (id: number, role: TestUser['role']) =>
  ({ id, role, email: `${role}@example.test`, collection: 'users' }) as unknown as TestUser
const admin = fakeUser(9001, 'admin')
const staff = fakeUser(9002, 'staff')
const butcher = fakeUser(9003, 'butcher')

let vanId: number
let pickupId: number

// Monday 23. 11. 2026 10:00 in Prague (winter time, UTC+1)
const MONDAY_MORNING = new Date('2026-11-23T09:00:00Z')

beforeAll(async () => {
  payload = await getTestPayload()

  const shop = await payload.create({
    collection: 'locations',
    data: {
      name: 'Prodejna Italská',
      kind: 'shop',
      isPickupPoint: true,
      address: { street: 'Italská 17', city: 'Praha 2', zip: '12000' },
    },
  })

  const common = {
    weekdays: ['tue', 'wed', 'thu', 'fri'] as const,
    cutoffTime: '12:00',
    leadDays: 1,
  }
  const van = await payload.create({
    collection: 'shipping-methods',
    data: {
      ...common,
      weekdays: [...common.weekdays],
      name: 'Rozvoz Terrys',
      type: 'own-delivery',
      coverage: 'zones',
      sortOrder: 10,
      internalNote: 'TAJNÁ INTERNÍ POZNÁMKA',
    },
  })
  vanId = van.id
  await payload.create({
    collection: 'shipping-methods',
    data: {
      ...common,
      weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      name: 'Kurýr PPL',
      type: 'courier',
      coverage: 'fallback',
      balikobot: { carrierCode: 'ppl-secret-code', serviceCode: 'SVC-42' },
      sortOrder: 20,
    },
  })
  const pickup = await payload.create({
    collection: 'shipping-methods',
    data: {
      ...common,
      weekdays: [...common.weekdays],
      name: 'Osobní odběr Italská',
      type: 'pickup',
      location: shop.id,
      sortOrder: 30,
    },
  })
  pickupId = pickup.id
  await payload.create({
    collection: 'shipping-methods',
    data: {
      ...common,
      weekdays: ['sat'],
      name: 'Vypnutý',
      type: 'pickup',
      location: shop.id,
      active: false,
    },
  })

  await payload.create({
    collection: 'delivery-zones',
    data: { name: 'Praha', method: vanId, postcodes: '1*', active: true },
  })

  await importPostcodesCsv(
    payload,
    'psc;obec;okres;nedorucujeme\n12000;Praha 2;Praha;ne\n60200;Brno;Brno-město;ne\n39999;Nikde;;ano\n',
  )
})

afterAll(async () => {
  await payload?.destroy()
})

describe('delivery options (server function)', () => {
  it('returns methods with price and dates for a Prague postcode', async () => {
    const result = await getDeliveryOptionsForPostcode(payload, '120 00', { now: MONDAY_MORNING })
    if (!result.ok) throw new Error('expected ok')
    const { data } = result
    expect(data.postcode).toEqual({
      code: '12000',
      formatted: '120 00',
      city: 'Praha 2',
      known: true,
      deliveryBlocked: false,
    })
    expect(data.horizonDays).toBe(21)
    expect(data.today).toBe('2026-11-23')
    expect(data.methods.map((m) => m.name)).toEqual([
      'Rozvoz Terrys',
      'Kurýr PPL',
      'Osobní odběr Italská',
    ])
    const [van, ppl, pickup] = data.methods
    expect(van).toMatchObject({ price: 229, available: true, cutoffTime: '12:00' })
    expect(van.dates[0]).toBe('2026-11-24')
    expect(ppl).toMatchObject({ available: false, unavailableReason: 'outside-area' })
    expect(ppl.message).toBeTruthy()
    expect(pickup).toMatchObject({ price: 0, available: true })
    expect(pickup.pickupLocation).toMatchObject({ name: 'Prodejna Italská', street: 'Italská 17' })
  })

  it('applies exceptions stored through Payload (date picker timestamps)', async () => {
    // As saved by the admin date picker in Prague: midnight Prague = 23:00 UTC the day before.
    const exception = await payload.create({
      collection: 'delivery-exceptions',
      data: {
        dateFrom: '2026-11-23T23:00:00.000Z',
        reason: 'Porucha vozu',
        kind: 'closed',
        scope: 'method',
        method: vanId,
      },
    })
    const result = await getDeliveryOptionsForPostcode(payload, '12000', { now: MONDAY_MORNING })
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.methods[0].dates[0]).toBe('2026-11-25')
    expect(result.data.methods[2].dates[0]).toBe('2026-11-24')
    await payload.delete({ collection: 'delivery-exceptions', id: exception.id })
  })

  it('offers PPL outside Prague, only pickup for blocked and unknown postcodes', async () => {
    const brno = await getDeliveryOptionsForPostcode(payload, '60200', { now: MONDAY_MORNING })
    if (!brno.ok) throw new Error('expected ok')
    expect(brno.data.methods.find((m) => m.name === 'Kurýr PPL')?.available).toBe(true)

    for (const psc of ['39999', '58001']) {
      const result = await getDeliveryOptionsForPostcode(payload, psc, { now: MONDAY_MORNING })
      if (!result.ok) throw new Error('expected ok')
      expect(result.data.methods.filter((m) => m.available).map((m) => m.type)).toEqual(['pickup'])
    }
  })

  it('rejects an invalid postcode', async () => {
    expect(await getDeliveryOptionsForPostcode(payload, '1234')).toMatchObject({
      ok: false,
      error: 'invalid-postcode',
    })
  })
})

describe('GET /api/delivery/options response', () => {
  it('returns JSON with short shared caching and no admin-only data', async () => {
    const response = await deliveryOptionsResponse(
      payload,
      new URLSearchParams({ psc: '60200' }),
      MONDAY_MORNING,
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=60')
    const text = await response.text()
    expect(text).not.toContain('ppl-secret-code')
    expect(text).not.toContain('SVC-42')
    expect(text).not.toContain('TAJNÁ')
    expect(text).not.toContain('zoneName')
    expect(text).not.toContain('Vypnutý')
    const body = JSON.parse(text)
    expect(body.methods[1]).toMatchObject({ name: 'Kurýr PPL', price: 229, currency: 'CZK' })
  })

  it('answers 400 with a Czech message for invalid input', async () => {
    for (const psc of [null, 'abc', '1'.repeat(50)]) {
      const params = new URLSearchParams(psc === null ? {} : { psc })
      const response = await deliveryOptionsResponse(payload, params, MONDAY_MORNING)
      expect(response.status).toBe(400)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect((await response.json()).message).toContain('PSČ')
    }
  })
})

describe('postcode CSV import / export', () => {
  it('creates, updates, keeps unchanged rows and reports errors', async () => {
    const summary = await importPostcodesCsv(
      payload,
      'psc;obec;okres\n12000;Praha 2;Praha\n60200;Brno-střed;Brno-město\n70200;Ostrava;\n12;Špatně;\n70200;Duplicita;\n',
    )
    expect(summary).toMatchObject({
      created: 1,
      updated: 1,
      unchanged: 1,
      skipped: 1,
      errorCount: 1,
    })
    expect(summary.errors[0].line).toBe(5)

    const blocked = await payload.find({
      collection: 'postcodes',
      where: { code: { equals: '39999' } },
    })
    expect(blocked.docs[0].deliveryBlocked).toBe(true)

    const csv = await exportPostcodesCsv(payload)
    expect(csv).toContain('60200;Brno-střed;Brno-město;ne')
    expect(csv).toContain('39999;Nikde;;ano')
  })

  it('imports thousands of rows quickly in batches', async () => {
    const lines = ['psc;obec']
    for (let i = 0; i < 3000; i++) lines.push(`${40000 + i};Obec ${i}`)
    const started = Date.now()
    const summary = await importPostcodesCsv(payload, lines.join('\n'))
    expect(summary.created).toBe(3000)
    expect(Date.now() - started).toBeLessThan(20_000)
    const again = await importPostcodesCsv(payload, lines.join('\n'))
    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 3000 })
  })

  it('allows the import endpoint to administrators only', async () => {
    const request = (user: TestUser) =>
      ({
        user,
        payload,
        arrayBuffer: async () => new TextEncoder().encode('psc;obec\n77900;Olomouc\n').buffer,
      }) as unknown as PayloadRequest
    expect((await postcodeImportEndpoint.handler(request(staff))).status).toBe(403)
    const response = await postcodeImportEndpoint.handler(request(admin))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ created: 1 })
  })
})

describe('access', () => {
  it('lets staff manage exceptions, but not the butcher or anonymous visitors', async () => {
    const created = await payload.create({
      collection: 'delivery-exceptions',
      data: {
        dateFrom: '2027-07-06T12:00:00.000Z',
        dateTo: '2027-07-19T12:00:00.000Z',
        reason: 'Dovolená',
        kind: 'closed',
        scope: 'all',
      },
      user: staff,
      overrideAccess: false,
    })
    expect(created.reason).toBe('Dovolená')
    await expect(
      payload.create({
        collection: 'delivery-exceptions',
        data: { dateFrom: '2027-07-01T12:00:00.000Z', reason: 'X', kind: 'closed', scope: 'all' },
        user: butcher,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.find({ collection: 'delivery-exceptions', overrideAccess: false }),
    ).rejects.toMatchObject({ status: 403 })
    await payload.delete({
      collection: 'delivery-exceptions',
      id: created.id,
      user: staff,
      overrideAccess: false,
    })
  })

  it('keeps methods, zones and postcodes admin-only and hidden from the public', async () => {
    await expect(
      payload.create({
        collection: 'shipping-methods',
        data: {
          name: 'X',
          type: 'pickup',
          weekdays: ['mon'],
          cutoffTime: '10:00',
          leadDays: 0,
          location: 1,
        },
        user: staff,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    for (const collection of ['shipping-methods', 'delivery-zones', 'postcodes'] as const) {
      await expect(payload.find({ collection, overrideAccess: false })).rejects.toMatchObject({
        status: 403,
      })
    }
    const asButcher = await payload.find({
      collection: 'shipping-methods',
      user: butcher,
      overrideAccess: false,
    })
    expect(asButcher.totalDocs).toBeGreaterThan(0)
  })

  it('validates exceptions, zones and methods', async () => {
    await expect(
      payload.create({
        collection: 'delivery-exceptions',
        data: {
          dateFrom: '2027-07-06T12:00:00.000Z',
          reason: 'Bez metody',
          kind: 'closed',
          scope: 'method',
        },
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      payload.create({
        collection: 'delivery-exceptions',
        data: {
          dateFrom: '2027-07-06T12:00:00.000Z',
          dateTo: '2027-07-01T12:00:00.000Z',
          reason: 'Obráceně',
          kind: 'closed',
          scope: 'all',
        },
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      payload.create({
        collection: 'delivery-zones',
        data: { name: 'Špatná', method: vanId, postcodes: '9*, abc' },
      }),
    ).rejects.toMatchObject({ status: 400 })
    const zone = await payload.create({
      collection: 'delivery-zones',
      data: { name: 'Normalizace', method: vanId, postcodes: '250 01,\n252*', active: false },
    })
    expect(zone.postcodes).toBe('25001, 252*')
    await expect(
      payload.create({
        collection: 'shipping-methods',
        data: {
          name: 'Bez místa',
          type: 'pickup',
          weekdays: ['mon'],
          cutoffTime: '10:00',
          leadDays: 0,
        },
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      payload.create({
        collection: 'shipping-methods',
        data: {
          name: 'Špatný čas',
          type: 'courier',
          weekdays: ['mon'],
          cutoffTime: '25:00',
          leadDays: 0,
        },
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      payload.updateGlobal({
        slug: 'settings',
        data: { deliveryPrice: 0 },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 400 })
    expect(pickupId).toBeGreaterThan(0)
  })
})

describe('holiday pre-fill', () => {
  it('creates the holidays of a year once and skips past dates', async () => {
    const first = await prefillHolidayExceptions(payload, { year: 2027, today: '2027-03-01' })
    expect(first.created.map((h) => h.date)).toContain('2027-03-26') // Velký pátek
    expect(first.created).toHaveLength(12) // 1. 1. is in the past
    expect(first.skipped).toBe(1)

    const second = await prefillHolidayExceptions(payload, { year: 2027, today: '2027-03-01' })
    expect(second.created).toHaveLength(0)
    expect(second.skipped).toBe(13)

    // Good Friday is a closed day for delivery now – but only because of the record.
    const result = await getDeliveryOptionsForPostcode(payload, '12000', {
      now: new Date('2027-03-22T08:00:00Z'), // Monday 22. 3. 2027 09:00
    })
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.methods[0].dates).toContain('2027-03-25')
    expect(result.data.methods[0].dates).not.toContain('2027-03-26')
  })
})
