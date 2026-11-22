/**
 * `pnpm seed` – fills the database with starter data (see `seed.ts`).
 *
 * Run through the Payload CLI (`payload run src/seed/index.ts`), which loads `.env`.
 * Safe to run repeatedly: existing items are kept, only missing ones are created.
 *
 * Safety: refuses to run when NODE_ENV=production, unless SEED_FORCE=1 is set.
 *
 * Optional: when SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are set and the database has no users
 * yet, an administrator account is created with these credentials (handy for a fresh local
 * database). Otherwise create the first user in the browser at /admin.
 *
 * `--only=catalog,content,locations,settings,delivery,orders` runs only some parts, e.g. on the database
 * with the imported catalog: `pnpm seed --only=settings,locations,delivery`.
 * The database schema must exist (run `pnpm dev` once, or `pnpm payload migrate`).
 */
import { parseArgs } from '@/migration/args'

import { seed, SEED_PARTS, type SeedPart } from './seed'

// `pnpm seed --only=settings,locations,delivery` runs only some parts (see SEED_PARTS).
const onlyArg = parseArgs(process.argv.slice(2)).string('only')
const only = onlyArg
  ? onlyArg
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
  : []
const unknownParts = only.filter((part) => !(SEED_PARTS as readonly string[]).includes(part))
if (unknownParts.length) {
  console.error(
    `Neznámá část seedu: ${unknownParts.join(', ')}. Povolené: ${SEED_PARTS.join(', ')}.`,
  )
  process.exit(1)
}

if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== '1') {
  console.error(
    'Seed odmítnut: NODE_ENV=production. Pokud opravdu chcete plnit produkční databázi, ' +
      'spusťte příkaz s proměnnou SEED_FORCE=1.',
  )
  process.exit(1)
}

// Never let Payload's development "schema push" change the database from the seed: the schema
// comes from `pnpm dev` (local development database) or from migrations (`pnpm payload migrate`,
// CI and the imported-catalog database). Without this the seed would mark a migrated database
// as "dev-pushed". The config is imported only after setting the switch.
process.env.PAYLOAD_MIGRATING = 'true'
const { getPayload } = await import('payload')
const { default: config } = await import('@payload-config')
const payload = await getPayload({ config })

const adminEmail = process.env.SEED_ADMIN_EMAIL
const adminPassword = process.env.SEED_ADMIN_PASSWORD
if (adminEmail && adminPassword) {
  const { totalDocs } = await payload.count({ collection: 'users' })
  if (totalDocs === 0) {
    await payload.create({
      collection: 'users',
      data: { email: adminEmail, password: adminPassword, role: 'admin', name: 'Administrátor' },
    })
    payload.logger.info(`Vytvořen administrátor ${adminEmail}`)
  }
}

await seed(payload, undefined, { only: only as SeedPart[] })
// The Payload CLI closes the database connection and exits after this script finishes.
