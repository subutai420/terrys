import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { asc, sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import {
  buildPostcodeCsv,
  type CsvError,
  parsePostcodeCsv,
  planPostcodeImport,
  type StoredPostcode,
} from '@/lib/delivery/postcodeCsv'

/**
 * Postcode CSV import/export against the database.
 *
 * ~15 000 rows are too many for one-by-one `payload.create()` calls inside one HTTP request,
 * so the import writes in batches of 1 000 rows with a single SQL statement each, through the
 * Drizzle instance Payload's Postgres adapter exposes (`payload.db.drizzle`, documented).
 * The postcodes collection has no hooks or versions, so nothing is skipped by doing that.
 */

export type PostcodeImportSummary = {
  created: number
  updated: number
  unchanged: number
  /** Duplicate rows in the file (the first occurrence of a PSČ wins). */
  skipped: number
  errors: CsvError[]
  /** Total number of errors (only the first 100 are listed in `errors`). */
  errorCount: number
}

const BATCH_SIZE = 1000
const MAX_LISTED_ERRORS = 100

function postcodesTable(payload: Payload) {
  const db = payload.db as unknown as PostgresAdapter
  return { drizzle: db.drizzle, table: db.tables.postcodes }
}

async function loadAll(payload: Payload): Promise<StoredPostcode[]> {
  const { drizzle, table } = postcodesTable(payload)
  const rows = await drizzle
    .select({
      code: table.code,
      city: table.city,
      district: table.district,
      deliveryBlocked: table.deliveryBlocked,
    })
    .from(table)
    .orderBy(asc(table.code))
  return (rows as StoredPostcode[]).map((r) => ({
    ...r,
    deliveryBlocked: Boolean(r.deliveryBlocked),
  }))
}

export async function importPostcodesCsv(
  payload: Payload,
  text: string,
  options: { createOnly?: boolean } = {},
): Promise<PostcodeImportSummary> {
  const parsed = parsePostcodeCsv(text)
  const existing = new Map((await loadAll(payload)).map((p) => [p.code, p]))
  const plan = planPostcodeImport(parsed.rows, existing, options)

  const { drizzle, table } = postcodesTable(payload)
  const upserts = [...plan.toCreate, ...plan.toUpdate]
  if (upserts.length) {
    const now = new Date().toISOString()
    await drizzle.transaction(async (tx) => {
      for (let i = 0; i < upserts.length; i += BATCH_SIZE) {
        const batch = upserts.slice(i, i + BATCH_SIZE)
        await tx
          .insert(table)
          .values(batch.map((p) => ({ ...p, createdAt: now, updatedAt: now })))
          .onConflictDoUpdate({
            target: table.code,
            set: {
              city: sql.raw(`excluded."${table.city.name}"`),
              district: sql.raw(`excluded."${table.district.name}"`),
              deliveryBlocked: sql.raw(`excluded."${table.deliveryBlocked.name}"`),
              updatedAt: now,
            },
          })
      }
    })
  }

  return {
    created: plan.toCreate.length,
    updated: plan.toUpdate.length,
    unchanged: plan.unchanged,
    skipped: parsed.duplicates,
    errors: parsed.errors.slice(0, MAX_LISTED_ERRORS),
    errorCount: parsed.errors.length,
  }
}

export async function exportPostcodesCsv(payload: Payload): Promise<string> {
  return buildPostcodeCsv(await loadAll(payload))
}
