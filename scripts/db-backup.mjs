#!/usr/bin/env node
/**
 * Stage 9: database backup to a file (pg_dump, custom format). READ-ONLY on the database.
 *
 *   pnpm db:backup                                  # DATABASE_URL from .env, pg_dump on this PC
 *   pnpm db:backup -- --url="postgres://…"          # another database (Neon: the DIRECT url)
 *   pnpm db:backup -- --docker=terrys-postgres-1    # use pg_dump inside the local Docker container
 *   pnpm db:backup -- --out=D:\zalohy               # output folder (default ./backups, git-ignored)
 *
 * Neon: use the direct connection (host WITHOUT "-pooler", Vercel variable DATABASE_URL_UNPOOLED)
 * and a pg_dump whose major version is >= the server's (Neon docs: "Always use a direct
 * (unpooled) connection string"; https://neon.com/docs/manage/backup-pg-dump, read 2026-11-22).
 * Neon's point-in-time restore is the PRIMARY backup; this file is the extra copy kept outside
 * Neon (e.g. before a launch, a big import or a risky migration). Contains personal data:
 * store it encrypted / in a private place and delete old copies (docs/provoz.md).
 */
import 'dotenv/config'

import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=')
    return [key, rest.join('=') || 'true']
  }),
)

const url = args.url || process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL
if (!url) {
  console.error('No database: pass --url=… or set DATABASE_URL.')
  process.exit(1)
}
const parsed = new URL(url)
const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, '')) || 'postgres'
const outDir = path.resolve(args.out || 'backups')
mkdirSync(outDir, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const file = path.join(outDir, `${dbName}-${stamp}.dump`)

let command
let commandArgs
const env = { ...process.env }
if (args.docker) {
  // Inside the container the server listens on its own port 5432.
  env.PGPASSWORD = decodeURIComponent(parsed.password)
  command = 'docker'
  commandArgs = [
    'exec',
    '-e',
    'PGPASSWORD',
    args.docker,
    'pg_dump',
    '-Fc',
    '--no-owner',
    '--no-acl',
    '-U',
    decodeURIComponent(parsed.username),
    '-d',
    dbName,
  ]
} else {
  command = 'pg_dump'
  commandArgs = ['-Fc', '--no-owner', '--no-acl', '-d', url]
}

console.log(`Backing up database "${dbName}" on ${parsed.hostname} → ${file}`)
const out = createWriteStream(file)
const child = spawn(command, commandArgs, { env, stdio: ['ignore', 'pipe', 'inherit'] })
child.stdout.pipe(out)
child.on('error', (error) => {
  console.error(`Could not start ${command}: ${error.message}`)
  console.error('Install the PostgreSQL client tools, or use --docker=<container> locally.')
  process.exit(1)
})
child.on('close', (code) => {
  out.close(() => {
    if (code !== 0) {
      console.error(`pg_dump failed (exit ${code}); the file is incomplete: ${file}`)
      process.exit(code ?? 1)
    }
    const size = statSync(file).size
    console.log(`Done: ${(size / 1024 / 1024).toFixed(2)} MB`)
  })
})
