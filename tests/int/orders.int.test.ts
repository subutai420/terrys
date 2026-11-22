import { randomUUID } from 'crypto'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createFormToken } from '@/lib/orders/formToken'
import { checkCart } from '@/orders/catalog'
import { FORM_TOKEN_PURPOSE, placeOrder } from '@/orders/placeOrder'
import { submitWithdrawal } from '@/orders/withdrawal'

import { createTestImage, getTestPayload, type TestUser } from './helpers'

/**
 * Order placement (stage 4) against a real Payload + PostgreSQL (throwaway database).
 * Everything this file creates is deleted in afterAll (the files share one database).
 */

let payload: Payload
const fakeUser = (id: number, role: TestUser['role']) =>
  ({ id, role, email: `${role}@example.test`, collection: 'users' }) as unknown as TestUser
const staff = fakeUser(9102, 'staff')
const butcher = fakeUser(9103, 'butcher')

// Monday 23. 11. 2026 10:00 Prague (before the 12:00 cut-off) and 12:30 (after it).
const MONDAY_MORNING = new Date('2026-11-23T09:00:00Z')
const MONDAY_AFTER_CUTOFF = new Date('2026-11-23T11:30:00Z')
const POSTCODE = '14000'

const created: { collection: string; id: number }[] = []
let vanId: number
let pickupId: number
let ribEyeId: number
let ribEyeVariant250: string
let sauceId: number
let soldOutId: number
let hiddenId: number

type Sent = { to: string; subject: string; html: string; text: string }
let sent: Sent[] = []
let sendSpy: ReturnType<typeof vi.spyOn>

async function track<T extends { id: number }>(
  collection: string,
  promise: Promise<T>,
): Promise<T> {
  const doc = await promise
  created.push({ collection, id: doc.id })
  return doc
}

function orderInput(overrides: Record<string, unknown> = {}) {
  return {
    checkoutId: randomUUID(),
    formToken: 'not-checked-in-tests',
    lines: [
      { productId: ribEyeId, variantId: ribEyeVariant250, quantity: 2 },
      { productId: sauceId, variantId: null, quantity: 1 },
    ],
    delivery: { postcode: POSTCODE, methodId: vanId, date: '2026-11-24' },
    customer: {
      firstName: 'Jana',
      lastName: 'Testovací',
      email: 'jana@example.test',
      phone: '602 123 456',
    },
    address: { street: 'Testovací 12', city: 'Praha 4', postcode: POSTCODE },
    consents: { terms: true, newsletter: true, heurekaOptOut: true },
    attribution: { utmSource: 'google', gclid: 'abc' },
    ...overrides,
  }
}

const place = (input: unknown, now = MONDAY_MORNING) =>
  placeOrder(payload, input, { now, skipBotChecks: true })

