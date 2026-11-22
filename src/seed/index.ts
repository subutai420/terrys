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
 */
import { getPayload } from 'payload'

import config from '@payload-config'

import { seed } from './seed'

if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== '1') {
  console.error(
    'Seed odmítnut: NODE_ENV=production. Pokud opravdu chcete plnit produkční databázi, ' +
      'spusťte příkaz s proměnnou SEED_FORCE=1.',
  )
  process.exit(1)
}

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

await seed(payload)
// The Payload CLI closes the database connection and exits after this script finishes.
