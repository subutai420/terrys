import { describe, expect, it, vi } from 'vitest'

import { balikobotCarrier, getCarrierService, simulationCarrier } from '@/shipping/carrier'

import {
  buildAddRequest,
  formatCarrierError,
  normalizePhone,
  parseAddResponse,
  parseDropResponse,
  parseLabelsResponse,
  parseOrderResponse,
  type ShipmentInput,
  validateShipmentInput,
  variableSymbol,
} from './balikobot'
import addError from './fixtures/add-error.json'
import addOk from './fixtures/add-ok.json'
import dropAlreadyOrdered from './fixtures/drop-already-ordered.json'
import dropOk from './fixtures/drop-ok.json'
import labelsOk from './fixtures/labels-ok.json'
import orderOk from './fixtures/order-ok.json'

/**
 * Contract tests against the request/response SHAPES documented in the Balíkobot API v2 docs
 * (fixtures in ./fixtures are handwritten from the documented examples). They do NOT prove the
 * real API accepts our data – that needs the real account (stage 9 checklist).
 */

const input = (over: Partial<ShipmentInput> = {}): ShipmentInput => ({
  orderNumber: '100123',
  attempt: 1,
  carrierCode: 'ppl',
  serviceCode: '4',
  recipient: {
    name: 'Jana Nováková',
    company: null,
    street: 'Masarykova 12',
    city: 'Brno',
    postcode: '602 00',
    phone: '602 123 456',
    email: 'jana@example.test',
  },
  codAmount: 1234,
  currency: 'CZK',
  invoiceNumber: '2026000123',
  declaredValue: 1234,
  weightGrams: 2340,
  ...over,
})

describe('ADD request builder', () => {
  it('maps the order to the documented PPL fields', () => {
    expect(buildAddRequest(input())).toEqual({
      packages: [
        {
          eid: '100123',
          real_order_id: '100123',
          reference: '100123',
          service_type: '4',
          rec_name: 'Jana Nováková',
          rec_street: 'Masarykova 12',
          rec_city: 'Brno',
          rec_zip: '60200',
          rec_country: 'CZ',
          rec_phone: '+420602123456',
          rec_email: 'jana@example.test',
          price: 1234,
          ins_currency: 'CZK',
          weight: 2.34,
          return_track: true,
          return_full_errors: true,
          cod_price: 1234,
          cod_currency: 'CZK',
          vs: '2026000123',
        },
      ],
    })
  })

  it('no cash on delivery when nothing is due (fully paid by voucher); new eid after a drop', () => {
    const pkg = buildAddRequest(
      input({
        codAmount: 0,
        attempt: 2,
        recipient: { ...input().recipient, company: 'Firma s.r.o.' },
      }),
    ).packages[0]
    expect(pkg.cod_price).toBeUndefined()
    expect(pkg.vs).toBeUndefined()
    expect(pkg.eid).toBe('100123-2')
    expect(pkg.real_order_id).toBe('100123')
    expect(pkg.rec_firm).toBe('Firma s.r.o.')
  })
})

describe('validation before sending (Czech messages)', () => {
  it('valid input passes', () => {
    expect(validateShipmentInput(input())).toEqual([])
  })
  it('invoice number must be a usable variable symbol for COD', () => {
    expect(validateShipmentInput(input({ invoiceNumber: null }))[0]).toMatch(/číslo faktury/)
    expect(validateShipmentInput(input({ invoiceNumber: 'FV-2026/12' }))[0]).toMatch(
      /variabilní symbol/,
    )
    expect(validateShipmentInput(input({ invoiceNumber: null, codAmount: 0 }))).toEqual([])
    expect(variableSymbol('12345678901')).toBe(null)
  })
  it('service code required only in live mode', () => {
    expect(validateShipmentInput(input({ serviceCode: '' }))[0]).toMatch(/kód služby/)
    expect(validateShipmentInput(input({ serviceCode: '' }), { simulation: true })).toEqual([])
  })
  it('recipient data', () => {
    const errors = validateShipmentInput(
      input({
        recipient: { name: '', street: '', city: '', postcode: '123', phone: '12', email: 'x' },
      }),
    )
    expect(errors.join(' ')).toMatch(/jméno.*ulice.*obec.*PSČ.*Telefon.*E-mail/s)
  })
  it('phone normalisation', () => {
    expect(normalizePhone('+420 602 123 456')).toBe('+420602123456')
    expect(normalizePhone('00420602123456')).toBe('+420602123456')
    expect(normalizePhone('602123456')).toBe('+420602123456')
    expect(normalizePhone('12345')).toBe(null)
  })
})