beforeAll(async () => {
  process.env.EMAIL_OUTBOX_DIR = `.emails-int-${Date.now()}`
  payload = await getTestPayload()
  sendSpy = vi.spyOn(payload, 'sendEmail').mockImplementation(async (message) => {
    sent.push({
      to: String(message.to),
      subject: String(message.subject),
      html: String(message.html),
      text: String(message.text),
    })
    return {}
  })

  await payload.updateGlobal({
    slug: 'settings',
    data: { deliveryPrice: 229, orders: { notificationEmail: 'shop@example.test' } },
  })

  const location = await track(
    'locations',
    payload.create({
      collection: 'locations',
      data: {
        name: 'Výdej Test',
        kind: 'shop',
        isPickupPoint: true,
        address: { street: 'Italská 17', city: 'Praha 2', zip: '12000' },
      },
    }),
  )
  const common = {
    weekdays: ['tue', 'wed', 'thu', 'fri'] as ('tue' | 'wed' | 'thu' | 'fri')[],
    cutoffTime: '12:00',
    leadDays: 1,
  }
  const van = await track(
    'shipping-methods',
    payload.create({
      collection: 'shipping-methods',
      data: {
        ...common,
        name: 'Rozvoz test',
        type: 'own-delivery',
        coverage: 'zones',
        sortOrder: 900,
      },
    }),
  )
  vanId = van.id
  const pickup = await track(
    'shipping-methods',
    payload.create({
      collection: 'shipping-methods',
      data: {
        ...common,
        name: 'Odběr test',
        type: 'pickup',
        location: location.id,
        sortOrder: 901,
      },
    }),
  )
  pickupId = pickup.id
  await track(
    'delivery-zones',
    payload.create({
      collection: 'delivery-zones',
      data: { name: 'Test 140', method: vanId, postcodes: POSTCODE, active: true },
    }),
  )
  const existingPostcode = await payload.find({
    collection: 'postcodes',
    where: { code: { equals: POSTCODE } },
    limit: 1,
  })
  if (!existingPostcode.docs[0]) {
    await track(
      'postcodes',
      payload.create({ collection: 'postcodes', data: { code: POSTCODE, city: 'Praha 4' } }),
    )
  }

  const image = await track('media', createTestImage(payload, 'Objednávky test'))
  const product = (data: Record<string, unknown>) =>
    track(
      'products',
      payload.create({
        collection: 'products',
        data: { mainImage: image.id, _status: 'published', ...data } as never,
        context: { disableRevalidate: true },
      }),
    )
  const ribEye = await product({
    title: 'Test Rib Eye',
    price: 990,
    priceUnit: 'kg',
    vatRate: '12',
    availability: 'in-stock',
    variants: [
      { label: '250 g', kind: 'weight', weightGrams: 250 },
      { label: '500 g', kind: 'weight', weightGrams: 500 },
    ],
  })
  ribEyeId = ribEye.id
  ribEyeVariant250 = (ribEye as unknown as { variants: { id: string }[] }).variants[0].id
  sauceId = (
    await product({
      title: 'Test omáčka',
      price: 149,
      priceUnit: 'piece',
      vatRate: '21',
      availability: 'in-stock',
    })
  ).id
  soldOutId = (
    await product({
      title: 'Test vyprodáno',
      price: 500,
      priceUnit: 'kg',
      availability: 'sold-out',
      variants: [{ label: '300 g', kind: 'weight', weightGrams: 300 }],
    })
  ).id
  hiddenId = (
    await product({ title: 'Test skryto', price: 100, priceUnit: 'piece', availability: 'hidden' })
  ).id
})

