import { postgresAdapter } from '@payloadcms/db-postgres'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
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
import { DeliveryExceptions } from './collections/DeliveryExceptions'
import { DeliveryZones } from './collections/DeliveryZones'
import { IntegrationJobs } from './collections/IntegrationJobs'
import { Locations } from './collections/Locations'
import { Media } from './collections/Media'
import { OrderAuditLog } from './collections/OrderAuditLog'
import { Orders } from './collections/Orders'
import { Pages } from './collections/Pages'
import { Postcodes } from './collections/Postcodes'
import { Products } from './collections/Products'
import { Recipes } from './collections/Recipes'
import { Redirects } from './collections/Redirects'
import { ShippingMethods } from './collections/ShippingMethods'
import { Users } from './collections/Users'
import { VoucherBatches } from './collections/VoucherBatches'
import { Vouchers } from './collections/Vouchers'
import { Withdrawals } from './collections/Withdrawals'
import { deliveryOptionsEndpoint } from './delivery/optionsEndpoint'
import { createEmailAdapter } from './email/adapter'
import { fulfilmentEndpoints } from './fulfilment/endpoints'
import { Homepage } from './globals/Homepage'
import { Marketing } from './globals/Marketing'
import { Settings } from './globals/Settings'
import { integrationEndpoints } from './integrations/endpoints'
import { migrations } from './migrations'
import { opsEndpoints } from './ops/endpoints'
import { checkoutEndpoints } from './orders/endpoints'
import { privacyEndpoints } from './privacy/endpoints'
import { legacyRedirectIndexEndpoint } from './redirects/endpoints'
import { voucherEndpoints } from './vouchers/endpoints'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Stage 9: connection string. `DATABASE_URL` everywhere; `PAYLOAD_DB_DIRECT=1` (set only by the
 * migration step of `pnpm build:vercel`) switches to `DATABASE_URL_UNPOOLED` – Neon's direct
 * connection, which Neon recommends for schema migrations (the pooled one runs PgBouncer in
 * transaction mode). The Neon ↔ Vercel integration creates both variables.
 */
function databaseUrl(): string {
  if (process.env.PAYLOAD_DB_DIRECT === '1' && process.env.DATABASE_URL_UNPOOLED) {
    return process.env.DATABASE_URL_UNPOOLED
  }
  return process.env.DATABASE_URL || ''
}