describe('response parsing (documented shapes)', () => {
  it('ADD success → package id, tracking number, tracking and label URL', () => {
    expect(parseAddResponse(200, addOk)).toEqual({
      ok: true,
      packageId: 'add-ppl-5704168',
      trackingNumber: '58800700001',
      trackingUrl: 'https://www.ppl.cz/vyhledat-zasilku?shipmentId=58800700001',
      labelUrl: 'https://pdf.balikobot.cz/ppl/eNozNjXQNQQCc0MDS1wwDy4CWw..',
    })
  })
  it('ADD validation errors (HTTP 400) → per-attribute messages in Czech', () => {
    const result = parseAddResponse(400, addError)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toHaveLength(2)
      expect(formatCarrierError(result.errors[1])).toBe('PSČ příjemce: Nepovolené PSČ příjemce.')
    }
  })
  it('ADD without error details → status message', () => {
    const result = parseAddResponse(200, { packages: [{ status: 409 }], status: 400 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0].message).toMatch(/Konfigurace dopravce/)
    const auth = parseAddResponse(401, null)
    expect(auth.ok).toBe(false)
    if (!auth.ok) expect(auth.errors[0].message).toMatch(/BALIKOBOT_API_USER/)
  })
  it('DROP, LABELS, ORDER', () => {
    expect(parseDropResponse(200, dropOk).ok).toBe(true)
    const dropped = parseDropResponse(200, dropAlreadyOrdered)
    expect(dropped.ok).toBe(false)
    if (!dropped.ok) expect(dropped.errors[0].message).toMatch(/předána ke svozu/)
    expect(parseLabelsResponse(200, labelsOk).ok).toBe(true)
    expect(parseLabelsResponse(200, { status: 406 }).ok).toBe(false)
    const order = parseOrderResponse(200, orderOk)
    expect(order.ok && order.data.order_id).toBe('order-ppl-439988')
    expect(parseOrderResponse(200, { status: 208 }).ok).toBe(true)
    expect(parseOrderResponse(200, { status: 406 }).ok).toBe(false)
  })
})

describe('Balíkobot client (fetch mocked – never calls the network)', () => {
  it('sends Basic auth + JSON to /{carrier}/add and parses the answer', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(addOk), { status: 200 }))
    const carrier = balikobotCarrier({
      user: 'u',
      key: 'k',
      baseUrl: 'https://apiv2.example.invalid',
      fetchImpl,
    })
    const result = await carrier.createShipment(input())
    expect(result.ok).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://apiv2.example.invalid/ppl/add')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('u:k').toString('base64')}`,
    )
    expect(JSON.parse(String(init.body)).packages[0].eid).toBe('100123')
  })

  it('invalid input is never sent', async () => {
    const fetchImpl = vi.fn()
    const carrier = balikobotCarrier({ user: 'u', key: 'k', fetchImpl })
    const result = await carrier.createShipment(input({ invoiceNumber: null }))
    expect(result.ok).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('labels are only downloaded from balikobot.cz', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ labels_url: 'https://evil.example/x.pdf', status: 200 })),
    )
    const carrier = balikobotCarrier({ user: 'u', key: 'k', fetchImpl })
    const result = await carrier.labels('ppl', [
      { packageId: 'a', page: { title: 'x', lines: [] } },
      { packageId: 'b', page: { title: 'y', lines: [] } },
    ])
    expect(result.ok).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('mode selection', () => {
  it('simulation without credentials (not production), live with them, refused in production', () => {
    expect(
      getCarrierService({ NODE_ENV: 'development' } as unknown as NodeJS.ProcessEnv).mode,
    ).toBe('simulation')
    expect(
      getCarrierService({
        BALIKOBOT_API_USER: 'u',
        BALIKOBOT_API_KEY: 'k',
      } as unknown as NodeJS.ProcessEnv).mode,
    ).toBe('live')
    expect(() =>
      getCarrierService({ NODE_ENV: 'production' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/BALIKOBOT/)
    expect(
      getCarrierService({
        NODE_ENV: 'production',
        BALIKOBOT_SIMULATION: '1',
      } as unknown as NodeJS.ProcessEnv).mode,
    ).toBe('simulation')
  })

  it('simulation returns a fake SIM tracking number and a PDF label', async () => {
    const sim = simulationCarrier()
    const result = await sim.createShipment(input({ serviceCode: '' }))
    expect(result.ok && result.trackingNumber).toMatch(/^SIM\d+/)
    expect(result.ok && result.simulated).toBe(true)
    const pdf = await sim.labels('ppl', [
      { packageId: 'x', page: { title: 'Obj. 100123', lines: ['Jana Nováková'] } },
    ])
    expect(pdf.ok && pdf.pdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4')
  })
})
