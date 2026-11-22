import { randomBytes, randomUUID } from 'crypto'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  cancelShipment,
  changeStatus,
  closeBatchForDay,
  createShipment,
  findInvoiceDuplicate,
  resendEmail,
  saveBilling,
  weighOrder,
} from '@/fulfilment/service'
import { computeTotals } from '@/lib/orders/money'
import type { Order } from '@/payload-types'
import { balikobotCarrier } from '@/shipping/carrier'
import { createLegacyVoucher } from '@/vouchers/service'
import addError from '@/lib/shipping/fixtures/add-error.json'

import { createUser, getTestPayload, type TestUser } from './helpers'

/**
 * Stage 5 fulfilment against a real Payload + PostgreSQL (throwaway database): access per role,
 * weighing, audit trail, billing (vouchers, invoice number), status guard, e-mail-once, shipments
 * in simulation mode and a Balíkobot validation error with a mocked HTTP client.
 */

let payload: Payload
let admin: TestUser
let staff: TestUser
let butcher: TestUser
let van: number
let courier: number
let pickup: number
let product: number
const DATE = '2026-11-25'
const created: {
  collection: 'orders' | 'shipping-methods' | 'locations' | 'products' | 'media'
  id: number
}[] = []

type Sent = { to: string; subject: string }
const sent: Sent[] = []

async function makeOrder(methodId: number, over: Partial<Order> = {}): Promise<Order> {
  const method = await payload.findByID({ collection: 'shipping-methods', id: methodId, depth: 0 })
  const lines = [
    {
      product,
      productTitle: 'Test Rib Eye',
      variantLabel: '250 g',
      quantity: 2,
      unitPrice: 990,
      priceUnit: 'kg' as const,
      vatRate: '12' as const,
      estimatedWeightGrams: 250,
      estimatedPrice: 495,
    },
    {
      productTitle: 'Test omáčka',
      quantity: 1,
      unitPrice: 149,
      priceUnit: 'piece' as const,
      vatRate: '21' as const,
      estimatedWeightGrams: null,
      estimatedPrice: 149,
    },
  ]
  const deliveryPrice = method.type === 'pickup' ? 0 : 229
  const totals = computeTotals(
    lines.map((l) => ({
      unitPrice: l.unitPrice,
      priceUnit: l.priceUnit,
      weightGrams: l.estimatedWeightGrams,
      quantity: l.quantity,
      vatRate: l.vatRate,
    })),
    deliveryPrice,
  )
  const key = randomUUID()
  const order = await payload.create({
    collection: 'orders',
    overrideAccess: true,
    depth: 0,
    context: { disableRevalidate: true },
    data: {
      orderNumber: `T${Date.now()}${Math.floor(Math.random() * 1000)}`,
      status: 'received',
      kind: 'goods',
      customerName: 'Jana Testovací',
      contactEmail: 'jana@example.test',
      contactPhone: '602 123 456',
      scheduledDate: DATE,
      shippingLabel: method.name,
      totalEstimate: totals.totalEstimate,
      lines,
      totals: { ...totals },
      customer: {
        firstName: 'Jana',
        lastName: 'Testovací',
        email: 'jana@example.test',
        phone: '602 123 456',
      },
      shippingAddress:
        method.type === 'pickup'
          ? {}
          : { street: 'Masarykova 12', city: 'Brno', postcode: '60200' },
      delivery: {
        method: method.id,
        methodName: method.name,
        methodType: method.type,
        price: deliveryPrice,
        date: DATE,
        postcode: '60200',
        pickupLocation:
          method.type === 'pickup'
            ? { name: 'Výdej Test', street: 'Italská 17', city: 'Praha 2', zip: '12000' }
            : {},
      },
      consents: { termsAcceptedAt: new Date().toISOString() },
      accessToken: randomBytes(16).toString('hex'),
      idempotencyKey: key,
      ...over,
    } as never,
  })
  created.push({ collection: 'orders', id: order.id })
  return order
}