function runMigrationsOnStart(): boolean {
  if (process.env.PAYLOAD_PROD_MIGRATIONS === '1') return true
  if (process.env.PAYLOAD_PROD_MIGRATIONS === '0') return false
  return process.env.VERCEL !== '1'
}
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
    components: {
      // Stage 2: "Kalendář doručování" – month overview of delivery days for a postcode.
      views: {
        deliveryCalendar: {
          Component: '/components/admin/DeliveryCalendarView#DeliveryCalendarView',
          path: '/kalendar-doruceni',
        },
        // Stage 5: fulfilment screens (src/components/admin/fulfilment).
        expedice: {
          Component: '/components/admin/fulfilment/ExpediceView#ExpediceView',
          path: '/expedice',
        },
        weighing: {
          Component: '/components/admin/fulfilment/WeighView#WeighView',
          path: '/vazeni/:id',
        },
        orderFulfilment: {
          Component: '/components/admin/fulfilment/OrderFulfilmentView#OrderFulfilmentView',
          path: '/vyrizeni/:id',
        },
        // Stage 7: pairing bank payments of electronic vouchers, voucher lookup, old vouchers.
        voucherPayments: {
          Component: '/components/admin/vouchers/VoucherPaymentsView#VoucherPaymentsView',
          path: '/poukazy-platby',
        },
        // Stage 9: GDPR export + anonymisation (admin only).
        privacy: {
          Component: '/components/admin/privacy/PrivacyView#PrivacyView',
          path: '/osobni-udaje',
        },
      },
      // Stage 5: own "Objednávky" nav group (Expedice + the order collections, which have
      // `admin.group: false`) and the "Dnes" panel on the admin home.
      beforeNavLinks: [
        '/components/admin/fulfilment/OrdersNavGroup#OrdersNavGroup',
        '/components/admin/vouchers/VouchersNavGroup#VouchersNavGroup',
      ],
      beforeDashboard: ['/components/admin/fulfilment/TodayPanel#TodayPanel'],
      afterNavLinks: [
        '/components/admin/DeliveryCalendarNavLink#DeliveryCalendarNavLink',
        '/components/admin/privacy/PrivacyNavLink#PrivacyNavLink',
      ],
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
  // Doručování, Nastavení).
  collections: [
    // Objednávky (stage 4)
    Orders,
    Withdrawals,
    OrderAuditLog,
    // Poukazy (stage 7; custom nav group VouchersNavGroup)
    Vouchers,
    VoucherBatches,
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
    // Doručování
    ShippingMethods,
    DeliveryZones,
    DeliveryExceptions,
    Postcodes,
    // Nastavení
    Locations,
    Users,
    // Stage 8b: redirects of old addresses added by hand (the automatic ones need no records).
    Redirects,
    // Stage 6: outbox of Meta CAPI / Heureka / Ecomail calls.
    IntegrationJobs,
  ],
  // Homepage = editable blocks of the storefront homepage (stage 3).
  // Stage 6: Marketing (consent text version, feed defaults, status of measurement).
  globals: [Homepage, Settings, Marketing],
  // Public endpoint for the cart: GET /api/delivery/options?psc=12000 (src/delivery/).
  // Stage 4: checkout endpoints POST /api/checkout/* (src/orders/endpoints.ts).
  // Stage 5: admin fulfilment endpoints /api/fulfilment/* (src/fulfilment/endpoints.ts).
  // Stage 6: /api/integrations/retry (cron) and /api/marketing/status (admin).
  endpoints: [
    deliveryOptionsEndpoint,
    ...checkoutEndpoints,
    ...fulfilmentEndpoints,
    ...integrationEndpoints,
    // Stage 7: /api/gift-vouchers/* (payments, redemption lookups, PDFs, overdue cron).
    ...voucherEndpoints,
    // Stage 8b: GET /api/legacy-redirects/index – redirect table for src/proxy.ts.
    legacyRedirectIndexEndpoint,
    // Stage 9: GET /api/health (uptime monitor), POST /api/csp-report (CSP violation reports).
    ...opsEndpoints,
    // Stage 9: personal data export / anonymisation (admin only, src/privacy).
    ...privacyEndpoints,
  ],
  // Stage 4: Resend when RESEND_API_KEY is set, otherwise e-mails are only saved to .emails/.
  email: createEmailAdapter(),
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: databaseUrl(),
      // Stage 9: small pool per server instance. On Vercel every warm function instance has its
      // own pool; with Neon's pooled (PgBouncer) connection string many instances × a few
      // connections is fine. DATABASE_POOL_MAX overrides it (default 5).
      max: Number(process.env.DATABASE_POOL_MAX) || 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    },
    // In development (`pnpm dev`) Payload pushes schema changes automatically.
    // For CI and production the schema is created by migrations in src/migrations.
    migrationDir: path.resolve(dirname, 'migrations'),
    // Stage 9: on Vercel the migrations run in the BUILD (`pnpm build:vercel`, see vercel.json),
    // not on every serverless cold start (Payload docs: prodMigrations "should only be used for
    // long-running servers / containers"). Elsewhere (`pnpm start` on a normal server, CI e2e)
    // pending migrations still run when the server starts. PAYLOAD_PROD_MIGRATIONS=0/1 overrides.
    prodMigrations: runMigrationsOnStart() ? migrations : undefined,
  }),
  sharp,
  plugins: [
    // Stage 9: uploads on Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production/preview on
    // Vercel – its function filesystem is not persistent). Without the token (local dev, CI,
    // tests) the plugin does nothing and files stay in /media on the local disk.
    // Image URLs do not change: files are still served through /api/media/file/<name> (Payload
    // streams them from Blob and keeps the collection's access rules), so links, feeds and
    // next/image work the same. clientUploads: the admin uploads big photos straight from the
    // browser to Blob (Vercel functions accept at most 4.5 MB per request).
    vercelBlobStorage({
      enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      token: process.env.BLOB_READ_WRITE_TOKEN || '',
      collections: { media: true },
      clientUploads: true,
    }),
  ],
})
