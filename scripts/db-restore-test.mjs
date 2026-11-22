#!/usr/bin/env node
/**
 * Stage 9: restore test – proves that a backup file can really be restored.
 *
 * 1. creates a NEW empty database `terrys_restore_test_<time>` on the target server,
 * 2. restores the dump into it (pg_restore),
 * 3. compares the row count of every table with the source database,
 * 4. drops the test database again (unless --keep).
 * Never writes into the source database or any existing database.
 *
 *   pnpm db:restore-test -- --dump=backups/terrys-….dump --source=postgres://…/terrys
 *   options: --target=postgres://…/postgres (server for the test DB; default = source server)
 *            --docker=terrys-postgres-1 (run pg_restore inside the local container)
 *            --keep (leave the restored database for inspection)
 *
 * Exit code 0 = every table has the same number of rows, 1 = differences (listed) or an error.
 * Comparing against a LIVE production database can show small differences (new orders after the
 * dump); compare against the database the dump was taken from, right after taking it.
 */
import 'dotenv/config'

import { spawn } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'

import pg from 'pg'

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=')
    return [key, rest.join('=') || 'true']
  }),
)

const dump = args.dump
const source = args.source || process.env.DATABASE_URL
if (!dump || !existsSync(dump) || !source) {
  console.error('Usage: --dump=<file.dump> --source=<postgres url of the database it came from>')
  process.exit(1)
}
const target = new URL(args.target || source)
const testDb = `terrys_restore_test_${Date.now()}`
const adminUrl = new URL(target)
adminUrl.pathname = '/postgres'
const testUrl = new URL(target)
testUrl.pathname = `/${testDb}`

async function query(url, sql) {
  const client = new pg.Client({ connectionString: url.toString() })
  await client.connect()
  try {
    return await client.query(sql)
  } finally {
    await client.end()
  }
}

async function tableCounts(url) {
  const tables = await query(
    url,
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  )
  const counts = {}
  for (const { tablename } of tables.rows) {
    const result = await query(url, `SELECT count(*)::int AS n FROM "public"."${tablename}"`)
    counts[tablename] = result.rows[0].n
  }
  return counts
}

function restore() {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    let command
    let commandArgs
    if (args.docker) {
      env.PGPASSWORD = decodeURIComponent(testUrl.password)
      command = 'docker'
      commandArgs = [
        'exec',
        '-i',
        '-e',
        'PGPASSWORD',
        args.docker,
        'pg_restore',
        '--no-owner',
        '--no-acl',
        '--exit-on-error',
        '-U',
        decodeURIComponent(testUrl.username),
        '-d',
        testDb,
      ]
    } else {
      command = 'pg_restore'
      commandArgs = ['--no-owner', '--no-acl', '--exit-on-error', '-d', testUrl.toString()]
    }
    const child = spawn(command, commandArgs, { env, stdio: ['pipe', 'inherit', 'inherit'] })
    createReadStream(dump).pipe(child.stdin)
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`pg_restore exit ${code}`)),
    )
  })
}

let failed = false
try {
  console.log(`Creating test database ${testDb} on ${target.hostname}…`)
  await query(adminUrl, `CREATE DATABASE "${testDb}"`)
  console.log(`Restoring ${dump}…`)
  const started = Date.now()
  await restore()
  console.log(`Restored in ${((Date.now() - started) / 1000).toFixed(1)} s. Comparing row counts…`)
  const [expected, actual] = await Promise.all([tableCounts(new URL(source)), tableCounts(testUrl)])
  const names = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()
  let total = 0
  for (const name of names) {
    const a = expected[name]
    const b = actual[name]
    total += b ?? 0
    if (a !== b) {
      failed = true
      console.log(`  ✗ ${name}: source ${a ?? 'missing'}, restored ${b ?? 'missing'}`)
    }
  }
  console.log(
    failed
      ? `✗ Differences found (${names.length} tables).`
      : `✓ ${names.length} tables, ${total} rows – identical row counts.`,
  )
} catch (error) {
  failed = true
  console.error(`✗ Restore test failed: ${error.message}`)
} finally {
  if (args.keep) {
    console.log(`Kept database ${testDb} (drop it yourself when done).`)
  } else {
    await query(adminUrl, `DROP DATABASE IF EXISTS "${testDb}" WITH (FORCE)`).catch((error) =>
      console.error(`Could not drop ${testDb}: ${error.message}`),
    )
    console.log(`Dropped ${testDb}.`)
  }
}
process.exit(failed ? 1 : 0)