const lineIds = (order: Order) => (order.lines ?? []).map((l) => l.id!)
const emailsFor = (subjectPart: string) => sent.filter((m) => m.subject.includes(subjectPart))

beforeAll(async () => {
  process.env.EMAIL_OUTBOX_DIR = `.emails-int-${Date.now()}`
  payload = await getTestPayload()
  vi.spyOn(payload, 'sendEmail').mockImplementation(async (message) => {
    sent.push({ to: String(message.to), subject: String(message.subject) })
    return {}
  })
  await payload.updateGlobal({
    slug: 'settings',
    data: {
      deliveryPrice: 229,
      orders: { weightTolerancePercent: 15, packagingWeightGrams: 1000 },
    },
  })
  const stamp = Date.now()
  admin = await createUser(payload, 'admin', `admin-f${stamp}@example.test`)
  staff = await createUser(payload, 'staff', `staff-f${stamp}@example.test`)
  butcher = await createUser(payload, 'butcher', `butcher-f${stamp}@example.test`)
  const location = await payload.create({
    collection: 'locations',
    data: {
      name: 'Výdej F',
      kind: 'shop',
      isPickupPoint: true,
      address: { street: 'Italská 17', city: 'Praha 2', zip: '12000' },
      openingHours: { monday: '9–18' },
    },
  })
  created.push({ collection: 'locations', id: location.id })
  const common = {
    weekdays: ['tue', 'wed', 'thu', 'fri'] as ('tue' | 'wed' | 'thu' | 'fri')[],
    cutoffTime: '12:00',
    leadDays: 1,
  }
  const m = async (data: Record<string, unknown>) => {
    const doc = await payload.create({
      collection: 'shipping-methods',
      data: { ...common, ...data } as never,
    })
    created.push({ collection: 'shipping-methods', id: doc.id })
    return doc.id
  }
  van = await m({ name: 'Rozvoz F', type: 'own-delivery', coverage: 'zones', sortOrder: 950 })
  courier = await m({
    name: 'Kurýr F',
    type: 'courier',
    coverage: 'fallback',
    balikobot: { carrierCode: 'ppl', serviceCode: '4' },
    sortOrder: 951,
  })
  pickup = await m({ name: 'Odběr F', type: 'pickup', location: location.id, sortOrder: 952 })
  const productDoc = await payload.create({
    collection: 'products',
    data: {
      title: 'Test Rib Eye F',
      price: 990,
      priceUnit: 'kg',
      vatRate: '12',
      availability: 'hidden',
    } as never,
    draft: true,
    context: { disableRevalidate: true },
  })
  product = productDoc.id
  created.push({ collection: 'products', id: product })
})

afterAll(async () => {
  await payload.delete({
    collection: 'order-audit-log',
    where: { orderNumber: { like: 'T' } },
    overrideAccess: true,
  })
  for (const item of created.reverse()) {
    await payload
      .delete({ collection: item.collection, id: item.id, overrideAccess: true })
      .catch(() => undefined)
  }
  for (const user of [admin, staff, butcher])
    await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
  vi.restoreAllMocks()
})

