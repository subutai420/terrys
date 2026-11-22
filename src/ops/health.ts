import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { migrations } from '@/migrations'

/**
 * Stage 9: health check for an uptime monitor (`GET /api/health`).
 *
 * Reports ONLY counts and yes/no facts – no secrets, no personal data, no environment details:
 * - database reachable (+ latency),
 * - every migration from `src/migrations` applied (names of pending ones = public code anyway),
 * - marketing outbox (`integration-jobs`): failed / expired / stuck rows,
 * - e-mails that failed in the last 7 days (orders, withdrawals).
 *
 * HTTP 200 when the shop can take orders (database up, schema current) – `status` is then "ok"
 * or "degraded" (something needs a look, see `problems`); HTTP 503 = "down".
 * Uptime monitor: watch for HTTP 200 (and optionally the keyword `"status":"ok"`).
 */

export type HealthReport = {
  status: 'ok' | 'degraded' | 'down'
  checkedAt: string
  database: { ok: boolean; latencyMs: number | null }
  migrations: { ok: boolean; expected: number; applied: number; pending: string[] }
  integrationJobs: { pending: number; failed: number; expired: number; stuck: number } | null
  emails: { failedOrders7d: number; failedWithdrawals7d: number } | null
  problems: string[]
}

type Counts = {
  appliedMigrations: string[]
  jobs: { pending: number; failed: number; expired: number; stuck: number }
  emails: { failedOrders7d: number; failedWithdrawals7d: number }
}

/** Configuration facts derived from env (names of problems only are published). */
export type ConfigFacts = {
  production: boolean
  onVercel: boolean
  resend: boolean
  emailFrom: boolean
  cronSecret: boolean
  blobStorage: boolean
}

export function configFacts(env: Record<string, string | undefined>): ConfigFacts {
  return {
    production: env.NODE_ENV === 'production' && (env.VERCEL_ENV ?? 'production') === 'production',
    onVercel: env.VERCEL === '1',
    resend: Boolean(env.RESEND_API_KEY),
    emailFrom: Boolean(env.EMAIL_FROM_ADDRESS),
    cronSecret: Boolean(env.CRON_SECRET),
    blobStorage: Boolean(env.BLOB_READ_WRITE_TOKEN),
  }
}

/** Pure: raw facts → report (unit-tested). */
export function summariseHealth(input: {
  now: Date
  dbOk: boolean
  latencyMs: number | null
  expectedMigrations: string[]
  counts: Counts | null
  config?: ConfigFacts
}): HealthReport {
  const { now, dbOk, latencyMs, expectedMigrations, counts, config } = input
  const applied = new Set(counts?.appliedMigrations ?? [])
  const pending = dbOk ? expectedMigrations.filter((name) => !applied.has(name)) : []
  const migrationsOk = dbOk && pending.length === 0
  const problems: string[] = []
  if (!dbOk) problems.push('database-unreachable')
  if (dbOk && pending.length) problems.push('migrations-pending')
  if (counts) {
    // A failed row is retried automatically; only expired (gave up) or stuck rows need a person.
    if (counts.jobs.expired > 0) problems.push('integration-jobs-expired')
    if (counts.jobs.stuck > 0) problems.push('integration-jobs-stuck')
    if (counts.emails.failedOrders7d > 0) problems.push('order-emails-failed')
    if (counts.emails.failedWithdrawals7d > 0) problems.push('withdrawal-emails-failed')
  }
  if (config) {
    // Misconfiguration that silently loses e-mails, images or retries on the live shop.
    if (config.production && !config.resend) problems.push('email-provider-missing')
    if (config.resend && !config.emailFrom) problems.push('email-from-missing')
    if (config.onVercel && !config.blobStorage) problems.push('media-storage-not-persistent')
    if (config.production && !config.cronSecret) problems.push('cron-secret-missing')
  }
  const status: HealthReport['status'] = !migrationsOk
    ? 'down'
    : problems.length
      ? 'degraded'
      : 'ok'
  return {
    status,
    checkedAt: now.toISOString(),
    database: { ok: dbOk, latencyMs },
    migrations: {
      ok: migrationsOk,
      expected: expectedMigrations.length,
      applied: counts?.appliedMigrations.length ?? 0,
      pending,
    },
    integrationJobs: counts?.jobs ?? null,
    emails: counts?.emails ?? null,
    problems,
  }
}

const num = (value: unknown) => Number(value ?? 0) || 0

async function readCounts(payload: Payload): Promise<Counts> {
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const rows = <T>(result: unknown) => ((result as { rows?: T[] }).rows ?? []) as T[]

  const appliedMigrations = rows<{ name: string }>(
    await db.execute(sql`SELECT name FROM payload_migrations WHERE name IS NOT NULL`),
  ).map((row) => row.name)

  const [jobs] = rows<Record<string, unknown>>(
    await db.execute(sql`SELECT
      count(*) FILTER (WHERE status = 'pending') AS pending,
      count(*) FILTER (WHERE status = 'failed') AS failed,
      count(*) FILTER (WHERE status = 'expired' AND updated_at > now() - interval '30 days') AS expired,
      count(*) FILTER (WHERE (status = 'processing' AND (locked_until IS NULL OR locked_until < now() - interval '15 minutes'))
                         OR (status = 'pending' AND created_at < now() - interval '1 hour')) AS stuck
      FROM integration_jobs`),
  )
  const [orders] = rows<Record<string, unknown>>(
    await db.execute(sql`SELECT count(*) AS n FROM orders
      WHERE created_at > now() - interval '7 days'
        AND (emails_customer_status = 'failed' OR emails_shop_status = 'failed')`),
  )
  const [withdrawals] = rows<Record<string, unknown>>(
    await db.execute(sql`SELECT count(*) AS n FROM withdrawals
      WHERE created_at > now() - interval '7 days' AND confirmation_status = 'failed'`),
  )
  return {
    appliedMigrations,
    jobs: {
      pending: num(jobs?.pending),
      failed: num(jobs?.failed),
      expired: num(jobs?.expired),
      stuck: num(jobs?.stuck),
    },
    emails: { failedOrders7d: num(orders?.n), failedWithdrawals7d: num(withdrawals?.n) },
  }
}

export async function checkHealth(payload: Payload, now = new Date()): Promise<HealthReport> {
  const expectedMigrations = migrations.map((migration) => migration.name)
  const started = Date.now()
  try {
    const db = (payload.db as unknown as PostgresAdapter).drizzle
    await db.execute(sql`SELECT 1`)
    const latencyMs = Date.now() - started
    let counts: Counts | null = null
    try {
      counts = await readCounts(payload)
    } catch (error) {
      // Tables missing = schema not migrated: reported as pending migrations ("down").
      payload.logger.error(`[health] counts failed: ${String(error).slice(0, 300)}`)
    }
    return summariseHealth({
      now,
      dbOk: true,
      latencyMs,
      expectedMigrations,
      counts,
      config: configFacts(process.env),
    })
  } catch (error) {
    payload.logger.error(`[health] check failed: ${String(error).slice(0, 300)}`)
    return summariseHealth({ now, dbOk: false, latencyMs: null, expectedMigrations, counts: null })
  }
}
