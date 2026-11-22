import type { CollectionConfig, Field } from 'payload'

import { adminOnly, editors, nobody, orderReaders } from '@/access'
import { PRICE_UNIT_LABELS, PRICE_UNITS, VAT_RATES } from '@/lib/catalog'
import { SHIPPING_METHOD_TYPE_LABELS, SHIPPING_METHOD_TYPES } from '@/lib/delivery/constants'
import {
  ADDRESS_CHECK_LABELS,
  ADDRESS_CHECK_STATUSES,
  EMAIL_STATUS_LABELS,
  EMAIL_STATUSES,
  ORDER_KIND_LABELS,
  ORDER_KINDS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
} from '@/lib/orders/constants'

import { ADMIN_GROUPS } from './adminGroups'

/**
 * Orders (stage 4). Created ONLY by the server (`src/orders/placeOrder.ts`, local API with
 * `overrideAccess: true`); nobody can create one through the REST/GraphQL API.
 *
 * Everything the customer saw is stored as a SNAPSHOT (product name, variant, unit price, VAT
 * rate, delivery method and price…), because products and settings change later. References
 * (product id, method id) are kept next to the snapshot for convenience only.
 *
 * Money: whole CZK incl. VAT for prices; the VAT breakdown in CZK with two decimals (computed in
 * haléře, see `src/lib/orders/money.ts`). All prices are ESTIMATES until the butcher weighs the
 * order (stage 5 fills `actualWeightGrams`, `finalPrice`, `totals.goodsFinal`, `totals.totalFinal`).
 *
 * Access: admin, staff and butcher read; admin and staff edit (status, internal note, stage 5
 * fields); only admin deletes. Anonymous visitors never see orders.
 */

const readOnly = { readOnly: true } as const
const hiddenFieldAccess = { read: () => false, update: () => false, create: () => false }

const options = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }))

const emailStatusFields = (prefix: 'customer' | 'shop', label: string): Field[] => [
  {
    type: 'row',
    fields: [
      {
        name: `${prefix}Status`,
        type: 'select',
        label,
        options: options(EMAIL_STATUSES, EMAIL_STATUS_LABELS),
        defaultValue: 'pending',
        admin: { ...readOnly, width: '50%' },
      },
      {
        name: `${prefix}SentAt`,
        type: 'date',
        label: 'Kdy',
        admin: { ...readOnly, width: '50%', date: { pickerAppearance: 'dayAndTime' } },
      },
    ],
  },
  {
    name: `${prefix}Error`,
    type: 'textarea',
    label: 'Chyba při odeslání',
    admin: {
      ...readOnly,
      condition: (_data, siblingData) => Boolean(siblingData?.[`${prefix}Error`]),
    },
  },
]

