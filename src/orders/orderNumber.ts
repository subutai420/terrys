import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

/**
 * Human-friendly sequential order numbers ("100001", "100002", …), race-safe.
 *
 * A PostgreSQL SEQUENCE hands out each number exactly once, even when many orders arrive at the
 * same moment (no "SELECT max + 1" race). A number can be skipped (a failed insert consumes it),
 * which is fine for orders; invoices (stage 5) need their own gap-free numbering.
 *
 * The sequence is created by the migration `…_orders` (starts at 100001). Databases built by the
 * dev schema push (`pnpm dev`) do not run migrations, so it is created on first use there too.
 * To start elsewhere: `ALTER SEQUENCE order_number_seq RESTART WITH 200001;`
 */
export const ORDER_NUMBER_SEQUENCE = 'order_number_seq'
export const ORDER_NUMBER_START = 100001

function db(payload: Payload) {
  return (payload.db as unknown as PostgresAdapter).drizzle
}

async function next(payload: Payload): Promise<string> {
  const result = await db(payload).execute(sql`SELECT nextval('order_number_seq') AS value`)
  const rows = (result as unknown as { rows: { value: string | number }[] }).rows
  return String(rows[0].value)
}

export async function nextOrderNumber(payload: Payload): Promise<string> {
  try {
    return await next(payload)
  } catch (error) {
    // 42P01 = undefined table/sequence (schema created by dev push, not by migrations).
    const code =
      (error as { code?: string; cause?: { code?: string } }).code ??
      (error as { cause?: { code?: string } }).cause?.code
    if (code !== '42P01') throw error
    try {
      await db(payload).execute(
        sql.raw(
          `CREATE SEQUENCE IF NOT EXISTS ${ORDER_NUMBER_SEQUENCE} START WITH ${ORDER_NUMBER_START}`,
        ),
      )
    } catch {
      // Another request created it at the same moment – fine.
    }
    return next(payload)
  }
}