describe('access per role', () => {
  it('anonymous: nothing; butcher: read only through the API; staff: may update', async () => {
    const order = await makeOrder(van)
    await expect(payload.find({ collection: 'orders', overrideAccess: false })).rejects.toThrow()
    const read = await payload.findByID({
      collection: 'orders',
      id: order.id,
      overrideAccess: false,
      user: butcher,
    })
    expect(read.orderNumber).toBe(order.orderNumber)
    // The butcher can neither change prices nor customer data through the API…
    await expect(
      payload.update({
        collection: 'orders',
        id: order.id,
        overrideAccess: false,
        user: butcher,
        data: { totals: { ...order.totals, goodsFinal: 1 } },
      }),
    ).rejects.toThrow()
    await expect(
      payload.update({
        collection: 'orders',
        id: order.id,
        overrideAccess: false,
        user: butcher,
        data: { customerName: 'X' },
      }),
    ).rejects.toThrow()
    await expect(
      payload.delete({ collection: 'orders', id: order.id, overrideAccess: false, user: butcher }),
    ).rejects.toThrow()
    // …nor through the fulfilment services beyond weighing.
    expect((await saveBilling(payload, butcher, order.id, { invoiceNumber: '1' })).ok).toBe(false)
    expect((await createShipment(payload, butcher, order.id)).ok).toBe(false)
    expect((await resendEmail(payload, butcher, order.id, 'final-price')).ok).toBe(false)
    // Audit log: staff read it, the butcher does not, nobody deletes it.
    await expect(
      payload.find({ collection: 'order-audit-log', overrideAccess: false, user: butcher }),
    ).rejects.toThrow()
    await payload.find({ collection: 'order-audit-log', overrideAccess: false, user: staff })
  })

  it('status changes through the API are guarded too', async () => {
    const order = await makeOrder(van)
    await expect(
      payload.update({
        collection: 'orders',
        id: order.id,
        overrideAccess: false,
        user: staff,
        data: { status: 'shipped' },
      }),
    ).rejects.toThrow(/nelze přejít/)
  })
})

describe('weighing (butcher)', () => {
  it('partial save, live price from the weight, completion, audit trail', async () => {
    const order = await makeOrder(van)
    const [steak, sauce] = lineIds(order)
    const partial = await weighOrder(payload, butcher, order.id, {
      lines: [{ id: steak, actualWeightGrams: 520, finalPrice: 1 } as never],
    })
    expect(partial.ok).toBe(true)
    if (!partial.ok) return
    expect(partial.order.status).toBe('received')
    expect(partial.order.lines?.[0].finalPrice).toBe(515) // 990 × 0.52 = 514.8 → 515, not the 1 sent
    // The piece-priced sauce needs no weighing: resolved automatically, so the totals exist.
    expect(partial.order.lines?.[1].resolution).toBe('piece')
    expect(partial.order.lines?.[1].finalPrice).toBe(149)
    expect(partial.order.totals.goodsFinal).toBe(515 + 149)

    const done = await weighOrder(payload, butcher, order.id, {
      lines: [{ id: sauce }],
      markWeighed: true,
    })
    expect(done.ok).toBe(true)
    if (!done.ok) return
    expect(done.order.status).toBe('weighed')
    expect(done.order.lines?.[1].resolution).toBe('piece')
    expect(done.order.totals.goodsFinal).toBe(515 + 149)
    expect(done.order.totals.totalFinal).toBe(515 + 149 + 229)
    expect(done.order.amountDue).toBe(893)
    expect(done.order.fulfilment?.weighedBy).toBe(butcher.id)

    // Butcher cannot touch it any more once weighed.
    expect(
      (
        await weighOrder(payload, butcher, order.id, {
          lines: [{ id: steak, actualWeightGrams: 600 }],
        })
      ).ok,
    ).toBe(false)

    const audit = await payload.find({
      collection: 'order-audit-log',
      where: { order: { equals: order.id } },
      limit: 50,
    })
    const weight = audit.docs.find((d) => d.field.includes('hmotnost'))
    expect(weight).toMatchObject({ oldValue: '–', newValue: '520', userEmail: butcher.email })
    expect(
      audit.docs.some(
        (d) => d.field === 'Stav' && d.oldValue === 'Přijato' && d.newValue === 'Zváženo',
      ),
    ).toBe(true)
    // Nobody can delete the trail through the API, not even an admin.
    await expect(
      payload.delete({
        collection: 'order-audit-log',
        id: audit.docs[0].id,
        overrideAccess: false,
        user: admin,
      }),
    ).rejects.toThrow()
  })

  it('unresolved order cannot be marked weighed', async () => {
    const order = await makeOrder(van)
    const result = await weighOrder(payload, butcher, order.id, { lines: [], markWeighed: true })
    expect(result.ok).toBe(false)
  })

  it('over tolerance needs a note (not blocking), flags the order for staff', async () => {
    const order = await makeOrder(van)
    const [steak, sauce] = lineIds(order)
    const noNote = await weighOrder(payload, butcher, order.id, {
      lines: [{ id: steak, actualWeightGrams: 650 }, { id: sauce }],
      markWeighed: true,
    })
    expect(noNote.ok).toBe(false)
    const withNote = await weighOrder(payload, butcher, order.id, {
      lines: [{ id: steak, actualWeightGrams: 650, toleranceNote: 'Celý kus' }, { id: sauce }],
      markWeighed: true,
    })
    expect(withNote.ok).toBe(true)
    if (!withNote.ok) return
    expect(withNote.order.lines?.[0].overTolerance).toBe(true)
    expect(withNote.order.needsReview).toBe(true)
    expect(withNote.order.reviewReasons).toContain('+30 %')
  })

  it('unavailable and substituted lines', async () => {
    const order = await makeOrder(van)
    const [steak, sauce] = lineIds(order)
    const noReplacementNote = await weighOrder(payload, butcher, order.id, {
      lines: [
        { id: steak, actualWeightGrams: 500, resolution: 'substituted' },
        { id: sauce, resolution: 'unavailable' },
      ],
      markWeighed: true,
    })
    expect(noReplacementNote.ok).toBe(false)
    const ok = await weighOrder(payload, butcher, order.id, {
      lines: [
        {
          id: steak,
          actualWeightGrams: 500,
          resolution: 'substituted',
          weighNote: 'Argentinský místo australského',
        },
        { id: sauce, resolution: 'unavailable' },
      ],
      markWeighed: true,
    })
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    expect(ok.order.lines?.[1].finalPrice).toBe(0)
    expect(ok.order.totals.goodsFinal).toBe(495)
    expect(ok.order.needsReview).toBe(true)
  })
})

