#!/usr/bin/env node
/**
 * Stage 9: copy uploaded images from the local `media/` folder to Vercel Blob.
 *
 * When is this needed? Only if the catalog was imported into a LOCAL database (with images in
 * `media/`) and that database was then copied to Neon (pg_dump/pg_restore). If the import runs
 * directly against the production database WITH `BLOB_READ_WRITE_TOKEN` set, Payload uploads the
 * images to Blob itself and this script is not needed (docs/spusteni.md).
 *
 * It reads the file names from the `media` table of the given database (original + every
 * generated size) and uploads each existing local file under exactly that name – the name the
 * Payload Vercel Blob adapter uses (collection without prefix, no random suffix), so the stored
 * URLs keep working. DRY RUN by default; `--confirm` uploads. Existing blobs are skipped.
 *
 *   pnpm media:upload-blob -- --url="postgres://…(direct Neon url)" [--dir=media] [--confirm]
 *   needs BLOB_READ_WRITE_TOKEN in the environment (Vercel → Storage → the Blob store → .env.local)
 */
import 'dotenv/config'

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { head, put } from '@vercel/blob'
import pg from 'pg'

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=')
    return [key, rest.join('=') || 'true']
  }),
)
const url = args.url || process.env.DATABASE_URL
const dir = path.resolve(args.dir || 'media')
const token = process.env.BLOB_READ_WRITE_TOKEN
const confirm = args.confirm === 'true'

if (!url) {
  console.error('Pass --url=<database url> (or set DATABASE_URL).')
  process.exit(1)
}
if (confirm && !token) {
  console.error('BLOB_READ_WRITE_TOKEN is not set.')
  process.exit(1)
}

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
}

const client = new pg.Client({ connectionString: url })
await client.connect()
const columns = await client.query(
  "SELECT column_name FROM information_schema.columns WHERE table_name = 'media' AND (column_name = 'filename' OR column_name LIKE 'sizes\\_%\\_filename')",
)
const names = columns.rows.map((row) => `"${row.column_name}"`)
const rows = await client.query(`SELECT ${names.join(', ')} FROM media`)
await client.end()

const files = new Set()
for (const row of rows.rows)
  for (const value of Object.values(row)) if (value) files.add(String(value))

let missing = 0
let uploaded = 0
let skipped = 0
let failed = 0
console.log(
  `${rows.rowCount} media records, ${files.size} files referenced. ${confirm ? 'UPLOADING' : 'DRY RUN (add --confirm to upload)'}`,
)
for (const name of [...files].sort()) {
  const local = path.join(dir, name)
  if (!existsSync(local)) {
    missing += 1
    console.log(`  missing locally: ${name}`)
    continue
  }
  if (!confirm) continue
  try {
    try {
      await head(name, { token })
      skipped += 1
      continue
    } catch {
      // not there yet → upload
    }
    await put(name, readFileSync(local), {
      access: 'public',
      addRandomSuffix: false,
      contentType: MIME[path.extname(name).toLowerCase()] || 'application/octet-stream',
      cacheControlMaxAge: 365 * 24 * 60 * 60,
      token,
    })
    uploaded += 1
    if (uploaded % 50 === 0) console.log(`  … ${uploaded} uploaded`)
  } catch (error) {
    failed += 1
    console.log(`  ✗ ${name}: ${error.message}`)
  }
}
console.log(
  `Done. referenced ${files.size}, missing locally ${missing}` +
    (confirm ? `, uploaded ${uploaded}, already there ${skipped}, failed ${failed}` : ''),
)
process.exit(failed ? 1 : 0)
