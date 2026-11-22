#!/usr/bin/env node
/**
 * Stage 9: build command on Vercel (`vercel.json` → "buildCommand": "pnpm build:vercel").
 *
 * 1. Applies database migrations (`payload migrate`) through Neon's DIRECT connection
 *    (`PAYLOAD_DB_DIRECT=1` → `DATABASE_URL_UNPOOLED`, see src/payload.config.ts). If a migration
 *    fails, the build fails and the previous deployment stays live (nothing half-deployed).
 * 2. Runs `next build` (it reads the database: the storefront is pre-rendered from it).
 *
 * Safety for PREVIEW deployments (every pushed branch): a branch with a new migration must never
 * change the PRODUCTION database. Migrations therefore run on preview only with
 * `MIGRATE_ON_PREVIEW=1`, which you set (Vercel → Settings → Environment Variables → Preview)
 * once the Neon integration gives every preview its own database branch. Without it the preview
 * build skips the migration (and fails if the code needs a newer schema – which is the safe
 * outcome).
 *
 * Plain Node, no dependencies; prints what it does.
 */
import { spawnSync } from 'node:child_process'

const env = process.env.VERCEL_ENV || 'local'

function run(command, extraEnv = {}) {
  console.log(`\n> ${command}`)
  const result = spawnSync(command, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...extraEnv },
  })
  if (result.status !== 0) {
    console.error(`\n✗ "${command}" failed (exit ${result.status}).`)
    process.exit(result.status ?? 1)
  }
}

const migrate =
  env === 'production' || (env === 'preview' && process.env.MIGRATE_ON_PREVIEW === '1')

if (migrate) {
  if (!process.env.DATABASE_URL_UNPOOLED) {
    console.warn(
      '! DATABASE_URL_UNPOOLED is not set – migrating through DATABASE_URL. With Neon use the ' +
        'direct (non "-pooler") connection for migrations.',
    )
  }
  run('pnpm payload migrate', { PAYLOAD_DB_DIRECT: '1' })
} else {
  console.log(
    `Skipping database migrations (VERCEL_ENV=${env}; on preview set MIGRATE_ON_PREVIEW=1 when ` +
      'each preview has its own Neon branch).',
  )
}

run('pnpm build')
