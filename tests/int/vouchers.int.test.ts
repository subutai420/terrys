import { randomBytes, randomUUID } from 'crypto'
import jsQR from 'jsqr'
import type { Payload } from 'payload'
import { PNG } from 'pngjs'
import { extractText, getDocumentProxy } from 'unpdf'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { saveBilling, weighOrder } from '@/fulfilment/service'
import { normalizeVoucherCode } from '@/lib/vouchers/code'
import { placeOrder } from '@/orders/placeOrder'
import type { Order, Voucher } from '@/payload-types'
import { orderSpayd, orderVouchers } from '@/vouchers/emails'
import { issueVouchers, voucherSpecsForOrder } from '@/vouchers/issue'
import {
  activatePrintedVouchers,
  createLegacyVoucher,
  issuePrintedVouchers,
  markVoucherOrderPaid,
  processOverdueVoucherOrders,
  undoVoucherOrderPaid,
} from '@/vouchers/service'

import { createTestImage, createUser, getTestPayload, type TestUser } from './helpers'

/**
 * Stage 7 vouchers against Payload + PostgreSQL (throwaway database): issuing on order placement
 * (PDF + QR e-mail), refusals (no batch, no account, mixed cart), code uniqueness under
 * concurrency, payment marking + e-mail once, undo, redemption validation with atomic balance
 * updates (also two parallel billings), expiry, legacy vouchers, access rules, overdue handling,
 * printed vouchers.
 */

const TEST_IBAN = 'CZ9106000000000000000123' // QR Platba spec example account – not real

let payload: Payload
let admin: TestUser
let staff: TestUser
let butcher: TestUser
let voucher1000: number
let voucher2000: number
let sauce: number
let batchId: number
const created: { collection: string; id: number }[] = []

type Sent = {
  to: string
  subject: string
  html: string
  attachments: { filename: string; content: Buffer; cid?: string; contentType?: string }[]
}
let sent: Sent[] = []

const track = <T extends { id: number }>(collection: string, doc: T): T => {
  created.push({ collection, id: doc.id })
  return doc
}

const voucherInput = (overrides: Record<string, unknown> = {}) => ({
  checkoutId: randomUUID(),
  formToken: 'x',
  lines: [{ productId: voucher1000, variantId: 'electronic', quantity: 2 }],
  customer: {
    firstName: 'Petra',
    lastName: 'Dárková',
    email: 'petra@example.test',
    phone: '602 111 222',
    companyName: 'Firma s.r.o.',
    ico: '12345679',
  },
  voucherDetails: { recipientName: 'Jan Novák', message: 'Všechno nejlepší!' },
  consents: { terms: true, newsletter: false, heurekaOptOut: false },
  ...overrides,
})

const place = (input: unknown, now = new Date()) =>
  placeOrder(payload, input, { now, skipBotChecks: true, integrations: 'none' })

