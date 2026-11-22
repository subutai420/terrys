import type { GlobalConfig } from 'payload'

import { adminOnly, loggedIn } from '@/access'
import { ADMIN_GROUPS } from '@/collections/adminGroups'
import { revalidateGlobalAfterChange } from '@/storefront/revalidate'

/**
 * Stage 6: non-secret marketing settings (secrets – API keys, tokens – live ONLY in env).
 * Read by logged-in users in the admin; the storefront reads it on the server (consent text
 * version) with `overrideAccess`. The status panel on top shows env-derived facts (allowed
 * hostnames, GTM container, which integrations are switched on) and the feed links with their
 * last generation time and item counts (`GET /api/marketing/status`).
 */

export const DEFAULT_CONSENT_VERSION = '2026-11'
export const DEFAULT_GOOGLE_PRODUCT_CATEGORY = '4628'
export const DEFAULT_HEUREKA_CATEGORY =
  'Heureka.cz | Jídlo a nápoje | Čerstvé potraviny | Maso, drůbež, ryby'
export const DEFAULT_ZBOZI_CATEGORY = 'Potraviny a nápoje | Potraviny | Maso a ryby'

export const Marketing: GlobalConfig = {
  slug: 'marketing',
  label: 'Marketing',
  admin: {
    group: ADMIN_GROUPS.settings,
    description:
      'Měření, cookies a produktové feedy. API klíče (Meta, Heureka, Ecomail) se zadávají jen ' +
      'do proměnných prostředí na serveru, nikdy sem.',
  },
  access: {
    read: loggedIn,
    update: adminOnly,
  },
  hooks: {
    // The consent version is rendered into every page; feed defaults change the feeds.
    afterChange: [revalidateGlobalAfterChange],
  },
  fields: [
    {
      name: 'statusPanel',
      type: 'ui',
      admin: { components: { Field: '/components/admin/MarketingStatus#MarketingStatus' } },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Cookies a souhlas',
          fields: [
            {
              name: 'consentVersion',
              type: 'text',
              label: 'Verze textu souhlasu s cookies',
              required: true,
              defaultValue: DEFAULT_CONSENT_VERSION,
              maxLength: 40,
              admin: {
                description:
                  'Změňte (např. na „2027-03“), když přidáte nový měřicí nebo reklamní nástroj ' +
                  'nebo změníte text lišty. Všem návštěvníkům se lišta se souhlasem zobrazí znovu.',
              },
            },
          ],
        },
        {
          label: 'Feedy',
          fields: [
            {
              name: 'feedDefaults',
              type: 'group',
              label: 'Výchozí hodnoty feedů',
              admin: {
                description:
                  'Použijí se, když kategorie produktu nemá vlastní hodnotu (Katalog → Kategorie → Feedy).',
              },
              fields: [
                {
                  name: 'googleProductCategory',
                  type: 'text',
                  label: 'Kategorie Google (číslo)',
                  defaultValue: DEFAULT_GOOGLE_PRODUCT_CATEGORY,
                  admin: {
                    description:
                      '4628 = Jídlo, pití a tabák > Potraviny > Maso, ryby a vejce > Maso.',
                  },
                },
                {
                  name: 'heurekaCategory',
                  type: 'text',
                  label: 'Kategorie Heureka',
                  defaultValue: DEFAULT_HEUREKA_CATEGORY,
                },
                {
                  name: 'zboziCategory',
                  type: 'text',
                  label: 'Kategorie Zboží.cz',
                  defaultValue: DEFAULT_ZBOZI_CATEGORY,
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'inStockDeliveryDays',
                      type: 'number',
                      label: 'Dodání – zboží skladem (dní do expedice)',
                      defaultValue: 0,
                      min: 0,
                      max: 30,
                      admin: {
                        width: '50%',
                        step: 1,
                        description: 'Heureka/Zboží DELIVERY_DATE. 0 = „skladem“.',
                      },
                    },
                    {
                      name: 'inTransitDeliveryDays',
                      type: 'number',
                      label: 'Dodání – zboží „na cestě“ (dní)',
                      defaultValue: 7,
                      min: 1,
                      max: 60,
                      admin: {
                        width: '50%',
                        step: 1,
                        description:
                          'Heureka/Zboží DELIVERY_DATE a datum dostupnosti v Google feedu (backorder).',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      // Written by the feed generator (src/feeds/generate.ts); shown by the status panel.
      name: 'feedStats',
      type: 'json',
      admin: { hidden: true },
    },
  ],
}