afterAll(async () => {
  sendSpy?.mockRestore()
  if (!payload) return
  await payload.delete({
    collection: 'withdrawals',
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

describe('cart validation', () => {
  it('re-reads prices and reports sold-out, hidden and unknown products', async () => {
    const result = await checkCart(payload, [
      {
        productId: ribEyeId,
        variantId: ribEyeVariant250,
        quantity: 1,
        snapshot: { unitPrice: 890 },
      },
      { productId: soldOutId, variantId: 'x', quantity: 1 },
      { productId: hiddenId, variantId: null, quantity: 1 },
      { productId: 999999, variantId: null, quantity: 1 },
    ])
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].lineEstimate).toBe(248)
    expect(result.changes[0].message).toMatch(/890/)
    expect(result.problems.map((p) => p.code).sort()).toEqual(['gone', 'gone', 'variant-gone'])
  })
})

describe('placeOrder', () => {
  it('creates an order with server prices, snapshots, consents and both e-mails', async () => {
    sent = []
    const input = orderInput({
      lines: [
        // Tampered prices are ignored (dropped by the schema).
        {
          productId: ribEyeId,
          variantId: ribEyeVariant250,
          quantity: 2,
          unitPrice: 1,
          estimatedPrice: 1,
        },
        { productId: sauceId, variantId: null, quantity: 1, unitPrice: 1 },
      ],
      totals: { totalEstimate: 1 },
    })
    const result = await place(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.orderNumber).toMatch(/^\d{6}$/)
    expect(result.accessToken.length).toBeGreaterThan(20)

    const found = await payload.find({
      collection: 'orders',
      where: { orderNumber: { equals: result.orderNumber } },
      overrideAccess: true,
    })
    const order = found.docs[0]
    // 990 Kč/kg × 2 × 250 g = 495; sauce 149; delivery 229.
    expect(order.lines?.map((l) => l.estimatedPrice)).toEqual([495, 149])
    expect(order.totals.goodsEstimate).toBe(644)
    expect(order.totals.deliveryPrice).toBe(229)
    expect(order.totals.totalEstimate).toBe(873)
    expect(order.totals.vat?.map((row) => row.rate)).toEqual([12, 21])
    expect(order.lines?.[0]).toMatchObject({
      productTitle: 'Test Rib Eye',
      variantLabel: '250 g',
      unitPrice: 990,
      priceUnit: 'kg',
      vatRate: '12',
      estimatedWeightGrams: 250,
    })
    expect(order.delivery).toMatchObject({
      methodName: 'Rozvoz test',
      methodType: 'own-delivery',
      price: 229,
      date: '2026-11-24',
      postcode: POSTCODE,
    })
    expect(order.status).toBe('received')
    expect(order.kind).toBe('goods')
    expect(order.consents?.termsAcceptedAt).toBeTruthy()
    expect(order.consents?.newsletter).toBe(true)
    expect(order.consents?.heurekaOptOut).toBe(true)
    expect(order.attribution?.gclid).toBe('abc')
    expect(order.eventId).toMatch(/[0-9a-f-]{36}/)
    expect(order.shippingAddress?.checkStatus).toBe('skipped')
    expect(order.emails?.customerStatus).toBe('outbox')
    expect(order.emails?.shopStatus).toBe('outbox')

    expect(sent.map((m) => m.to).sort()).toEqual(['jana@example.test', 'shop@example.test'])
    const customerMail = sent.find((m) => m.to === 'jana@example.test') as Sent
    expect(customerMail.subject).toContain(result.orderNumber)
    expect(customerMail.text).toContain('Těší se na vás řezníci z Terrysu')
    expect(customerMail.text).toContain('±15 %')
    expect(customerMail.html).toContain('Test Rib Eye')
  })

  it('pickup needs no address and costs nothing', async () => {
    const result = await place(
      orderInput({
        delivery: { postcode: POSTCODE, methodId: pickupId, date: '2026-11-24' },
        address: undefined,
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const order = (
      await payload.find({
        collection: 'orders',
        where: { orderNumber: { equals: result.orderNumber } },
        overrideAccess: true,
      })
    ).docs[0]
    expect(order.totals.deliveryPrice).toBe(0)
    expect(order.delivery?.pickupLocation?.name).toBe('Výdej Test')
  })

  it('rejects sold-out and hidden items', async () => {
    const soldOut = await place(
      orderInput({ lines: [{ productId: soldOutId, variantId: 'x', quantity: 1 }] }),
    )
    expect(soldOut).toMatchObject({ ok: false, status: 409, error: 'cart-changed' })
    const hidden = await place(
      orderInput({ lines: [{ productId: hiddenId, variantId: null, quantity: 1 }] }),
    )
    expect(hidden).toMatchObject({ ok: false, error: 'cart-changed' })
  })

  it('rejects a date whose cut-off has passed and returns fresh options', async () => {
    const result = await place(orderInput(), MONDAY_AFTER_CUTOFF)
    expect(result).toMatchObject({ ok: false, status: 409, error: 'delivery-unavailable' })
    if (result.ok) return
    expect(result.message).toMatch(/uzávěrka/)
    const van = result.delivery?.methods.find((m) => m.id === vanId)
    expect(van?.dates[0]).toBe('2026-11-25')
  })

  it('asks again when the estimate the customer saw differs', async () => {
    const result = await place(orderInput({ expectedTotal: 100 }))
    expect(result).toMatchObject({ ok: false, error: 'prices-changed', totalEstimate: 873 })
  })

  it('validates input with Czech messages and requires an address for delivery', async () => {
    const result = await place(
      orderInput({
        address: undefined,
        customer: { firstName: '', lastName: 'X', email: 'x', phone: '1' },
      }),
    )
    expect(result).toMatchObject({ ok: false, status: 422, error: 'invalid-input' })
    if (result.ok) return
    expect(result.fieldErrors?.['customer.email']).toBeTruthy()
    const noAddress = await place(orderInput({ address: undefined }))
    expect(noAddress.ok).toBe(false)
    if (!noAddress.ok) expect(noAddress.fieldErrors?.['address.street']).toBeTruthy()
  })

  it('is idempotent: a repeated or parallel submit returns the same order', async () => {
    const input = orderInput()
    const results = await Promise.all([place(input), place(input), place(input)])
    const numbers = new Set(results.map((r) => (r.ok ? r.orderNumber : 'error')))
    expect(numbers.size).toBe(1)
    expect([...numbers][0]).not.toBe('error')
    const again = await place(input)
    expect(again).toMatchObject({ ok: true, duplicate: true, orderNumber: [...numbers][0] })
    const count = await payload.count({
      collection: 'orders',
      where: { orderNumber: { equals: [...numbers][0] } },
      overrideAccess: true,
    })
    expect(count.totalDocs).toBe(1)
  })

  it('hands out unique order numbers under concurrency', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => place(orderInput())))
    const numbers = results.map((r) => (r.ok ? r.orderNumber : 'error'))
    expect(numbers).not.toContain('error')
    expect(new Set(numbers).size).toBe(8)
  })

  it('keeps the order and records the failure when the customer e-mail fails', async () => {
    sendSpy.mockImplementationOnce(async () => {
      throw new Error('Resend is down')
    })
    const result = await place(orderInput())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const order = (
      await payload.find({
        collection: 'orders',
        where: { orderNumber: { equals: result.orderNumber } },
        overrideAccess: true,
      })
    ).docs[0]
    expect(order.emails?.customerStatus).toBe('failed')
    expect(order.emails?.customerError).toContain('Resend is down')
    expect(order.emails?.shopStatus).toBe('outbox')
  })

  it('runs the bot checks when not skipped (honeypot, timing token)', async () => {
    const honeypot = await placeOrder(payload, orderInput({ website: 'spam' }), {
      now: MONDAY_MORNING,
    })
    expect(honeypot).toMatchObject({ ok: false, error: 'bot' })
    const tooFast = await placeOrder(
      payload,
      orderInput({
        formToken: createFormToken(payload.secret, FORM_TOKEN_PURPOSE, MONDAY_MORNING.getTime()),
      }),
      { now: MONDAY_MORNING },
    )
    expect(tooFast).toMatchObject({ ok: false, error: 'bot' })
    const ok = await placeOrder(
      payload,
      orderInput({
        formToken: createFormToken(
          payload.secret,
          FORM_TOKEN_PURPOSE,
          MONDAY_MORNING.getTime() - 60_000,
        ),
      }),
      { now: MONDAY_MORNING },
    )
    expect(ok.ok).toBe(true)
  })
})

describe('access to orders', () => {
  it('anonymous visitors cannot read or create orders', async () => {
    await expect(
      payload.find({ collection: 'orders', overrideAccess: false }),
    ).rejects.toMatchObject({
      status: 403,
    })
    await expect(
      payload.create({
        collection: 'orders',
        overrideAccess: false,
        data: { orderNumber: 'X' } as never,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('butcher reads, staff edits the status, tokens are never exposed', async () => {
    const list = await payload.find({
      collection: 'orders',
      user: butcher,
      overrideAccess: false,
      limit: 1,
    })
    expect(list.docs.length).toBe(1)
    expect(list.docs[0]).not.toHaveProperty('accessToken')
    expect(list.docs[0]).not.toHaveProperty('idempotencyKey')
    await expect(
      payload.update({
        collection: 'orders',
        id: list.docs[0].id,
        data: { status: 'weighed' },
        user: butcher,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    const updated = await payload.update({
      collection: 'orders',
      id: list.docs[0].id,
      data: { status: 'weighed', internalNote: 'Zavolat před dovozem' },
      user: staff,
      overrideAccess: false,
    })
    expect(updated.status).toBe('weighed')
  })
})

describe('withdrawal', () => {
  it('records the withdrawal on the order and confirms it by e-mail', async () => {
    sent = []
    const order = (
      await payload.find({
        collection: 'orders',
        overrideAccess: true,
        limit: 1,
        sort: 'createdAt',
      })
    ).docs[0]
    const result = await submitWithdrawal(
      payload,
      {
        name: 'Jana Testovací',
        email: 'JANA@example.test',
        orderNumber: order.orderNumber,
        items: 'Test omáčka',
        formToken: 'x',
      },
      { skipBotChecks: true, now: new Date('2026-11-25T10:00:00Z') },
    )
    expect(result.ok).toBe(true)
    const records = await payload.find({
      collection: 'withdrawals',
      where: { order: { equals: order.id } },
      overrideAccess: true,
    })
    expect(records.docs).toHaveLength(1)
    expect(records.docs[0].confirmationStatus).toBe('outbox')
    const confirmation = sent.find((m) => m.to === 'jana@example.test') as Sent
    expect(confirmation.text).toContain(order.orderNumber)
    expect(confirmation.text).toContain('Test omáčka')
    expect(confirmation.text).toMatch(/25\. listopadu 2026/)
  })

  it('records an unmatched withdrawal too and never requires a reason', async () => {
    const result = await submitWithdrawal(
      payload,
      { name: 'Někdo', email: 'nekdo@example.test', orderNumber: '1', formToken: 'x' },
      { skipBotChecks: true },
    )
    expect(result.ok).toBe(true)
    const missingEmail = await submitWithdrawal(
      payload,
      { name: 'X', orderNumber: '1', formToken: 'x' },
      { skipBotChecks: true },
    )
    expect(missingEmail).toMatchObject({ ok: false, status: 422 })
  })
})
