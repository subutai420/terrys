import { randomBytes, randomUUID } from 'crypto'

import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload, PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { checkHealth } from '@/ops/health'
import type { Order } from '@/payload-types'
import { privacyEndpoints } from '@/privacy/endpoints'
import { anonymise, exportPersonalData } from '@/privacy/service'

import { createUser, getTestPayload, type TestUser } from './helpers'

/**
 * Stage 9 (GDPR): export and anonymisation against a real Payload + PostgreSQL, plus the health
 * check's database queries.
 */

let payload: Payload
let admin: TestUser
let staff: TestUser
const stamp = Date.now()
const EMAIL = `jana.gdpr${stamp}@example.test`
const OTHER = `petr.gdpr${stamp}@example.test`

async function makeOrder(
  email: string,
  status: Order['status'],
  over: Record<string, unknown> = {},
) {
  const orderNumber = `G${stamp}${Math.floor(Math.random() * 100000)}`
  return (await payload.create({
    collection: 'orders',
    overrideAccess: true,
    depth: 0,
    context: { disableRevalidate: true },
    data: {
      orderNumber,
      status,
      kind: 'goods',
      customerName: 'Jana Testovací',
      contactEmail: email,
      contactPhone: '602 123 456',
      totalEstimate: 1229,
      lines: [
        {
          productTitle: 'Dárkový poukaz 1 000 Kč',
          variantId: 'printed',
          quantity: 1,
          unitPrice: 1000,
          priceUnit: 'piece',
          vatRate: '0',
          estimatedPrice: 1000,
        },
      ],
      totals: { goodsEstimate: 1000, deliveryPrice: 229, totalEstimate: 1229, vat: [] },
      invoiceNumber: `FV${orderNumber}`,
      customer: {
        firstName: 'Jana',
        lastName: 'Testovací',
        email: email.toUpperCase(),
        phone: '602 123 456',
        companyName: 'Firma s.r.o.',
        ico: '45274649',
      },
      shippingAddress: { street: 'Masarykova 12', city: 'Brno', postcode: '60200' },
      customerNote: 'Zvonit u Nováků',
      attribution: { utmSource: 'newsletter', gclid: 'abc123' },
      consents: { termsAcceptedAt: new Date().toISOString(), newsletter: true },
      accessToken: randomBytes(16).toString('hex'),
      idempotencyKey: randomUUID(),
      ...over,
    } as never,
  })) as Order
}

beforeAll(async () => {
  process.env.EMAIL_OUTBOX_DIR = `.emails-int-privacy-${stamp}`
  payload = await getTestPayload()
  admin = await createUser(payload, 'admin', `admin-p${stamp}@example.test`)
  staff = await createUser(payload, 'staff', `staff-p${stamp}@example.test`)
})

afterAll(async () => {
  await payload?.destroy?.()
})

describe('personal data export', () => {
  it('finds orders (case-insensitive), withdrawals and newsletter evidence; hides secrets', async () => {
    const order = await makeOrder(EMAIL, 'delivered')
    await makeOrder(OTHER, 'delivered')
    await payload.create({
      collection: 'withdrawals',
      overrideAccess: true,
      data: {
        submittedAt: new Date().toISOString(),
        name: 'Jana Testovací',
        email: EMAIL,
        orderNumberEntered: order.orderNumber,
        message: 'Odstupuji',
      } as never,
    })
    await payload.create({
      collection: 'integration-jobs',
      overrideAccess: true,
      data: {
        kind: 'ecomail-subscribe',
        status: 'sent',
        payload: { email: EMAIL, source: 'web-paticka', consentText: 'Souhlasím' },
      } as never,
    })

    const data = await exportPersonalData(payload, EMAIL)
    expect(data.counts).toMatchObject({ orders: 1, withdrawals: 1, integrationJobs: 1 })
    expect(data.orders[0]).toMatchObject({ orderNumber: order.orderNumber })
    expect(data.orders[0]).not.toHaveProperty('accessToken')
    expect(data.orders[0]).not.toHaveProperty('idempotencyKey')
    expect(JSON.stringify(data)).not.toContain(OTHER)
  })
})