async function orderByNumber(orderNumber: string): Promise<Order> {
  const found = await payload.find({
    collection: 'orders',
    where: { orderNumber: { equals: orderNumber } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return track('orders', found.docs[0] as Order)
}

async function setVoucherSettings(bankAccount: string | null) {
  const settings = await payload.findGlobal({ slug: 'settings' })
  await payload.updateGlobal({
    slug: 'settings',
    data: {
      vouchers: {
        ...settings.vouchers,
        bankAccount,
        paymentDueHours: 72,
        overdueAction: 'flag-remind',
        autoCancelAfterDays: 14,
      },
    },
    context: { disableRevalidate: true },
  })
}

async function pdfText(buffer: Buffer): Promise<string> {
  // Some package loaded with Payload adds an enumerable `Array.prototype.random`; PDF.js refuses
  // to run with it. Hide it for the extraction only (test helper, production never parses PDFs).
  const proto = Array.prototype as unknown as Record<string, unknown>
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'random')
  if (descriptor) delete proto.random
  try {
    const doc = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(doc, { mergePages: true })
    return String(text).replace(/\s+/g, ' ')
  } finally {
    if (descriptor) Object.defineProperty(proto, 'random', descriptor)
  }
}

function decodeQr(png: Buffer): string | null {
  const image = PNG.sync.read(png)
  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data ?? null
}

/** A goods order (pieces only, already "weighed") to redeem vouchers on. */
async function goodsOrder(total = 3000, createdAt?: string): Promise<Order> {
  const order = await payload.create({
    collection: 'orders',
    overrideAccess: true,
    depth: 0,
    context: { disableRevalidate: true },
    data: {
      orderNumber: `V${Date.now()}${Math.floor(Math.random() * 10000)}`,
      status: 'received',
      kind: 'goods',
      customerName: 'Karel Masový',
      contactEmail: 'karel@example.test',
      contactPhone: '602 333 444',
      scheduledDate: '2026-12-01',
      shippingLabel: 'Osobní odběr',
      totalEstimate: total,
      lines: [
        {
          product: sauce,
          productTitle: 'Test balíček',
          quantity: 1,
          unitPrice: total,
          priceUnit: 'piece',
          vatRate: '12',
          estimatedPrice: total,
        },
      ],
      totals: {
        goodsEstimate: total,
        deliveryPrice: 0,
        totalEstimate: total,
        vat: [{ rate: 12, base: 0, vat: 0, gross: total }],
      },
      customer: {
        firstName: 'Karel',
        lastName: 'Masový',
        email: 'karel@example.test',
        phone: '602 333 444',
      },
      delivery: { methodType: 'pickup', methodName: 'Osobní odběr', price: 0, date: '2026-12-01' },
      consents: { termsAcceptedAt: new Date().toISOString() },
      accessToken: randomBytes(16).toString('hex'),
      idempotencyKey: randomUUID(),
      ...(createdAt ? { createdAt } : {}),
    } as never,
  })
  track('orders', order)
  const weighed = await weighOrder(payload, staff, order.id, { lines: [], markWeighed: true })
  expect(weighed.ok).toBe(true)
  return weighed.ok ? weighed.order : order
}

async function paidVoucher(value = 2000, expiresOn?: string): Promise<Voucher> {
  const result = await createLegacyVoucher(payload, staff, {
    code: `TEST-${randomBytes(4).toString('hex')}`,
    value,
    expiresOn: expiresOn ?? '2030-12-31',
  })
  if (!result.ok) throw new Error(result.message)
  return track(
    'vouchers',
    await payload.findByID({ collection: 'vouchers', id: result.voucher.id, overrideAccess: true }),
  )
}

const freshVoucher = (id: number) =>
  payload.findByID({ collection: 'vouchers', id, depth: 0, overrideAccess: true })

beforeAll(async () => {
  process.env.EMAIL_OUTBOX_DIR = `.emails-int-${Date.now()}`
  payload = await getTestPayload()
  vi.spyOn(payload, 'sendEmail').mockImplementation(async (message) => {
    sent.push({
      to: String(message.to),
      subject: String(message.subject),
      html: String(message.html),
      attachments: (message.attachments ?? []) as Sent['attachments'],
    })
    return {}
  })
  const stamp = Date.now()
  admin = await createUser(payload, 'admin', `admin-v${stamp}@example.test`)
  staff = await createUser(payload, 'staff', `staff-v${stamp}@example.test`)
  butcher = await createUser(payload, 'butcher', `butcher-v${stamp}@example.test`)
  track('users', admin)
  track('users', staff)
  track('users', butcher)
  await setVoucherSettings(TEST_IBAN)
  await payload.update({
    collection: 'voucher-batches',
    where: { active: { equals: true } },
    data: { active: false },
    overrideAccess: true,
    context: { skipBatchSync: true, disableRevalidate: true },
  })
  const batch = await payload.create({
    collection: 'voucher-batches',
    data: { letter: 'K', expiresOn: '2027-12-31T12:00:00.000Z', active: true },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  batchId = track('voucher-batches', batch).id
  const image = track('media', await createTestImage(payload, 'Poukaz test'))
  const product = async (data: Record<string, unknown>) =>
    track(
      'products',
      await payload.create({
        collection: 'products',
        overrideAccess: true,
        context: { disableRevalidate: true },
        data: {
          priceUnit: 'piece',
          vatRate: '0',
          availability: 'in-stock',
          mainImage: image.id,
          _status: 'published',
          ...data,
        } as never,
      }),
    ).id
  voucher1000 = await product({
    title: 'Test poukaz 1000',
    price: 1,
    voucher: { enabled: true, value: 1000, formats: ['electronic', 'printed'] },
  })
  voucher2000 = await product({
    title: 'Test poukaz 2000',
    price: 2000,
    voucher: { enabled: true, value: 2000, formats: ['electronic', 'printed'] },
  })
  sauce = await product({ title: 'Test omáčka voucher', price: 149, vatRate: '21' })
})

afterAll(async () => {
  for (const item of [...created].reverse()) {
    try {
      await payload.delete({
        collection: item.collection as never,
        id: item.id,
        overrideAccess: true,
      })
    } catch {
      // already gone (cascade)
    }
  }
  await payload.delete({
    collection: 'vouchers',
    where: { id: { exists: true } },
    overrideAccess: true,
  })
})

describe('voucher products', () => {
  it('a voucher always costs its value, per piece', async () => {
    const doc = await payload.findByID({
      collection: 'products',
      id: voucher1000,
      overrideAccess: true,
    })
    expect(doc.price).toBe(1000)
    expect(doc.priceUnit).toBe('piece')
  })
})

describe('electronic voucher order', () => {
  it('creates a voucher order without delivery, issues vouchers and e-mails PDF + QR', async () => {
    sent = []
    const result = await place(voucherInput())
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    const order = await orderByNumber(result.orderNumber)
    expect(order.kind).toBe('voucher')
    expect(order.scheduledDate ?? null).toBeNull()
    expect(order.delivery?.methodType ?? null).toBeNull()
    expect(order.totals.deliveryPrice).toBe(0)
    expect(order.totals.totalEstimate).toBe(2000)
    expect(order.payment).toMatchObject({
      method: 'bank-transfer',
      status: 'awaiting',
      amount: 2000,
      variableSymbol: order.orderNumber,
    })
    const due = new Date(order.payment!.dueAt!).getTime() - new Date(order.createdAt).getTime()
    expect(Math.round(due / 3_600_000)).toBe(72)

    const vouchers = await orderVouchers(payload, order.id)
    vouchers.forEach((v) => track('vouchers', v))
    expect(vouchers).toHaveLength(2)
    for (const v of vouchers) {
      expect(v.status).toBe('issued')
      expect(v.type).toBe('electronic')
      expect(v.value).toBe(1000)
      expect(v.recipientName).toBe('Jan Novák')
      expect(v.code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{2}K-[2-9A-Z]{3}$/)
      expect(v.expiresOn.slice(0, 10)).toBe('2027-12-31')
    }

    const customer = sent.find((m) => m.to === 'petra@example.test')!
    expect(customer.subject).toContain(order.orderNumber)
    expect(customer.html).toContain('cid:qr-platba@terrys')
    expect(customer.html).toContain(order.orderNumber)
    expect(customer.html).toContain('začnou platit, jakmile nám dorazí platba')
    const qr = customer.attachments.find((a) => a.cid === 'qr-platba@terrys')!
    const spayd = orderSpayd(order)!
    expect(spayd).toContain(`ACC:${TEST_IBAN}`)
    expect(spayd).toContain('AM:2000.00')
    expect(spayd).toContain(`X-VS:${order.orderNumber}`)
    expect(decodeQr(qr.content)).toBe(spayd)
    const pdf = customer.attachments.find((a) => a.filename.endsWith('.pdf'))!
    const text = await pdfText(pdf.content)
    for (const v of vouchers) expect(text).toContain(v.code)
    expect(text).toContain('31. 12. 2027')
    expect(text).toContain('Jan Novák')
    // The shop gets its internal copy, the customer no standard "goods" confirmation.
    expect(sent.filter((m) => m.to === 'petra@example.test')).toHaveLength(1)
    expect(order.sentEmails?.some((e) => e.kind === 'voucher-issued')).toBe(true)
  })

  it('refuses mixing electronic vouchers with goods', async () => {
    const result = await place(
      voucherInput({
        lines: [
          { productId: voucher1000, variantId: 'electronic', quantity: 1 },
          { productId: sauce, variantId: null, quantity: 1 },
        ],
      }),
    )
    expect(result).toMatchObject({ ok: false, status: 409, error: 'mixed-vouchers' })
  })

  it('refuses (no order saved) without a bank account or without an active batch', async () => {
    const before = await payload.count({ collection: 'orders', overrideAccess: true })
    await setVoucherSettings(null)
    expect(await place(voucherInput())).toMatchObject({ ok: false, error: 'vouchers-unavailable' })
    await setVoucherSettings(TEST_IBAN)
    await payload.update({
      collection: 'voucher-batches',
      id: batchId,
      data: { active: false },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
    expect(await place(voucherInput())).toMatchObject({ ok: false, error: 'vouchers-unavailable' })
    await payload.update({
      collection: 'voucher-batches',
      id: batchId,
      data: { active: true },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
    const after = await payload.count({ collection: 'orders', overrideAccess: true })
    expect(after.totalDocs).toBe(before.totalDocs)
  })

  it('never gives two parallel orders the same code; clashes are retried', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => place(voucherInput())))
    const codes: string[] = []
    for (const result of results) {
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      const order = await orderByNumber(result.orderNumber)
      const vouchers = await orderVouchers(payload, order.id)
      vouchers.forEach((v) => track('vouchers', v))
      codes.push(...vouchers.map((v) => v.code))
    }
    expect(codes).toHaveLength(12)
    expect(new Set(codes).size).toBe(12)

    // Forced clash: the first attempt of the second issue repeats the first code.
    const order = await orderByNumber((results[0] as { orderNumber: string }).orderNumber)
    // The first 13 random bytes are zeros (= code 2222-2222-22K-222), then real randomness.
    const zerosFirst = () => {
      let calls = 0
      return (bytes: Uint8Array) =>
        calls++ < 13 ? bytes.fill(0) : globalThis.crypto.getRandomValues(bytes)
    }
    const spec = voucherSpecsForOrder(order, 'electronic').slice(0, 1)
    const [a] = await issueVouchers(payload, order, spec, { random: zerosFirst() })
    const [b] = await issueVouchers(payload, order, spec, { random: zerosFirst() })
    track('vouchers', a)
    track('vouchers', b)
    expect(a.code).toBe('2222-2222-22K-222')
    expect(b.code).not.toBe(a.code)
  })
})

describe('payment marking', () => {
  it('marks paid once (parallel clicks → one e-mail), undo, refuses butcher', async () => {
    const result = await place(
      voucherInput({ lines: [{ productId: voucher2000, variantId: 'electronic', quantity: 1 }] }),
    )
    if (!result.ok) throw new Error('order failed')
    const order = await orderByNumber(result.orderNumber)
    expect(await markVoucherOrderPaid(payload, butcher, order.id)).toMatchObject({
      ok: false,
      status: 403,
    })

    sent = []
    const [one, two] = await Promise.all([
      markVoucherOrderPaid(payload, staff, order.id, { paidOn: '2026-11-22' }),
      markVoucherOrderPaid(payload, staff, order.id, { paidOn: '2026-11-22' }),
    ])
    expect(one.ok && two.ok).toBe(true)
    expect(sent.filter((m) => m.subject.startsWith('Platba přijata'))).toHaveLength(1)
    const paid = await payload.findByID({
      collection: 'orders',
      id: order.id,
      overrideAccess: true,
    })
    expect(paid.payment?.status).toBe('paid')
    expect(paid.status).toBe('delivered')
    expect(paid.payment?.markedPaidBy).toBeTruthy()
    const [v] = await orderVouchers(payload, order.id)
    track('vouchers', v)
    expect(v.status).toBe('paid')
    expect(v.history?.some((h) => h.event === 'paid')).toBe(true)
    const audit = await payload.find({
      collection: 'order-audit-log',
      where: { order: { equals: order.id } },
      overrideAccess: true,
    })
    expect(audit.docs.some((row) => row.field === 'Platba převodem')).toBe(true)

    const undo = await undoVoucherOrderPaid(payload, staff, order.id, { reason: 'omyl' })
    expect(undo.ok).toBe(true)
    expect((await freshVoucher(v.id)).status).toBe('issued')
    // Paid again, then used → undo refused.
    await markVoucherOrderPaid(payload, staff, order.id)
    const goods = await goodsOrder(1000)
    const billed = await saveBilling(payload, staff, goods.id, {
      vouchers: [{ code: v.code, amount: 500 }],
    })
    expect(billed.ok).toBe(true)
    expect(await undoVoucherOrderPaid(payload, staff, order.id, {})).toMatchObject({
      ok: false,
      status: 409,
    })
  })
})

describe('redemption at billing', () => {
  it('validates the code and changes the balance atomically (partial, edit, remove)', async () => {
    const v = await paidVoucher(2000)
    const order = await goodsOrder(3000)
    // Typed tolerantly: lowercase, spaces instead of dashes.
    const typed = v.code.toLowerCase().replace(/-/g, ' ')
    const first = await saveBilling(payload, staff, order.id, {
      vouchers: [{ code: typed, amount: 1500 }],
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.order.totals.amountDue).toBe(1500)
    expect(first.order.voucherRedemptions?.[0]).toMatchObject({ code: v.code, voucher: v.id })
    let fresh = await freshVoucher(v.id)
    expect(fresh).toMatchObject({ balance: 500, status: 'partially-redeemed' })
    expect(fresh.redemptions).toHaveLength(1)

    const edit = await saveBilling(payload, staff, order.id, {
      vouchers: [{ code: v.code, amount: 2000 }],
    })
    expect(edit.ok).toBe(true)
    fresh = await freshVoucher(v.id)
    expect(fresh).toMatchObject({ balance: 0, status: 'redeemed' })
    expect(fresh.redemptions).toHaveLength(1)

    const remove = await saveBilling(payload, staff, order.id, { vouchers: [] })
    expect(remove.ok).toBe(true)
    fresh = await freshVoucher(v.id)
    expect(fresh).toMatchObject({ balance: 2000, status: 'paid' })
    expect(fresh.redemptions).toHaveLength(0)
  })

  it('refuses unknown, unpaid, insufficient and expired vouchers', async () => {
    const order = await goodsOrder(3000)
    const unknown = await saveBilling(payload, staff, order.id, {
      vouchers: [{ code: 'NEEXISTUJE-1', amount: 100 }],
    })
    expect(unknown).toMatchObject({ ok: false, status: 422 })
    if (!unknown.ok)
      expect(unknown.fieldErrors?.['vouchers.0.code']).toContain('Zapsat starý poukaz')

    const result = await place(
      voucherInput({ lines: [{ productId: voucher1000, variantId: 'electronic', quantity: 1 }] }),
    )
    if (!result.ok) throw new Error('order failed')
    const [unpaid] = await orderVouchers(payload, (await orderByNumber(result.orderNumber)).id)
    track('vouchers', unpaid)
    const notPaid = await saveBilling(payload, staff, order.id, {
      vouchers: [{ code: unpaid.code, amount: 100 }],
    })
    expect(notPaid.ok).toBe(false)
    if (!notPaid.ok) expect(notPaid.fieldErrors?.['vouchers.0.code']).toContain('není zaplacený')

    const small = await paidVoucher(500)
    const tooMuch = await saveBilling(payload, staff, order.id, {
      vouchers: [{ code: small.code, amount: 600 }],
    })
    expect(tooMuch.ok).toBe(false)
    expect((await freshVoucher(small.id)).balance).toBe(500)

    const old = await paidVoucher(1000, '2026-01-31')
    const expired = await saveBilling(payload, staff, order.id, {
      vouchers: [{ code: old.code, amount: 100 }],
    })
    expect(expired.ok).toBe(false)
    if (!expired.ok) expect(expired.fieldErrors?.['vouchers.0.code']).toContain('propadlý')
  })

  it('accepts a voucher on its expiry day when the ORDER was placed before it expired', async () => {
    const v = await paidVoucher(1000, '2026-11-30')
    const order = await goodsOrder(800, '2026-11-29T10:00:00.000Z')
    const billed = await saveBilling(payload, staff, order.id, {
      vouchers: [{ code: v.code, amount: 800 }],
    })
    expect(billed.ok).toBe(true)
  })

  it('two parallel billings can never overspend one voucher', async () => {
    const v = await paidVoucher(2000)
    const [a, b] = await Promise.all([goodsOrder(2500), goodsOrder(2500)])
    const results = await Promise.all([
      saveBilling(payload, staff, a.id, { vouchers: [{ code: v.code, amount: 2000 }] }),
      saveBilling(payload, staff, b.id, { vouchers: [{ code: v.code, amount: 2000 }] }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    const fresh = await freshVoucher(v.id)
    expect(fresh.balance).toBe(0)
    expect(fresh.redemptions).toHaveLength(1)
  })

  it('legacy (old-shop) vouchers: record once, redeem like ours', async () => {
    const recorded = await createLegacyVoucher(payload, staff, {
      code: 'old-shop 7781',
      value: 1000,
      balance: 600,
      expiresOn: '2027-06-30',
      note: 'opsáno z poukazu',
    })
    expect(recorded.ok).toBe(true)
    if (!recorded.ok) return
    track('vouchers', { id: recorded.voucher.id })
    expect(recorded.voucher).toMatchObject({
      type: 'legacy',
      status: 'partially-redeemed',
      balance: 600,
    })
    expect(
      await createLegacyVoucher(payload, staff, {
        code: 'OLD SHOP-7781',
        value: 1000,
        expiresOn: '2027-06-30',
      }),
    ).toMatchObject({ ok: false, status: 409 })
    const order = await goodsOrder(900)
    const billed = await saveBilling(payload, staff, order.id, {
      vouchers: [{ code: 'OLDSHOP7781', amount: 600 }],
    })
    expect(billed.ok).toBe(true)
    expect((await freshVoucher(recorded.voucher.id)).status).toBe('redeemed')
  })
})

describe('access rules', () => {
  it('butcher and anonymous never see vouchers; staff cannot edit a balance', async () => {
    const v = await paidVoucher(1000)
    await expect(
      payload.find({ collection: 'vouchers', overrideAccess: false, user: butcher }),
    ).rejects.toThrow()
    await expect(payload.find({ collection: 'vouchers', overrideAccess: false })).rejects.toThrow()
    await expect(
      payload.find({ collection: 'voucher-batches', overrideAccess: false, user: butcher }),
    ).rejects.toThrow()
    const list = await payload.find({ collection: 'vouchers', overrideAccess: false, user: staff })
    expect(list.totalDocs).toBeGreaterThan(0)
    await payload.update({
      collection: 'vouchers',
      id: v.id,
      data: { balance: 99999, status: 'paid', note: 'poznámka obsluhy' },
      overrideAccess: false,
      user: staff,
    })
    const fresh = await freshVoucher(v.id)
    expect(fresh.balance).toBe(1000)
    expect(fresh.note).toBe('poznámka obsluhy')
    await expect(
      payload.delete({ collection: 'vouchers', id: v.id, overrideAccess: false, user: staff }),
    ).rejects.toThrow()
  })

  it('a voucher created in the admin is a paid legacy voucher', async () => {
    const doc = await payload.create({
      collection: 'vouchers',
      data: { code: 'admin-legacy-1', value: 500, expiresOn: '2027-01-31T12:00:00.000Z' } as never,
      overrideAccess: false,
      user: staff,
    })
    track('vouchers', doc)
    expect(doc).toMatchObject({
      type: 'legacy',
      status: 'paid',
      balance: 500,
      code: 'ADMIN-LEGACY-1',
    })
    expect(doc.codeNormalized).toBe(normalizeVoucherCode('admin-legacy-1'))
  })
})

describe('overdue handling', () => {
  it('flags and reminds once; cancels only when configured', async () => {
    const result = await place(
      voucherInput({ lines: [{ productId: voucher1000, variantId: 'electronic', quantity: 1 }] }),
    )
    if (!result.ok) throw new Error('order failed')
    const order = await orderByNumber(result.orderNumber)
    const later = new Date(new Date(order.payment!.dueAt!).getTime() + 3_600_000)
    sent = []
    const run1 = await processOverdueVoucherOrders(payload, later)
    expect(run1.reminded).toBeGreaterThanOrEqual(1)
    await processOverdueVoucherOrders(payload, later)
    expect(
      sent.filter(
        (m) => m.subject.includes(order.orderNumber) && m.subject.startsWith('Připomínka'),
      ),
    ).toHaveLength(1)
    const flagged = await payload.findByID({
      collection: 'orders',
      id: order.id,
      overrideAccess: true,
    })
    expect(flagged.needsReview).toBe(true)
    expect(flagged.status).toBe('received')

    const settings = await payload.findGlobal({ slug: 'settings' })
    await payload.updateGlobal({
      slug: 'settings',
      data: {
        vouchers: {
          ...settings.vouchers,
          overdueAction: 'flag-remind-cancel',
          autoCancelAfterDays: 7,
        },
      },
      context: { disableRevalidate: true },
    })
    await processOverdueVoucherOrders(payload, new Date(later.getTime() + 8 * 86_400_000))
    const cancelled = await payload.findByID({
      collection: 'orders',
      id: order.id,
      overrideAccess: true,
    })
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.payment?.status).toBe('cancelled')
    const [v] = await orderVouchers(payload, order.id)
    track('vouchers', v)
    expect(v.status).toBe('cancelled')
    await setVoucherSettings(TEST_IBAN)
  })
})

describe('printed vouchers', () => {
  it('are issued by staff on the order and become valid when the order is paid on delivery', async () => {
    const order = await goodsOrder(1000)
    await payload.update({
      collection: 'orders',
      id: order.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
      data: {
        lines: [
          ...(order.lines ?? []),
          {
            product: voucher1000,
            productTitle: 'Test poukaz 1000',
            variantId: 'printed',
            variantLabel: 'Tištěný',
            quantity: 2,
            unitPrice: 1000,
            priceUnit: 'piece',
            vatRate: '0',
            estimatedPrice: 2000,
          },
        ],
      },
    })
    expect(await issuePrintedVouchers(payload, butcher, order.id)).toMatchObject({
      ok: false,
      status: 403,
    })
    const issued = await issuePrintedVouchers(payload, staff, order.id)
    expect(issued.ok).toBe(true)
    if (!issued.ok) return
    issued.vouchers.forEach((v) => track('vouchers', v))
    expect(issued.vouchers).toHaveLength(2)
    expect(issued.vouchers.every((v) => v.type === 'printed' && v.status === 'issued')).toBe(true)
    const again = await issuePrintedVouchers(payload, staff, order.id)
    expect(again.ok && again.vouchers).toHaveLength(2)
    const fresh = await payload.findByID({
      collection: 'orders',
      id: order.id,
      overrideAccess: true,
    })
    expect(await activatePrintedVouchers(payload, staff, fresh)).toBe(2)
    expect((await freshVoucher(issued.vouchers[0].id)).status).toBe('paid')
  })
})
