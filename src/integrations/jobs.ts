import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import type { IntegrationKind, JobStatus } from '@/collections/IntegrationJobs'
import type { IntegrationStatus } from '@/collections/Orders'

import { type FetchLike, type SendResult, sendJob } from './senders'

/**
 * Stage 6: the outbox runner for server-side marketing calls.
 *
 * DESIGN (serverless, e.g. Vercel):
 * 1. `placeOrder()` (or the newsletter form) saves the business data first, then `enqueue()`s one
 *    `integration-jobs` row per call and asks `runAfterResponse()` to process those rows. That uses
 *    Next.js `after()` – the HTTP response goes out immediately, the function keeps running until
 *    the calls finish (8 s timeout each). Ordering never waits for or fails because of them.
 * 2. Failed calls stay in the table with `nextAttemptAt` (backoff below). `GET /api/integrations/
 *    retry` (cron, `Authorization: Bearer $CRON_SECRET`; `vercel.json` runs it every 15 minutes)
 *    processes rows that are due, plus rows stuck in "processing" (a function that died).
 * 3. A row is claimed with a conditional UPDATE (status pending/failed or an expired lock), so two
 *    runners never send the same row twice at the same time.
 * 4. The per-order summary (`orders.integrations.*`) is updated with one SQL statement per call –
 *    bookkeeping only, it does not touch the order's status, prices or audit log.
 */

export const MAX_ATTEMPTS = 6
/** Delay before attempt n+1 (index = attempts already made − 1). */
export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 12 * 3600_000]
const LOCK_MS = 2 * 60_000

let fetchImpl: FetchLike = (input, init) => fetch(input, init)

/** Tests replace the HTTP client (never call real third-party APIs from tests). */
export function setIntegrationFetch(impl: FetchLike | null): void {
  fetchImpl = impl ?? ((input, init) => fetch(input, init))
}

export function orderPrefix(kind: IntegrationKind): 'meta' | 'heureka' | 'ecomail' {
  return kind === 'meta-capi-purchase' ? 'meta' : kind === 'heureka-order' ? 'heureka' : 'ecomail'
}

function db(payload: Payload) {
  return (payload.db as unknown as PostgresAdapter).drizzle
}

/** Writes the per-order summary of one integration (fixed column names, values as parameters). */
export async function setOrderIntegration(
  payload: Payload,
  orderId: number,
  prefix: 'meta' | 'heureka' | 'ecomail',
  status: IntegrationStatus,
  note: string | null,
  at: Date | null,
): Promise<void> {
  await db(payload).execute(
    sql`UPDATE orders SET ${sql.raw(`integrations_${prefix}_status`)} = ${status}, ${sql.raw(
      `integrations_${prefix}_at`,
    )} = ${at ? at.toISOString() : null}, ${sql.raw(`integrations_${prefix}_note`)} = ${
      note ? note.slice(0, 250) : null
    } WHERE id = ${orderId}`,
  )
}

export async function enqueue(
  payload: Payload,
  job: { kind: IntegrationKind; order?: number | null; payload: unknown },
): Promise<number> {
  const created = await payload.create({
    collection: 'integration-jobs',
    overrideAccess: true,
    depth: 0,
    data: {
      kind: job.kind,
      status: 'pending',
      attempts: 0,
      order: job.order ?? null,
      payload: job.payload as Record<string, unknown>,
      nextAttemptAt: new Date().toISOString(),
    },
  })
  return created.id as number
}

type JobRow = {
  id: number
  kind: IntegrationKind
  status: JobStatus
  attempts?: number | null
  order?: number | { id: number } | null
  payload?: unknown
}

/** Claims a row for sending; false when another runner has it or it is done. */
async function claim(payload: Payload, id: number, now: Date): Promise<JobRow | null> {
  const result = await payload.update({
    collection: 'integration-jobs',
    overrideAccess: true,
    depth: 0,
    where: {
      and: [
        { id: { equals: id } },
        {
          or: [
            { status: { in: ['pending', 'failed'] } },
            {
              and: [
                { status: { equals: 'processing' } },
                { lockedUntil: { less_than: now.toISOString() } },
              ],
            },
          ],
        },
      ],
    },
    data: { status: 'processing', lockedUntil: new Date(now.getTime() + LOCK_MS).toISOString() },
  })
  return (result.docs[0] as JobRow | undefined) ?? null
}