describe('anonymisation', () => {
  it('dry run changes nothing and skips orders still being fulfilled', async () => {
    const active = await makeOrder(EMAIL, 'received')
    const result = await anonymise(payload, { email: EMAIL })
    expect(result.dryRun).toBe(true)
    expect(result.orders.length).toBe(1)
    expect(result.skipped.map((s) => s.orderNumber)).toContain(active.orderNumber)
    const export_ = await exportPersonalData(payload, EMAIL)
    expect(export_.counts.orders).toBe(2)
  })

  it('confirmed: replaces personal data, keeps accounting data, audits, redacts outbox rows', async () => {
    const before = await exportPersonalData(payload, EMAIL)
    const finished = before.orders.find((o) => o.status === 'delivered') as unknown as Order
    const result = await anonymise(
      payload,
      { email: EMAIL },
      { confirm: true, actor: { id: admin.id, email: admin.email } },
    )
    expect(result.dryRun).toBe(false)
    expect(result.withdrawals).toBe(1)

    const after = (await payload.findByID({
      collection: 'orders',
      id: finished.id,
      depth: 0,
      overrideAccess: true,
    })) as Order
    expect(after.customer).toMatchObject({ firstName: 'Anonymizováno', phone: '—' })
    expect(after.customer.email).toMatch(/@anonymizovano\.invalid$/)
    expect(after.contactEmail).toMatch(/@anonymizovano\.invalid$/)
    expect(after.shippingAddress?.street).toBeFalsy()
    expect(after.customerNote).toBeFalsy()
    expect(after.attribution?.gclid).toBeFalsy()
    expect(after.privacy?.anonymisedAt).toBeTruthy()
    expect(after.privacy?.anonymisedReason).toBe('request')
    // Accounting data kept.
    expect(after.totals.totalEstimate).toBe(1229)
    expect(after.invoiceNumber).toBe(finished.invoiceNumber)
    expect(after.lines?.[0]?.estimatedPrice).toBe(1000)
    expect(after.customer.ico).toBe('45274649')
    expect(after.accessToken).not.toBe((finished as { accessToken?: string }).accessToken)

    const audit = await payload.find({
      collection: 'order-audit-log',
      where: { and: [{ order: { equals: finished.id } }, { field: { equals: 'anonymizace' } }] },
      overrideAccess: true,
    })
    expect(audit.totalDocs).toBe(1)
    expect(audit.docs[0].userEmail).toBe(admin.email)

    const remaining = await exportPersonalData(payload, EMAIL)
    // Only the order that is still being fulfilled keeps the e-mail; withdrawal + job are gone.
    expect(remaining.counts).toMatchObject({ orders: 1, withdrawals: 0, integrationJobs: 0 })

    // Running it again changes nothing more.
    const again = await anonymise(payload, { email: EMAIL }, { confirm: true })
    expect(again.orders.length).toBe(0)
  })

  it('retention run picks only finished orders older than the period', async () => {
    const old = await makeOrder(OTHER.replace('petr', 'stary'), 'picked-up')
    const recent = await makeOrder(OTHER.replace('petr', 'novy'), 'delivered')
    const db = (payload.db as unknown as PostgresAdapter).drizzle
    await db.execute(
      sql`UPDATE orders SET created_at = now() - interval '40 months' WHERE id = ${old.id}`,
    )
    const result = await anonymise(payload, { olderThanMonths: 36 })
    const numbers = result.orders.map((o) => o.orderNumber)
    expect(numbers).toContain(old.orderNumber)
    expect(numbers).not.toContain(recent.orderNumber)
    expect(result.mode).toBe('retention')
    expect(result.dryRun).toBe(true)
  })
})

describe('privacy endpoints access', () => {
  const handler = (path: string) => privacyEndpoints.find((e) => e.path === path)!.handler
  const fakeReq = (user: TestUser | null, query = '', body: unknown = undefined) =>
    ({
      payload,
      user: user ? { ...user, collection: 'users' } : null,
      headers: new Headers(),
      searchParams: new URLSearchParams(query),
      json: async () => body,
    }) as unknown as PayloadRequest

  it('admin only', async () => {
    expect((await handler('/privacy/export')(fakeReq(null, `email=${EMAIL}`))).status).toBe(401)
    expect((await handler('/privacy/export')(fakeReq(staff, `email=${EMAIL}`))).status).toBe(403)
    const ok = await handler('/privacy/export')(fakeReq(admin, `email=${EMAIL}`))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-disposition')).toContain('attachment')
    expect((await handler('/privacy/anonymise')(fakeReq(staff, '', { email: EMAIL }))).status).toBe(
      403,
    )
    const bad = await handler('/privacy/anonymise')(fakeReq(admin, '', { olderThanMonths: 0 }))
    expect(bad.status).toBe(400)
    const dry = await (
      await handler('/privacy/anonymise')(fakeReq(admin, '', { olderThanMonths: 36 }))
    ).json()
    expect(dry.dryRun).toBe(true)
  })
})

describe('health check', () => {
  it('reads the database and reports counts without personal data', async () => {
    const report = await checkHealth(payload)
    expect(report.database.ok).toBe(true)
    expect(report.integrationJobs).not.toBeNull()
    expect(report.emails).not.toBeNull()
    expect(JSON.stringify(report)).not.toMatch(/@/)
  })
})
