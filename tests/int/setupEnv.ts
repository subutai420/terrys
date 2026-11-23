import { inject } from 'vitest'

/**
 * Runs before EVERY integration test file, before the file's own imports are evaluated.
 *
 * `payload.config.ts` reads DATABASE_URL when it is first imported. A test file that imports a
 * module which itself imports `@payload-config` at the top (e.g. `src/feeds/generate.ts`) loads the
 * config before `getTestPayload()` can switch DATABASE_URL to the throwaway database – Payload then
 * connected to the database named in DATABASE_URL (the dev database locally, the `terrys` database
 * in CI) and dev-pushed its schema there. In CI the following `pnpm payload migrate` then stopped at
 * the "you've run Payload in dev mode" prompt (no terminal) and exited with code 13.
 *
 * Pointing DATABASE_URL at the throwaway database here makes the import order irrelevant.
 */
process.env.DATABASE_URL = inject('intDatabaseUrl')
process.env.PAYLOAD_SECRET ||= 'int-test-only-not-a-real-secret'