export const Orders: CollectionConfig = {
  slug: 'orders',
  labels: { singular: 'Objednávka', plural: 'Objednávky' },
  admin: {
    group: ADMIN_GROUPS.orders,
    useAsTitle: 'orderNumber',
    defaultColumns: [
      'orderNumber',
      'createdAt',
      'status',
      'customerName',
      'scheduledDate',
      'shippingLabel',
      'totalEstimate',
    ],
    listSearchableFields: ['orderNumber', 'customerName', 'contactEmail', 'contactPhone'],
    description:
      'Objednávky z e-shopu. Ceny jsou ODHADY – výsledná cena se řídí skutečnou hmotností po ' +
      'zvážení. Zákazník platí při převzetí. Objednávky vznikají jen v obchodě, ručně se nezakládají.',
    pagination: { defaultLimit: 50 },
  },
  defaultSort: '-createdAt',
  access: {
    read: orderReaders,
    create: nobody,
    update: editors,
    delete: adminOnly,
  },
  fields: [
    // ------------------------------------------------------------------ sidebar / list
    {
      name: 'orderNumber',
      type: 'text',
      label: 'Číslo objednávky',
      required: true,
      unique: true,
      index: true,
      admin: { ...readOnly, position: 'sidebar' },
    },
    {
      name: 'status',
      type: 'select',
      label: 'Stav',
      required: true,
      defaultValue: 'received',
      index: true,
      options: options(ORDER_STATUSES, ORDER_STATUS_LABELS),
      admin: {
        position: 'sidebar',
        description: 'Etapa 4 zakládá „Přijato“. Vážení a další stavy přijdou v etapě 5.',
      },
    },
    {
      name: 'kind',
      type: 'select',
      label: 'Druh objednávky',
      required: true,
      defaultValue: 'goods',
      options: options(ORDER_KINDS, ORDER_KIND_LABELS),
      admin: { ...readOnly, position: 'sidebar' },
    },
    // Flat copies for the list view and search (the full data is in the groups below).
    {
      name: 'customerName',
      type: 'text',
      label: 'Zákazník',
      admin: { ...readOnly, position: 'sidebar' },
    },
    {
      name: 'contactEmail',
      type: 'email',
      label: 'E-mail zákazníka',
      index: true,
      admin: { ...readOnly, position: 'sidebar' },
    },
    {
      name: 'contactPhone',
      type: 'text',
      label: 'Telefon zákazníka',
      admin: { ...readOnly, position: 'sidebar' },
    },
    {
      name: 'scheduledDate',
      type: 'text',
      label: 'Termín (doručení / odběr)',
      index: true,
      admin: { ...readOnly, position: 'sidebar', description: 'RRRR-MM-DD (pražský čas).' },
    },
    {
      name: 'shippingLabel',
      type: 'text',
      label: 'Doprava',
      admin: { ...readOnly, position: 'sidebar' },
    },
    {
      name: 'totalEstimate',
      type: 'number',
      label: 'Odhad celkem (Kč)',
      admin: { ...readOnly, position: 'sidebar' },
    },
    {
      type: 'tabs',
      tabs: [
        // ---------------------------------------------------------------- items
        {
          label: 'Položky a ceny',
          fields: [
            {
              name: 'lines',
              type: 'array',
              label: 'Položky',
              labels: { singular: 'Položka', plural: 'Položky' },
              admin: {
                // Snapshot: rows cannot be added or removed by hand. Stage 5 adds the weighing UI
                // (actualWeightGrams / finalPrice) – e.g. a custom view or by lifting this flag.
                readOnly: true,
                description:
                  'Stav v okamžiku objednávky. Skutečnou hmotnost a výslednou cenu doplní vážení (etapa 5).',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'productTitle',
                      type: 'text',
                      label: 'Produkt',
                      required: true,
                      admin: { ...readOnly, width: '40%' },
                    },
                    {
                      name: 'variantLabel',
                      type: 'text',
                      label: 'Varianta',
                      admin: { ...readOnly, width: '20%' },
                    },
                    {
                      name: 'quantity',
                      type: 'number',
                      label: 'Počet',
                      required: true,
                      admin: { ...readOnly, width: '15%' },
                    },
                    {
                      name: 'product',
                      type: 'relationship',
                      relationTo: 'products',
                      label: 'Odkaz na produkt',
                      admin: { ...readOnly, width: '25%' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'unitPrice',
                      type: 'number',
                      label: 'Cena za jednotku (Kč vč. DPH)',
                      required: true,
                      admin: { ...readOnly, width: '25%' },
                    },
                    {
                      name: 'priceUnit',
                      type: 'select',
                      label: 'Jednotka',
                      required: true,
                      options: PRICE_UNITS.map((value) => ({
                        value,
                        label: PRICE_UNIT_LABELS[value],
                      })),
                      admin: { ...readOnly, width: '25%' },
                    },
                    {
                      name: 'vatRate',
                      type: 'select',
                      label: 'DPH',
                      required: true,
                      options: VAT_RATES.map((value) => ({ value, label: `${value} %` })),
                      admin: { ...readOnly, width: '15%' },
                    },
                    {
                      name: 'sku',
                      type: 'text',
                      label: 'Kód zboží',
                      admin: { ...readOnly, width: '15%' },
                    },
                    {
                      name: 'variantId',
                      type: 'text',
                      label: 'ID varianty',
                      admin: { ...readOnly, width: '20%' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'estimatedWeightGrams',
                      type: 'number',
                      label: 'Odhad hmotnosti 1 ks (g)',
                      admin: { ...readOnly, width: '25%' },
                    },
                    {
                      name: 'estimatedPrice',
                      type: 'number',
                      label: 'Odhad ceny řádku (Kč)',
                      required: true,
                      admin: { ...readOnly, width: '25%' },
                    },
                    {
                      name: 'actualWeightGrams',
                      type: 'number',
                      label: 'Skutečná hmotnost (g)',
                      admin: { width: '25%', description: 'Vyplní řezník při vážení (etapa 5).' },
                    },
                    {
                      name: 'finalPrice',
                      type: 'number',
                      label: 'Výsledná cena řádku (Kč)',
                      admin: { width: '25%', description: 'Etapa 5.' },
                    },
                  ],
                },
              ],
            },
            {
              name: 'totals',
              type: 'group',
              label: 'Součty',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'goodsEstimate',
                      type: 'number',
                      label: 'Odhad za zboží (Kč)',
                      required: true,
                      admin: { ...readOnly, width: '33%' },
                    },
                    {
                      name: 'deliveryPrice',
                      type: 'number',
                      label: 'Doprava (Kč)',
                      required: true,
                      admin: { ...readOnly, width: '33%' },
                    },
                    {
                      name: 'totalEstimate',
                      type: 'number',
                      label: 'Odhad celkem (Kč)',
                      required: true,
                      admin: { ...readOnly, width: '34%' },
                    },
                  ],
                },
                {
                  name: 'vat',
                  type: 'array',
                  label: 'Rozpis DPH (z odhadu)',
                  labels: { singular: 'Sazba', plural: 'Sazby' },
                  admin: {
                    ...readOnly,
                    description:
                      'Doprava je rozdělena mezi sazby v poměru hodnoty zboží (vedlejší plnění).',
                  },
                  fields: [
                    {
                      type: 'row',
                      fields: [
                        { name: 'rate', type: 'number', label: 'Sazba %', admin: { width: '25%' } },
                        { name: 'base', type: 'number', label: 'Základ', admin: { width: '25%' } },
                        { name: 'vat', type: 'number', label: 'DPH', admin: { width: '25%' } },
                        { name: 'gross', type: 'number', label: 'Celkem', admin: { width: '25%' } },
                      ],
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'goodsFinal',
                      type: 'number',
                      label: 'Zboží po zvážení (Kč)',
                      admin: { width: '50%', description: 'Etapa 5.' },
                    },
                    {
                      name: 'totalFinal',
                      type: 'number',
                      label: 'K úhradě po zvážení (Kč)',
                      admin: { width: '50%', description: 'Etapa 5.' },
                    },
                  ],
                },
              ],
            },
            {
              name: 'voucherCode',
              type: 'text',
              label: 'Kód dárkového poukazu (jak ho zákazník zadal)',
              admin: {
                ...readOnly,
                description:
                  'NEOVĚŘENO. Poukaz zkontrolujte ručně a jeho hodnotu odečtěte při vážení.',
              },
            },
          ],
        },
        // ---------------------------------------------------------------- customer
        {
          label: 'Zákazník a doprava',
          fields: [
            {
              name: 'customer',
              type: 'group',
              label: 'Zákazník',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'firstName',
                      type: 'text',
                      label: 'Jméno',
                      required: true,
                      admin: { ...readOnly, width: '50%' },
                    },
                    {
                      name: 'lastName',
                      type: 'text',
                      label: 'Příjmení',
                      required: true,
                      admin: { ...readOnly, width: '50%' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'email',
                      type: 'email',
                      label: 'E-mail',
                      required: true,
                      admin: { ...readOnly, width: '50%' },
                    },
                    {
                      name: 'phone',
                      type: 'text',
                      label: 'Telefon',
                      required: true,
                      admin: { ...readOnly, width: '50%' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'companyName',
                      type: 'text',
                      label: 'Firma',
                      admin: { ...readOnly, width: '50%' },
                    },
                    {
                      name: 'ico',
                      type: 'text',
                      label: 'IČO',
                      admin: { ...readOnly, width: '25%' },
                    },
                    {
                      name: 'dic',
                      type: 'text',
                      label: 'DIČ',
                      admin: { ...readOnly, width: '25%' },
                    },
                  ],
                },
              ],
            },
            {
              name: 'shippingAddress',
              type: 'group',
              label: 'Doručovací adresa',
              admin: { description: 'Jen u rozvozu a kurýra.' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'street',
                      type: 'text',
                      label: 'Ulice a číslo',
                      admin: { ...readOnly, width: '50%' },
                    },
                    {
                      name: 'city',
                      type: 'text',
                      label: 'Obec',
                      admin: { ...readOnly, width: '30%' },
                    },
                    {
                      name: 'postcode',
                      type: 'text',
                      label: 'PSČ',
                      admin: { ...readOnly, width: '20%' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'checkStatus',
                      type: 'select',
                      label: 'Kontrola adresy (Foxentry)',
                      options: options(ADDRESS_CHECK_STATUSES, ADDRESS_CHECK_LABELS),
                      admin: { ...readOnly, width: '50%' },
                    },
                    {
                      name: 'checkNote',
                      type: 'text',
                      label: 'Poznámka ke kontrole adresy',
                      admin: { ...readOnly, width: '50%' },
                    },
                  ],
                },
              ],
            },
            {
              name: 'delivery',
              type: 'group',
              label: 'Doprava',
              admin: {
                description:
                  'Stav v okamžiku objednávky. U elektronického poukazu (etapa 7) zůstane prázdné.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'methodName',
                      type: 'text',
                      label: 'Způsob dopravy',
                      admin: { ...readOnly, width: '40%' },
                    },
                    {
                      name: 'methodType',
                      type: 'select',
                      label: 'Typ',
                      options: SHIPPING_METHOD_TYPES.map((value) => ({
                        value,
                        label: SHIPPING_METHOD_TYPE_LABELS[value],
                      })),
                      admin: { ...readOnly, width: '30%' },
                    },
                    {
                      name: 'price',
                      type: 'number',
                      label: 'Cena (Kč)',
                      admin: { ...readOnly, width: '30%' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'date',
                      type: 'text',
                      label: 'Termín (RRRR-MM-DD)',
                      admin: { ...readOnly, width: '30%' },
                    },
                    {
                      name: 'postcode',
                      type: 'text',
                      label: 'PSČ zadané v košíku',
                      admin: { ...readOnly, width: '20%' },
                    },
                    {
                      name: 'method',
                      type: 'relationship',
                      relationTo: 'shipping-methods',
                      label: 'Odkaz na způsob dopravy',
                      admin: { ...readOnly, width: '30%' },
                    },
                    {
                      name: 'methodSlug',
                      type: 'text',
                      label: 'Slug',
                      admin: { ...readOnly, width: '20%' },
                    },
                  ],
                },
                {
                  name: 'pickupLocation',
                  type: 'group',
                  label: 'Odběrné místo',
                  admin: { condition: (_data, sibling) => sibling?.methodType === 'pickup' },
                  fields: [
                    {
                      type: 'row',
                      fields: [
                        {
                          name: 'name',
                          type: 'text',
                          label: 'Název',
                          admin: { ...readOnly, width: '40%' },
                        },
                        {
                          name: 'street',
                          type: 'text',
                          label: 'Ulice',
                          admin: { ...readOnly, width: '25%' },
                        },
                        {
                          name: 'city',
                          type: 'text',
                          label: 'Obec',
                          admin: { ...readOnly, width: '20%' },
                        },
                        {
                          name: 'zip',
                          type: 'text',
                          label: 'PSČ',
                          admin: { ...readOnly, width: '15%' },
                        },
                      ],
                    },
                    {
                      name: 'openingHoursNote',
                      type: 'text',
                      label: 'Poznámka k otevírací době',
                      admin: readOnly,
                    },
                  ],
                },
              ],
            },
            {
              name: 'customerNote',
              type: 'textarea',
              label: 'Poznámka zákazníka pro řezníka',
              admin: readOnly,
            },
          ],
        },
        // ---------------------------------------------------------------- internal
        {
          label: 'Interní',
          fields: [
            {
              name: 'internalNote',
              type: 'textarea',
              label: 'Interní poznámka',
              admin: { description: 'Vidí jen obsluha. Zákazníkovi se nikdy neposílá.' },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'invoiceNumber',
                  type: 'text',
                  label: 'Číslo dokladu / faktury',
                  admin: { width: '33%', description: 'Etapa 5.' },
                },
                {
                  name: 'trackingNumber',
                  type: 'text',
                  label: 'Číslo zásilky',
                  admin: { width: '33%', description: 'Etapa 5 (Balíkobot).' },
                },
                {
                  name: 'trackingUrl',
                  type: 'text',
                  label: 'Odkaz na sledování',
                  admin: { width: '34%', description: 'Etapa 5.' },
                },
              ],
            },
            {
              name: 'emails',
              type: 'group',
              label: 'E-maily',
              admin: {
                description:
                  'Pokud se potvrzení zákazníkovi nepodařilo odeslat, objednávka je přesto ' +
                  'platná – kontaktujte zákazníka telefonem.',
              },
              fields: [
                ...emailStatusFields('customer', 'Potvrzení zákazníkovi'),
                ...emailStatusFields('shop', 'Kopie pro obchod'),
              ],
            },
            {
              name: 'consents',
              type: 'group',
              label: 'Souhlasy',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'termsAcceptedAt',
                      type: 'date',
                      label: 'Obchodní podmínky odsouhlaseny',
                      admin: {
                        ...readOnly,
                        width: '50%',
                        date: { pickerAppearance: 'dayAndTime' },
                      },
                    },
                    {
                      name: 'termsPageUpdatedAt',
                      type: 'date',
                      label: 'Verze podmínek (poslední úprava stránky)',
                      admin: {
                        ...readOnly,
                        width: '50%',
                        date: { pickerAppearance: 'dayAndTime' },
                      },
                    },
                  ],
                },
                {
                  name: 'privacyNoticeAt',
                  type: 'date',
                  label: 'Informace o zpracování osobních údajů zobrazeny',
                  admin: { ...readOnly, date: { pickerAppearance: 'dayAndTime' } },
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'newsletter',
                      type: 'checkbox',
                      label: 'Chce newsletter',
                      admin: { ...readOnly, width: '50%' },
                    },
                    {
                      name: 'newsletterAt',
                      type: 'date',
                      label: 'Souhlas s newsletterem udělen',
                      admin: {
                        ...readOnly,
                        width: '50%',
                        date: { pickerAppearance: 'dayAndTime' },
                      },
                    },
                  ],
                },
                {
                  name: 'heurekaOptOut',
                  type: 'checkbox',
                  label: 'NEPOSÍLAT dotazník Heureka „Ověřeno zákazníky“',
                  admin: { ...readOnly, description: 'Etapa 6 podle toho dotazník neodešle.' },
                },
              ],
            },
            {
              name: 'attribution',
              type: 'group',
              label: 'Odkud zákazník přišel (první návštěva)',
              admin: { description: 'Zaznamenává prohlížeč zákazníka, bez skriptů třetích stran.' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'utmSource',
                      type: 'text',
                      label: 'utm_source',
                      admin: { ...readOnly, width: '33%' },
                    },
                    {
                      name: 'utmMedium',
                      type: 'text',
                      label: 'utm_medium',
                      admin: { ...readOnly, width: '33%' },
                    },
                    {
                      name: 'utmCampaign',
                      type: 'text',
                      label: 'utm_campaign',
                      admin: { ...readOnly, width: '34%' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'utmTerm',
                      type: 'text',
                      label: 'utm_term',
                      admin: { ...readOnly, width: '33%' },
                    },
                    {
                      name: 'utmContent',
                      type: 'text',
                      label: 'utm_content',
                      admin: { ...readOnly, width: '33%' },
                    },
                    {
                      name: 'firstSeenAt',
                      type: 'text',
                      label: 'První návštěva',
                      admin: { ...readOnly, width: '34%' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'gclid',
                      type: 'text',
                      label: 'gclid',
                      admin: { ...readOnly, width: '50%' },
                    },
                    {
                      name: 'fbclid',
                      type: 'text',
                      label: 'fbclid',
                      admin: { ...readOnly, width: '50%' },
                    },
                  ],
                },
                {
                  name: 'referrer',
                  type: 'text',
                  label: 'Předchozí web (referrer)',
                  admin: readOnly,
                },
                { name: 'landingPage', type: 'text', label: 'Vstupní stránka', admin: readOnly },
              ],
            },
            {
              name: 'eventId',
              type: 'text',
              label: 'ID události (měření)',
              index: true,
              admin: {
                ...readOnly,
                description:
                  'Stejné ID posílá prohlížeč i server (deduplikace Meta CAPI, etapa 6).',
              },
            },
            {
              name: 'withdrawals',
              type: 'join',
              collection: 'withdrawals',
              on: 'order',
              label: 'Odstoupení od smlouvy',
              admin: { defaultColumns: ['submittedAt', 'status', 'name'], allowCreate: false },
            },
          ],
        },
      ],
    },
    // ------------------------------------------------------------------ technical, never shown
    {
      // Unguessable token of the thank-you page URL (/objednavka/dekujeme/<token>).
      name: 'accessToken',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      access: hiddenFieldAccess,
      admin: { hidden: true },
    },
    {
      // Random id the browser sends with the submit: a double click or retry finds this order.
      name: 'idempotencyKey',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      access: hiddenFieldAccess,
      admin: { hidden: true },
    },
  ],
}