async function weighed(methodId: number) {
  const order = await makeOrder(methodId)
  const [steak, sauce] = lineIds(order)
  const result = await weighOrder(payload, butcher, order.id, {
    lines: [{ id: steak, actualWeightGrams: 510 }, { id: sauce }],
    markWeighed: true,
  })
  if (!result.ok) throw new Error(result.message)
  return result.order
}

describe('billing (staff)', () => {
  it('voucher payment with cap, finalise sends the final-price e-mail exactly once, resend on request', async () => {
    const order = await weighed(van)
    const total = order.totals.totalFinal!
    const tooMuch = await saveBilling(payload, staff, order.id, {
      vouchers: [{ code: 'DAR-1', amount: total + 1 }],
    })
    expect(tooMuch.ok).toBe(false)
    if (!tooMuch.ok) expect(tooMuch.fieldErrors?.vouchers).toMatch(/víc než cena/)

    // Stage 7: a voucher must exist in the records (here an old-shop voucher entered by staff).
    const unknown = await saveBilling(payload, staff, order.id, {
      vouchers: [{ code: 'DAR-1', amount: 500 }],
    })
    expect(unknown.ok).toBe(false)
    const legacy = await createLegacyVoucher(payload, staff, {
      code: 'DAR-1',
      value: 5000,
      expiresOn: '2030-12-31',
    })
    expect(legacy.ok).toBe(true)

    const saved = await saveBilling(payload, staff, order.id, {
      vouchers: [{ code: 'DAR-1', amount: 500, note: 'ověřila Blanka' }],
      invoiceNumber: '2026000101',
      finalise: true,
    })
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    expect(saved.order.totals.totalFinal).toBe(total) // a voucher is not a discount
    expect(saved.order.totals.voucherTotal).toBe(500)
    expect(saved.order.amountDue).toBe(total - 500)
    expect(saved.order.voucherRedemptions?.[0]).toMatchObject({
      code: 'DAR-1',
      amount: 500,
      recordedBy: staff.id,
    })
    expect(emailsFor(order.orderNumber).filter((m) => m.subject.includes('zvážená'))).toHaveLength(
      1,
    )

    // Confirming again does not send it twice…
    const again = await saveBilling(payload, staff, order.id, { finalise: true })
    expect(again.ok).toBe(true)
    expect(emailsFor(order.orderNumber).filter((m) => m.subject.includes('zvážená'))).toHaveLength(
      1,
    )
    // …the explicit resend does, and every attempt is recorded on the order.
    const resent = await resendEmail(payload, staff, order.id, 'final-price')
    expect(resent.ok).toBe(true)
    expect(emailsFor(order.orderNumber).filter((m) => m.subject.includes('zvážená'))).toHaveLength(
      2,
    )
    if (resent.ok)
      expect(resent.order.sentEmails?.filter((e) => e.kind === 'final-price')).toHaveLength(2)

    const audit = await payload.find({
      collection: 'order-audit-log',
      where: { order: { equals: order.id } },
      limit: 50,
    })
    expect(
      audit.docs.some(
        (d) =>
          d.field === 'Poukazy' &&
          (d.newValue ?? '').includes('DAR-1') &&
          d.userEmail === staff.email,
      ),
    ).toBe(true)
    expect(audit.docs.some((d) => d.field === 'Číslo faktury' && d.newValue === '2026000101')).toBe(
      true,
    )
  })

  it('invoice numbers are unique (case-insensitive, trimmed)', async () => {
    const first = await weighed(van)
    const second = await weighed(van)
    expect((await saveBilling(payload, staff, first.id, { invoiceNumber: 'FV-77' })).ok).toBe(true)
    const duplicate = await saveBilling(payload, staff, second.id, { invoiceNumber: ' fv-77 ' })
    expect(duplicate.ok).toBe(false)
    if (!duplicate.ok) expect(duplicate.fieldErrors?.invoiceNumber).toContain(first.orderNumber)
    expect(await findInvoiceDuplicate(payload, 'fv-77', second.id)).toMatchObject({
      orderNumber: first.orderNumber,
    })
    expect(await findInvoiceDuplicate(payload, 'FV-77', first.id)).toBe(null)
  })

  it('weights changed after confirming cancel the confirmation', async () => {
    const order = await weighed(van)
    await saveBilling(payload, staff, order.id, { finalise: true })
    const [steak, sauce] = lineIds(order)
    const changed = await weighOrder(payload, staff, order.id, {
      lines: [{ id: steak, actualWeightGrams: 540 }, { id: sauce }],
    })
    expect(changed.ok).toBe(true)
    if (!changed.ok) return
    expect(changed.order.fulfilment?.finalisedAt).toBeFalsy()
    expect(changed.messages.join(' ')).toMatch(/znovu potvrdit/)
  })
})

