import { randomBytes } from 'crypto'

import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { logEvent } from '@/lib/monitoring/log'
import {
  anonymisationEligibility,
  anonymisedEmail,
  anonymisedOrderData,
  ANONYMISED_LABEL,
  ELIGIBILITY_MESSAGES,
} from '@/lib/privacy/anonymise'
import type { Order } from '@/payload-types'

/**
 * Stage 9 (GDPR): data subject requests and retention.
 *
 * - `exportPersonalData(email)` – everything the shop's database holds about an e-mail address
 *   (orders, withdrawals, vouchers bought in those orders, marketing outbox rows) as one JSON.
 * - `anonymise({ email } | { olderThanMonths })` – DRY RUN unless `confirm: true`. Replaces the
 *   personal data of finished orders (rules: src/lib/privacy/anonymise.ts), of the matching
 *   withdrawals, of the vouchers' gift messages and of the marketing outbox payloads. Every
 *   anonymised order gets an entry in the order audit log and `privacy.anonymisedAt`.
 *   Never runs automatically (no cron in stage 9): the owner starts it in the admin.
 *
 * Retention periods are a PROPOSAL (docs/provoz.md, "Ochrana osobních údajů") – the lawyer and
 * the accountant must confirm them.
 */

type Actor = { id: number; email?: string | null } | null

function db(payload: Payload) {
  return (payload.db as unknown as PostgresAdapter).drizzle
}
const rows = <T>(result: unknown) => ((result as { rows?: T[] }).rows ?? []) as T[]

async function orderIdsForEmail(payload: Payload, email: string): Promise<number[]> {
  const result = await db(payload).execute(
    sql`SELECT id FROM orders WHERE lower(contact_email) = ${email} OR lower(customer_email) = ${email} ORDER BY id`,
  )
  return rows<{ id: number }>(result).map((row) => Number(row.id))
}

async function withdrawalIdsForEmail(payload: Payload, email: string): Promise<number[]> {
  const result = await db(payload).execute(
    sql`SELECT id FROM withdrawals WHERE lower(email) = ${email} ORDER BY id`,
  )
  return rows<{ id: number }>(result).map((row) => Number(row.id))
}

