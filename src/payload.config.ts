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
import { ShippingMethods } from './collections/ShippingMethods'
import { Users } from './collections/Users'
import { Withdrawals } from './collections/Withdrawals'
import { deliveryOptionsEndpoint } from './delivery/optionsEndpoint'
import { createEmailAdapter } from './email/adapter'
import { fulfilmentEndpoints } from './fulfilment/endpoints'
import { Homepage } from './globals/Homepage'
import { Marketing } from './globals/Marketing'
import { Settings } from './globals/Settings'
import { integrationEndpoints } from './integrations/endpoints'
import { migrations } from './migrations'
import { checkoutEndpoints } from './orders/endpoints'

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
      },
      // Stage 5: own "Objednávky" nav group (Expedice + the order collections, which have
      // `admin.group: false`) and the "Dnes" panel on the admin home.
      beforeNavLinks: ['/components/admin/fulfilment/OrdersNavGroup#OrdersNavGroup'],
      beforeDashboard: ['/components/admin/fulfilment/TodayPanel#TodayPanel'],
      afterNavLinks: ['/components/admin/DeliveryCalendarNavLink#DeliveryCalendarNavLink'],
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