describe('status flow and e-mails', () => {
  it('own van: shipped only after confirming, "driver on the way" e-mail once', async () => {
    const order = await weighed(van)
    expect((await changeStatus(payload, staff, order.id, { to: 'shipped' })).ok).toBe(false)
    await saveBilling(payload, staff, order.id, { finalise: true })
    const shipped = await changeStatus(payload, staff, order.id, { to: 'shipped' })
    expect(shipped.ok).toBe(true)
    expect(emailsFor(order.orderNumber).filter((m) => m.subject.includes('řidič'))).toHaveLength(1)
    const delivered = await changeStatus(payload, staff, order.id, { to: 'delivered' })
    expect(delivered.ok).toBe(true)
    if (delivered.ok)
      expect(delivered.order.statusHistory?.map((h) => h.status)).toEqual([
        'weighed',
        'shipped',
        'delivered',
      ])
    expect(
      (await changeStatus(payload, staff, order.id, { to: 'cancelled', reason: 'x' })).ok,
    ).toBe(false)
  })

  it('pickup: ready-for-pickup e-mail with the place; cancellation needs a reason and e-mails it', async () => {
    const order = await weighed(pickup)
    await saveBilling(payload, staff, order.id, { finalise: true })
    expect((await changeStatus(payload, staff, order.id, { to: 'shipped' })).ok).toBe(false)
    expect((await changeStatus(payload, staff, order.id, { to: 'ready-for-pickup' })).ok).toBe(true)
    expect(
      emailsFor(order.orderNumber).filter((m) => m.subject.includes('vyzvednutí')),
    ).toHaveLength(1)

    const other = await makeOrder(pickup)
    expect((await changeStatus(payload, staff, other.id, { to: 'cancelled' })).ok).toBe(false)
    const cancelled = await changeStatus(payload, staff, other.id, {
      to: 'cancelled',
      reason: 'Zákazník zrušil telefonem',
    })
    expect(cancelled.ok).toBe(true)
    if (cancelled.ok)
      expect(cancelled.order.cancellation).toMatchObject({
        reason: 'Zákazník zrušil telefonem',
        cancelledBy: staff.id,
      })
    expect(emailsFor(other.orderNumber).filter((m) => m.subject.includes('zrušená'))).toHaveLength(
      1,
    )
  })
})

