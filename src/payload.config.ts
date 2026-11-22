import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { cs } from '@payloadcms/translations/languages/cs'
import { en } from '@payloadcms/translations/languages/en'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { Articles } from './collections/Articles'
import { Categories } from './collections/Categories'
import { Cuts, MeatTypes, Origins, ShelfLives, Usages } from './collections/codeLists'
import { Locations } from './collections/Locations'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Products } from './collections/Products'
import { Recipes } from './collections/Recipes'
import { Users } from './collections/Users'
import { Settings } from './globals/Settings'
import { migrations } from './migrations'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL || '',
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    meta: {
      titleSuffix: '– Terrys.cz',
    },
  },
  // Admin UI language: Czech by default, English kept as a secondary option.
  // Payload picks the language from the user's saved preference or the browser,
  // and falls back to Czech when the browser language is not supported.
  i18n: {
    supportedLanguages: { cs, en },
    fallbackLanguage: 'cs',
  },
  // The order here is also the order in the admin sidebar (groups: Katalog, Číselníky, Obsah,
  // Nastavení).
  collections: [
    // Katalog
    Products,
    Categories,
    // Číselníky
    Cuts,
    Origins,
    MeatTypes,
    Usages,
    ShelfLives,
    // Obsah
    Articles,
    Recipes,
    Pages,
    Media,
    // Nastavení
    Locations,
    Users,
  ],
  globals: [Settings],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    // In development (`pnpm dev`) Payload pushes schema changes automatically.
    // For CI and production the schema is created by migrations in src/migrations.
    migrationDir: path.resolve(dirname, 'migrations'),
    prodMigrations: migrations,
  }),
  sharp,
  plugins: [],
})