/** Marketing outbox rows of the orders, plus newsletter rows (footer form) with this e-mail. */
async function jobIds(
  payload: Payload,
  orderIds: number[],
  email: string | null,
): Promise<number[]> {
  const byOrder = orderIds.length
    ? rows<{ id: number }>(
        await db(payload).execute(
          sql`SELECT id FROM integration_jobs WHERE order_id IN (${sql.join(
            orderIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        ),
      )
    : []
  const byEmail = email
    ? rows<{ id: number }>(
        await db(payload).execute(
          sql`SELECT id FROM integration_jobs WHERE lower(payload->>'email') = ${email}`,
        ),
      )
    : []
  return [...new Set([...byOrder, ...byEmail].map((row) => Number(row.id)))].sort((a, b) => a - b)
}

const HIDDEN_ORDER_KEYS = ['accessToken', 'idempotencyKey'] as const

export async function exportPersonalData(payload: Payload, email: string, now = new Date()) {
  const orderIds = await orderIdsForEmail(payload, email)
  const withdrawalIds = await withdrawalIdsForEmail(payload, email)
  const [orders, withdrawals, vouchers, jobs] = await Promise.all([
    orderIds.length
      ? payload.find({
          collection: 'orders',
          where: { id: { in: orderIds } },
          depth: 0,
          limit: orderIds.length,
          pagination: false,
          overrideAccess: true,
        })
      : null,
    withdrawalIds.length
      ? payload.find({
          collection: 'withdrawals',
          where: { id: { in: withdrawalIds } },
          depth: 0,
          limit: withdrawalIds.length,
          pagination: false,
          overrideAccess: true,
        })
      : null,
    orderIds.length
      ? payload.find({
          collection: 'vouchers',
          where: { order: { in: orderIds } },
          depth: 0,
          limit: 500,
          pagination: false,
          overrideAccess: true,
          // The code is the customer's own (bought) voucher – part of their data.
          select: {
            code: true,
            value: true,
            balance: true,
            expiresOn: true,
            type: true,
            status: true,
            orderNumber: true,
            recipientName: true,
            message: true,
            paidAt: true,
            redemptions: true,
          },
        })
      : null,
    jobIds(payload, orderIds, email).then((ids) =>
      ids.length
        ? payload.find({
            collection: 'integration-jobs',
            where: { id: { in: ids } },
            depth: 0,
            limit: ids.length,
            pagination: false,
            overrideAccess: true,
          })
        : null,
    ),
  ])
  const cleanOrder = (order: Order) => {
    const copy: Record<string, unknown> = { ...order }
    for (const key of HIDDEN_ORDER_KEYS) delete copy[key]
    return copy
  }
  return {
    generatedAt: now.toISOString(),
    email,
    note:
      'Export údajů z databáze e-shopu Terrys.cz pro žádost subjektu údajů (čl. 15 GDPR). ' +
      'Neobsahuje: kopie e-mailů u poskytovatele (Resend), kontakty v Ecomailu, data v Google ' +
      'Analytics / Meta (měřicí nástroje) ani účetní doklady v účetním programu – ty se vyžádají ' +
      'zvlášť u daného nástroje.',
    counts: {
      orders: orders?.docs.length ?? 0,
      withdrawals: withdrawals?.docs.length ?? 0,
      vouchers: vouchers?.docs.length ?? 0,
      integrationJobs: jobs?.docs.length ?? 0,
    },
    orders: (orders?.docs ?? []).map((order) => cleanOrder(order as Order)),
    withdrawals: withdrawals?.docs ?? [],
    vouchers: vouchers?.docs ?? [],
    // Newsletter consent evidence (Ecomail subscription requests incl. consent text and time)
    // and the marketing calls made for the orders.
    integrationJobs: (jobs?.docs ?? []).map((job) => ({
      id: job.id,
      kind: job.kind,
      status: job.status,
      createdAt: job.createdAt,
      sentAt: job.sentAt,
      payload: job.payload,
    })),
  }
}

export type AnonymiseInput =
  { email: string; olderThanMonths?: undefined } | { email?: undefined; olderThanMonths: number }

export type AnonymiseResult = {
  dryRun: boolean
  mode: 'request' | 'retention'
  orders: { id: number; orderNumber: string; createdAt: string; status: string }[]
  skipped: { id: number; orderNumber: string; reason: string }[]
  withdrawals: number
  integrationJobs: number
}

const MAX_BATCH = 500

/** Orders + withdrawals the run would touch (also used by the dry run). */
async function plan(payload: Payload, input: AnonymiseInput, now: Date) {
  let candidates: Order[] = []
  let withdrawalIds: number[] = []
  if (input.email) {
    const ids = await orderIdsForEmail(payload, input.email)
    candidates = ids.length
      ? ((
          await payload.find({
            collection: 'orders',
            where: { id: { in: ids } },
            depth: 0,
            limit: ids.length,
            pagination: false,
            overrideAccess: true,
          })
        ).docs as Order[])
      : []
    withdrawalIds = await withdrawalIdsForEmail(payload, input.email)
  } else {
    const cutoff = new Date(now)
    cutoff.setUTCMonth(cutoff.getUTCMonth() - (input.olderThanMonths ?? 0))
    candidates = (
      await payload.find({
        collection: 'orders',
        where: {
          and: [
            { createdAt: { less_than: cutoff.toISOString() } },
            { 'privacy.anonymisedAt': { exists: false } },
          ],
        },
        depth: 0,
        limit: MAX_BATCH,
        sort: 'createdAt',
        overrideAccess: true,
      })
    ).docs as Order[]
    const result = await db(payload).execute(
      sql`SELECT id FROM withdrawals WHERE submitted_at < ${cutoff.toISOString()} AND anonymised_at IS NULL ORDER BY id LIMIT ${MAX_BATCH}`,
    )
    withdrawalIds = rows<{ id: number }>(result).map((row) => Number(row.id))
  }
  const eligible: Order[] = []
  const skipped: AnonymiseResult['skipped'] = []
  for (const order of candidates) {
    const verdict = anonymisationEligibility(
      {
        status: order.status,
        createdAt: order.createdAt,
        anonymisedAt: order.privacy?.anonymisedAt,
      },
      { now, olderThanMonths: input.olderThanMonths },
    )
    if (verdict.ok) eligible.push(order)
    else
      skipped.push({
        id: order.id,
        orderNumber: order.orderNumber,
        reason: ELIGIBILITY_MESSAGES[verdict.reason],
      })
  }
  return { eligible, skipped, withdrawalIds }
}

export async function anonymise(
  payload: Payload,
  input: AnonymiseInput,
  {
    confirm = false,
    actor = null,
    now = new Date(),
  }: { confirm?: boolean; actor?: Actor; now?: Date } = {},
): Promise<AnonymiseResult> {
  const mode = input.email ? 'request' : 'retention'
  const { eligible, skipped, withdrawalIds } = await plan(payload, input, now)
  const jobs = await jobIds(
    payload,
    eligible.map((order) => order.id),
    input.email ?? null,
  )
  const summary: AnonymiseResult = {
    dryRun: !confirm,
    mode,
    orders: eligible.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      status: order.status,
    })),
    skipped,
    withdrawals: withdrawalIds.length,
    integrationJobs: jobs.length,
  }
  if (!confirm) return summary

  for (const order of eligible) {
    await payload.update({
      collection: 'orders',
      id: order.id,
      data: {
        ...anonymisedOrderData(
          {
            orderNumber: order.orderNumber,
            internalNote: order.internalNote,
            sentEmails: order.sentEmails,
          },
          { now, reason: mode, userId: actor?.id ?? null },
        ),
        // A new random token: old thank-you links stop working.
        accessToken: randomBytes(24).toString('base64url'),
      } as never,
      depth: 0,
      overrideAccess: true,
      context: { disableRevalidate: true, privacyAnonymise: true },
    })
    await payload.create({
      collection: 'order-audit-log',
      data: {
        order: order.id,
        orderNumber: order.orderNumber,
        at: now.toISOString(),
        user: actor?.id ?? null,
        userEmail: actor?.email ?? null,
        field: 'anonymizace',
        oldValue: null,
        newValue: mode === 'request' ? 'žádost zákazníka' : 'uplynutí doby uchování',
        summary: `Osobní údaje objednávky ${order.orderNumber} anonymizovány (${mode === 'request' ? 'žádost zákazníka' : 'doba uchování'}).`,
      },
      overrideAccess: true,
    })
    // Gift messages / recipients of vouchers bought in this order.
    await db(payload).execute(
      sql`UPDATE vouchers SET recipient_name = NULL, message = NULL WHERE order_id = ${order.id}`,
    )
  }
  for (const id of withdrawalIds) {
    await payload.update({
      collection: 'withdrawals',
      id,
      data: {
        name: ANONYMISED_LABEL,
        email: anonymisedEmail(`W${id}`),
        phone: null,
        items: null,
        message: null,
        internalNote: null,
        anonymisedAt: now.toISOString(),
      },
      depth: 0,
      overrideAccess: true,
      context: { privacyAnonymise: true },
    })
  }
  if (jobs.length) {
    await db(payload).execute(
      sql`UPDATE integration_jobs SET payload = ${JSON.stringify({ anonymised: true })}::jsonb, response = NULL, last_error = NULL
          WHERE id IN (${sql.join(
            jobs.map((id) => sql`${id}`),
            sql`, `,
          )})`,
    )
  }
  logEvent('info', 'privacy.anonymised', {
    mode,
    orders: eligible.length,
    withdrawals: withdrawalIds.length,
    integrationJobs: jobs.length,
    by: actor?.id ?? null,
  })
  return summary
}