describe('courier shipments (simulation – no network)', () => {
  it('create → hand over (batch) → shipped e-mail with tracking; guards on the way', async () => {
    const order = await weighed(courier)
    expect((await createShipment(payload, staff, order.id)).ok).toBe(false) // not confirmed yet
    await saveBilling(payload, staff, order.id, { invoiceNumber: '2026000999', finalise: true })
    const created = await createShipment(payload, staff, order.id)
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.order.trackingNumber).toMatch(/^SIM/)
    expect(created.order.shipment).toMatchObject({
      provider: 'simulation',
      carrierCode: 'ppl',
      attempt: 1,
    })
    expect((await createShipment(payload, staff, order.id)).ok).toBe(false) // only one parcel
    // The parcel carries the COD amount: billing changes are refused while it exists.
    const change = await saveBilling(payload, staff, order.id, {
      vouchers: [{ code: 'X', amount: 100 }],
    })
    expect(change.ok).toBe(false)

    // Drop and create again → new attempt (Balíkobot needs a new eid).
    expect((await cancelShipment(payload, staff, order.id)).ok).toBe(true)
    const again = await createShipment(payload, staff, order.id)
    expect(again.ok && again.order.shipment?.attempt).toBe(2)

    const batch = await closeBatchForDay(payload, staff, DATE)
    expect(batch.ok).toBe(true)
    if (batch.ok) expect(batch.done).toContain(order.orderNumber)
    const after = await payload.findByID({ collection: 'orders', id: order.id, depth: 0 })
    expect(after.status).toBe('shipped')
    expect(after.shipment?.handedOverAt).toBeTruthy()
    expect(
      emailsFor(order.orderNumber).filter((m) => m.subject.includes('sledování')),
    ).toHaveLength(1)
    expect((await cancelShipment(payload, staff, order.id)).ok).toBe(false) // already handed over
  })

  it('live mode: invalid input never leaves, Balíkobot errors are stored in Czech', async () => {
    const order = await weighed(courier)
    await saveBilling(payload, staff, order.id, { invoiceNumber: 'FA/2026/1', finalise: true })
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(addError), { status: 400 }))
    const carrier = balikobotCarrier({
      user: 'u',
      key: 'k',
      baseUrl: 'https://apiv2.example.invalid',
      fetchImpl,
    })
    const invalid = await createShipment(payload, staff, order.id, { carrier })
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.details?.join(' ')).toMatch(/variabilní symbol/)
    expect(fetchImpl).not.toHaveBeenCalled()

    const other = await weighed(courier)
    await saveBilling(payload, staff, other.id, { invoiceNumber: '2026000555', finalise: true })
    const rejected = await createShipment(payload, staff, other.id, { carrier })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(rejected.ok).toBe(false)
    const stored = await payload.findByID({ collection: 'orders', id: other.id, depth: 0 })
    expect(stored.shipment?.lastError).toContain('Nepovolené PSČ příjemce')
    expect(stored.trackingNumber).toBeFalsy()
  })
})
