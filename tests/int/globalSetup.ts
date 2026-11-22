import 'dotenv/config'

import pg from 'pg'
import type { TestProject } from 'vitest/node'

/**
 * Creates a fresh, empty PostgreSQL database for the integration tests and drops it afterwards.
 * Uses the server from DATABASE_URL (local Docker or the CI service container), but never the
 * database named there, so development data is never touched.
 */

declare module 'vitest' {
  export interface ProvidedContext {
    intDatabaseUrl: string
  }
}

export default async function setup(project: TestProject) {
  const baseUrl = process.env.DATABASE_URL
  if (!baseUrl) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and start the database.')
  }

  const dbName = `terrys_int_${Date.now()}`
  const adminUrl = new URL(baseUrl)
  adminUrl.pathname = '/postgres'
  const testUrl = new URL(baseUrl)
  testUrl.pathname = `/${dbName}`

  const run = async (sql: string) => {
    const client = new pg.Client({ connectionString: adminUrl.toString() })
    await client.connect()
    try {
      await client.query(sql)
    } finally {
      await client.end()
    }
  }

  await run(`CREATE DATABASE "${dbName}"`)
  project.provide('intDatabaseUrl', testUrl.toString())

  return async () => {
    // FORCE closes connections that Payload may still hold open.
    await run(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`)
  }
}