export type ProcessOutcome = { id: number; status: JobStatus } | null

/** Sends one row now (if it can be claimed) and records the result. */
export async function processJob(
  payload: Payload,
  id: number,
  now = new Date(),
): Promise<ProcessOutcome> {
  const job = await claim(payload, id, now)
  if (!job) return null
  let result: SendResult
  try {
    result = await sendJob(job.kind, job.payload, fetchImpl, now)
  } catch (error) {
    result = { outcome: 'retry', error: `Neočekávaná chyba: ${String(error)}` }
  }
  const attempts = (job.attempts ?? 0) + 1
  let status: JobStatus
  let orderStatus: IntegrationStatus
  let nextAttemptAt: string | null = null
  if (result.outcome === 'sent') {
    status = 'sent'
    orderStatus = 'sent'
  } else if (result.outcome === 'disabled') {
    status = 'skipped'
    orderStatus = 'disabled'
  } else if (result.outcome === 'retry' && attempts < MAX_ATTEMPTS) {
    status = 'failed'
    orderStatus = 'failed'
    nextAttemptAt = new Date(
      now.getTime() + BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)],
    ).toISOString()
  } else {
    status = 'expired'
    orderStatus = 'failed'
  }
  const error = result.outcome === 'sent' ? null : result.error
  await payload.update({
    collection: 'integration-jobs',
    id: job.id,
    overrideAccess: true,
    depth: 0,
    data: {
      status,
      attempts,
      lockedUntil: null,
      nextAttemptAt,
      lastError: error,
      sentAt: result.outcome === 'sent' ? now.toISOString() : null,
      response: (result.response ?? null) as Record<string, unknown> | null,
      ...(result.outcome === 'sent' && result.storedPayload !== undefined
        ? { payload: result.storedPayload as Record<string, unknown> }
        : {}),
    },
  })
  const orderId = typeof job.order === 'object' && job.order ? job.order.id : job.order
  if (typeof orderId === 'number') {
    await setOrderIntegration(
      payload,
      orderId,
      orderPrefix(job.kind),
      orderStatus,
      status === 'expired' ? `Vzdáno: ${error}` : error,
      now,
    ).catch((e) => payload.logger.error(`[integrations] order summary failed: ${String(e)}`))
  }
  if (error) payload.logger.warn(`[integrations] ${job.kind} #${job.id}: ${error}`)
  return { id: job.id, status }
}

export async function processJobs(payload: Payload, ids: number[], now = new Date()) {
  const outcomes: ProcessOutcome[] = []
  // One after another: the rows of one order update the same order row.
  for (const id of ids) {
    try {
      outcomes.push(await processJob(payload, id, now))
    } catch (error) {
      payload.logger.error(`[integrations] job ${id} crashed: ${String(error)}`)
    }
  }
  return outcomes
}

/** Rows that are due (cron): pending/failed with nextAttemptAt ≤ now, or stuck in processing. */
export async function processDueJobs(payload: Payload, now = new Date(), limit = 50) {
  const due = await payload.find({
    collection: 'integration-jobs',
    overrideAccess: true,
    depth: 0,
    limit,
    pagination: false,
    sort: 'nextAttemptAt',
    select: { kind: true },
    where: {
      or: [
        {
          and: [
            { status: { in: ['pending', 'failed'] } },
            { nextAttemptAt: { less_than_equal: now.toISOString() } },
          ],
        },
        {
          and: [
            { status: { equals: 'processing' } },
            { lockedUntil: { less_than: now.toISOString() } },
          ],
        },
      ],
    },
  })
  const outcomes = await processJobs(
    payload,
    due.docs.map((doc) => doc.id as number),
    now,
  )
  return { found: due.docs.length, outcomes }
}

/**
 * Runs work after the HTTP response (Next.js `after()`); outside a Next request (tests, scripts)
 * runs it right away without awaiting. Errors are only logged.
 */
export async function runAfterResponse(payload: Payload, work: () => Promise<unknown>) {
  const safe = () =>
    work().catch((error) => payload.logger.error(`[integrations] ${String(error)}`))
  try {
    const { after } = await import('next/server')
    after(safe)
  } catch {
    void safe()
  }
}
