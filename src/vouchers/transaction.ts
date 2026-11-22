import { sql } from '@payloadcms/db-postgres/drizzle'
import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
  type PayloadRequest,
} from 'payload'

/**
 * Database transaction helpers for the voucher services (stage 7).
 *
 * Payload runs every local-API call that receives the same `req` inside the transaction stored on
 * that request (`req.transactionID`). `withTransaction` starts one (or joins the caller's),
 * commits when the callback succeeds and rolls everything back when it throws – so "mark paid"
 * or "redeem" can never half-happen (order updated, voucher not).
 */
export async function withTransaction<T>(
  payload: Payload,
  user: { id: number; role?: string | null; email?: string | null } | null,
  existingReq: PayloadRequest | undefined,
  fn: (req: PayloadRequest) => Promise<T>,
): Promise<T> {
  const req =
    existingReq ??
    (await createLocalReq(user ? { user: { ...user, collection: 'users' } as never } : {}, payload))
  const started = await initTransaction(req)
  try {
    const result = await fn(req)
    if (started) await commitTransaction(req)
    return result
  } catch (error) {
    if (started) await killTransaction(req)
    throw error
  }
}

type DrizzleLike = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }

/** The drizzle handle of the request's transaction (or the pool outside a transaction). */
async function dbFor(payload: Payload, req: PayloadRequest): Promise<DrizzleLike> {
  const adapter = payload.db as unknown as {
    drizzle: DrizzleLike
    sessions: Record<string, { db: DrizzleLike } | undefined>
  }
  const id = req.transactionID ? await req.transactionID : null
  return (id && adapter.sessions[String(id)]?.db) || adapter.drizzle
}

/**
 * Row locks (`SELECT … FOR UPDATE`) on vouchers inside the current transaction: a second request
 * redeeming the same voucher waits until the first one committed and then reads the NEW balance.
 * This is what makes two simultaneous redemptions unable to overspend a voucher.
 */
export async function lockVouchers(
  payload: Payload,
  req: PayloadRequest,
  ids: number[],
): Promise<void> {
  const unique = [...new Set(ids)].filter((id) => Number.isInteger(id)).sort((a, b) => a - b)
  if (!unique.length) return
  const db = await dbFor(payload, req)
  await db.execute(
    sql`SELECT id FROM vouchers WHERE id IN (${sql.join(
      unique.map((id) => sql`${id}`),
      sql`, `,
    )}) ORDER BY id FOR UPDATE`,
  )
}

/** Lock of the order row (payment marking: two clicks must not both send the e-mail). */
export async function lockOrder(payload: Payload, req: PayloadRequest, id: number): Promise<void> {
  const db = await dbFor(payload, req)
  await db.execute(sql`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`)
}
