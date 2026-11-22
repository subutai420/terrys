import type { CollectionConfig, Field } from 'payload'

import { adminOnly, editors, nobody, orderReaders } from '@/access'
import { orderAuditAfterChange, orderStatusGuard } from '@/fulfilment/hooks'
import { PRICE_UNIT_LABELS, PRICE_UNITS, VAT_RATES } from '@/lib/catalog'
import { SHIPPING_METHOD_TYPE_LABELS, SHIPPING_METHOD_TYPES } from '@/lib/delivery/constants'
import {
  ADDRESS_CHECK_LABELS,
  ADDRESS_CHECK_STATUSES,
  EMAIL_STATUS_LABELS,
  EMAIL_STATUSES,
  LINE_RESOLUTION_LABELS,
  LINE_RESOLUTIONS,
  ORDER_KIND_LABELS,
  ORDER_KINDS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  SENT_EMAIL_KINDS,
  SENT_EMAIL_LABELS,
} from '@/lib/orders/constants'
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUSES,
} from '@/lib/vouchers/constants'

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
 * Access: admin, staff and butcher read; admin and staff edit; only admin deletes. Anonymous
 * visitors never see orders.
 *
 * Stage 5 (fulfilment): weighing, final price, vouchers, invoice number, shipment and status
 * changes are done on the screens "Vážení" (/admin/vazeni/:id) and "Vyřízení objednávky"
 * (/admin/vyrizeni/:id) through `src/fulfilment/service.ts` – the stage 5 fields are therefore
 * read-only in this form. Two hooks guard every write, whatever the path (form, REST, service):
 * `orderStatusGuard` (only allowed status transitions) and `orderAuditAfterChange` (every
 * weight / price / voucher / invoice / status change is written to `order-audit-log`).
 */

const readOnly = { readOnly: true } as const

/** Stage 6: per-order result of a server-side marketing call (src/integrations). */
export const INTEGRATION_STATUSES = ['pending', 'sent', 'failed', 'skipped', 'disabled'] as const
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number]
const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  pending: 'Čeká na odeslání',
  sent: 'Odesláno',
  failed: 'Chyba (opakuje se)',
  skipped: 'Neposílá se (souhlas / volba zákazníka)',
  disabled: 'Vypnuto (chybí klíč v nastavení serveru)',
}
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
    // Stage 5: hidden from the generated sidebar; listed in the custom "Objednávky" nav group
    // (`src/components/admin/fulfilment/OrdersNavGroup.tsx`) together with "Expedice".
    group: false,
    useAsTitle: 'orderNumber',
    defaultColumns: [
      'orderNumber',
      'createdAt',
      'status',
      'customerName',
      'scheduledDate',
      'shippingLabel',
      'totalEstimate',
      'amountDue',
      'invoiceNumber',
    ],
    listSearchableFields: ['orderNumber', 'customerName', 'contactEmail', 'contactPhone'],
    description:
      'Objednávky z e-shopu. Ceny jsou ODHADY – výsledná cena se řídí skutečnou hmotností po ' +
      'zvážení. Zákazník platí při převzetí. Objednávky vznikají jen v obchodě, ručně se nezakládají.',
    pagination: { defaultLimit: 50 },
  },
  defaultSort: '-createdAt',
  hooks: {
    beforeChange: [orderStatusGuard],
    afterChange: [orderAuditAfterChange],
  },
  access: {
    read: orderReaders,
    create: nobody,
    update: editors,
    delete: adminOnly,
  },
  fields: [
    // ------------------------------------------------------------------ sidebar / list
    {
      // Stage 5: buttons "Vážit" / "Vyřídit objednávku" + status overview (no data stored).
      name: 'fulfilmentActions',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '/components/admin/fulfilment/OrderActionsField#OrderActionsField' },
      },
    },
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
        ...readOnly,
        position: 'sidebar',
        components: { Cell: '/components/admin/fulfilment/StatusCell#StatusCell' },
        description: 'Stav se mění tlačítky na stránce „Vyřízení objednávky“ (a při vážení).',
      },
    },
    {
      name: 'needsReview',
      type: 'checkbox',
      label: 'Ke kontrole (odchylka, náhrada, chyba)',
      index: true,
      admin: { ...readOnly, position: 'sidebar' },
    },
    {
      name: 'reviewReasons',
      type: 'textarea',
      label: 'Proč ke kontrole',
      admin: {
        ...readOnly,
        position: 'sidebar',
        condition: (data) => Boolean(data?.needsReview),
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
      // Stage 5: flat copy of totals.amountDue for the list (what the driver / shop collects).
      name: 'amountDue',
      type: 'number',
      label: 'K úhradě při převzetí (Kč)',
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
                // Snapshot: rows cannot be added or removed by hand. Weights are entered on the
                // weighing screen (/admin/vazeni/:id).
                readOnly: true,
                description:
                  'Stav v okamžiku objednávky. Skutečnou hmotnost a výslednou cenu doplní vážení (tlačítko „Vážit“).',
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
                      label: 'Skutečná hmotnost řádku (g)',
                      admin: {
                        ...readOnly,
                        width: '25%',
                        description: 'Všechny kusy řádku dohromady.',
                      },
                    },
                    {
                      name: 'finalPrice',
                      type: 'number',
                      label: 'Výsledná cena řádku (Kč)',
                      admin: { ...readOnly, width: '25%' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'resolution',
                      type: 'select',
                      label: 'Výsledek vážení',
                      options: options(LINE_RESOLUTIONS, LINE_RESOLUTION_LABELS),
                      admin: { ...readOnly, width: '25%' },
                    },
                    {
                      name: 'pieceWeights',
                      type: 'text',
                      label: 'Jednotlivé kusy (g)',
                      admin: { ...readOnly, width: '25%' },
                    },
                    {
                      name: 'overTolerance',
                      type: 'checkbox',
                      label: 'Odchylka nad limit',
                      admin: { ...readOnly, width: '20%' },
                    },
                    {
                      name: 'toleranceNote',
                      type: 'text',
                      label: 'Důvod odchylky',
                      admin: { ...readOnly, width: '30%' },
                    },
                  ],
                },
                {
                  name: 'weighNote',
                  type: 'text',
                  label: 'Poznámka řezníka (náhrada, nedostupné)',
                  admin: readOnly,
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
                      admin: { ...readOnly, width: '25%' },
                    },
                    {
                      name: 'totalFinal',
                      type: 'number',
                      label: 'Celkem po zvážení vč. dopravy (Kč)',
                      admin: { ...readOnly, width: '25%' },
                    },
                    {
                      name: 'voucherTotal',
                      type: 'number',
                      label: 'Uhrazeno poukazy (Kč)',
                      admin: { ...readOnly, width: '25%' },
                    },
                    {
                      name: 'amountDue',
                      type: 'number',
                      label: 'K úhradě při převzetí (Kč)',
                      admin: { ...readOnly, width: '25%' },
                    },
                  ],
                },
                {
                  name: 'vatFinal',
                  type: 'array',
                  label: 'Rozpis DPH po zvážení',
                  labels: { singular: 'Sazba', plural: 'Sazby' },
                  admin: readOnly,
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
              ],
            },
            {
              // Gift vouchers are a MEANS OF PAYMENT (not a discount): they never change prices
              // or VAT, only what the customer pays on delivery. Stage 7 adds voucher records;
              // then each row gets a relation to the voucher it redeems.
              name: 'voucherRedemptions',
              type: 'array',
              label: 'Úhrada dárkovými poukazy',
              labels: { singular: 'Poukaz', plural: 'Poukazy' },
              admin: {
                ...readOnly,
                description: 'Ověřené poukazy zapsané obsluhou na stránce „Vyřízení objednávky“.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'code',
                      type: 'text',
                      label: 'Kód poukazu',
                      required: true,
                      admin: { width: '30%' },
                    },
                    {
                      // Stage 7: the voucher record this payment row redeems (null only for
                      // rows recorded before stage 7).
                      name: 'voucher',
                      type: 'relationship',
                      relationTo: 'vouchers',
                      label: 'Poukaz',
                      admin: { width: '20%' },
                    },
                    {
                      name: 'amount',
                      type: 'number',
                      label: 'Uhrazeno (Kč)',
                      required: true,
                      admin: { width: '20%' },
                    },
                    { name: 'note', type: 'text', label: 'Poznámka', admin: { width: '50%' } },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'recordedBy',
                      type: 'relationship',
                      relationTo: 'users',
                      label: 'Zapsal',
                      admin: { width: '50%' },
                    },
                    {
                      name: 'recordedAt',
                      type: 'date',
                      label: 'Kdy',
                      admin: { width: '50%', date: { pickerAppearance: 'dayAndTime' } },
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
                  'Zákazník ho zadal v objednávce. Ověří se, až ho obsluha zapíše v „Vyřízení ' +
                  'objednávky“ (kód, zaplacení, platnost, zůstatek).',
              },
            },
            {
              // Stage 7: vouchers BOUGHT in this order (electronic: issued at placement,
              // printed: issued by staff on the order screen).
              name: 'issuedVouchers',
              type: 'join',
              collection: 'vouchers',
              on: 'order',
              label: 'Poukazy koupené v této objednávce',
              admin: {
                defaultColumns: ['code', 'value', 'type', 'status', 'expiresOn'],
                allowCreate: false,
              },
            },
            {
              name: 'voucherDetails',
              type: 'group',
              label: 'Údaje na poukaz (od zákazníka)',
              admin: {
                condition: (data) =>
                  Boolean(data?.voucherDetails?.recipientName || data?.voucherDetails?.message),
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'recipientName',
                      type: 'text',
                      label: 'Pro koho',
                      admin: { ...readOnly, width: '40%' },
                    },
                    {
                      name: 'message',
                      type: 'text',
                      label: 'Věnování',
                      admin: { ...readOnly, width: '60%' },
                    },
                  ],
                },
              ],
            },
          ],
        },
        // ---------------------------------------------------------------- payment (stage 7)
        {
          label: 'Platba',
          fields: [
            {
              name: 'payment',
              type: 'group',
              label: 'Platba',
              admin: {
                description:
                  'Zboží se platí při převzetí. Elektronické poukazy převodem předem – platbu ' +
                  'páruje obsluha v „Poukazy – platby“ (variabilní symbol = číslo objednávky).',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'method',
                      type: 'select',
                      label: 'Způsob platby',
                      defaultValue: 'on-delivery',
                      options: options(PAYMENT_METHODS, PAYMENT_METHOD_LABELS),
                      admin: { ...readOnly, width: '33%' },
                    },
                    {
                      name: 'status',
                      type: 'select',
                      label: 'Stav platby',
                      index: true,
                      options: options(PAYMENT_STATUSES, PAYMENT_STATUS_LABELS),
                      admin: { ...readOnly, width: '33%' },
                    },
                    {
                      name: 'amount',
                      type: 'number',
                      label: 'Částka k úhradě převodem (Kč)',
                      admin: { ...readOnly, width: '34%' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'variableSymbol',
                      type: 'text',
                      label: 'Variabilní symbol',
                      index: true,
                      admin: { ...readOnly, width: '25%' },
                    },
                    {
                      name: 'account',
                      type: 'text',
                      label: 'Na účet',
                      admin: { ...readOnly, width: '35%' },
                    },
                    {
                      name: 'dueAt',
                      type: 'date',
                      label: 'Splatnost',
                      index: true,
                      admin: {
                        ...readOnly,
                        width: '40%',
                        date: { pickerAppearance: 'dayAndTime' },
                      },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'paidOn',
                      type: 'date',
                      label: 'Platba přišla (den)',
                      admin: {
                        ...readOnly,
                        width: '25%',
                        date: { pickerAppearance: 'dayOnly', displayFormat: 'd. M. yyyy' },
                      },
                    },
                    {
                      name: 'markedPaidAt',
                      type: 'date',
                      label: 'Označeno jako zaplacené',
                      admin: {
                        ...readOnly,
                        width: '25%',
                        date: { pickerAppearance: 'dayAndTime' },
                      },
                    },
                    {
                      name: 'markedPaidBy',
                      type: 'relationship',
                      relationTo: 'users',
                      label: 'Označil(a)',
                      admin: { ...readOnly, width: '25%' },
                    },
                    {
                      name: 'reminderSentAt',
                      type: 'date',
                      label: 'Připomínka platby odeslána',
                      admin: {
                        ...readOnly,
                        width: '25%',
                        date: { pickerAppearance: 'dayAndTime' },
                      },
                    },
                  ],
                },
              ],
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
                  // Typed in by staff from the accounting software (invoices are NOT issued
                  // here). Unique: the service refuses a number another order already has.
                  name: 'invoiceNumber',
                  type: 'text',
                  label: 'Číslo faktury',
                  unique: true,
                  index: true,
                  admin: { ...readOnly, width: '33%' },
                },
                {
                  name: 'trackingNumber',
                  type: 'text',
                  label: 'Číslo zásilky',
                  admin: { ...readOnly, width: '33%' },
                },
                {
                  name: 'trackingUrl',
                  type: 'text',
                  label: 'Odkaz na sledování',
                  admin: { ...readOnly, width: '34%' },
                },
              ],
            },
            {
              name: 'fulfilment',
              type: 'group',
              label: 'Vážení a vyúčtování',
              admin: { description: 'Kdo a kdy objednávku zvážil a potvrdil vyúčtování.' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'weighedAt',
                      type: 'date',
                      label: 'Zváženo',
                      admin: {
                        ...readOnly,
                        width: '25%',
                        date: { pickerAppearance: 'dayAndTime' },
                      },
                    },
                    {
                      name: 'weighedBy',
                      type: 'relationship',
                      relationTo: 'users',
                      label: 'Vážil',
                      admin: { ...readOnly, width: '25%' },
                    },
                    {
                      name: 'finalisedAt',
                      type: 'date',
                      label: 'Vyúčtování potvrzeno',
                      admin: {
                        ...readOnly,
                        width: '25%',
                        date: { pickerAppearance: 'dayAndTime' },
                      },
                    },
                    {
                      name: 'finalisedBy',
                      type: 'relationship',
                      relationTo: 'users',
                      label: 'Potvrdil',
                      admin: { ...readOnly, width: '25%' },
                    },
                  ],
                },
              ],
            },
            {
              name: 'shipment',
              type: 'group',
              label: 'Zásilka (kurýr)',
              admin: {
                condition: (data) => data?.delivery?.methodType === 'courier',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'provider',
                      type: 'select',
                      label: 'Vytvořeno přes',
                      options: [
                        { value: 'balikobot', label: 'Balíkobot' },
                        { value: 'simulation', label: 'SIMULACE (nic se neodeslalo)' },
                      ],
                      admin: { ...readOnly, width: '25%' },
                    },
                    {
                      name: 'carrierCode',
                      type: 'text',
                      label: 'Dopravce',
                      admin: { ...readOnly, width: '25%' },
                    },
                    {
                      name: 'serviceCode',
                      type: 'text',
                      label: 'Služba',
                      admin: { ...readOnly, width: '25%' },
                    },
                    {
                      name: 'packageId',
                      type: 'text',
                      label: 'ID balíku (Balíkobot)',
                      admin: { ...readOnly, width: '25%' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'labelCreatedAt',
                      type: 'date',
                      label: 'Zásilka vytvořena',
                      admin: {
                        ...readOnly,
                        width: '25%',
                        date: { pickerAppearance: 'dayAndTime' },
                      },
                    },
                    {
                      name: 'handedOverAt',
                      type: 'date',
                      label: 'Předáno dopravci (svoz)',
                      admin: {
                        ...readOnly,
                        width: '25%',
                        date: { pickerAppearance: 'dayAndTime' },
                      },
                    },
                    {
                      name: 'batchId',
                      type: 'text',
                      label: 'ID svozu',
                      admin: { ...readOnly, width: '25%' },
                    },
                    {
                      name: 'attempt',
                      type: 'number',
                      label: 'Počet vytvořených zásilek',
                      defaultValue: 0,
                      admin: { ...readOnly, width: '25%' },
                    },
                  ],
                },
                {
                  name: 'labelUrl',
                  type: 'text',
                  label: 'Odkaz na štítek (Balíkobot)',
                  admin: readOnly,
                },
                {
                  name: 'lastError',
                  type: 'textarea',
                  label: 'Poslední chyba Balíkobotu',
                  admin: {
                    ...readOnly,
                    condition: (_data, sibling) => Boolean(sibling?.lastError),
                  },
                },
              ],
            },
            {
              name: 'cancellation',
              type: 'group',
              label: 'Zrušení',
              admin: { condition: (data) => data?.status === 'cancelled' },
              fields: [
                { name: 'reason', type: 'textarea', label: 'Důvod zrušení', admin: readOnly },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'cancelledAt',
                      type: 'date',
                      label: 'Zrušeno',
                      admin: {
                        ...readOnly,
                        width: '50%',
                        date: { pickerAppearance: 'dayAndTime' },
                      },
                    },
                    {
                      name: 'cancelledBy',
                      type: 'relationship',
                      relationTo: 'users',
                      label: 'Zrušil',
                      admin: { ...readOnly, width: '50%' },
                    },
                  ],
                },
              ],
            },
            {
              name: 'statusHistory',
              type: 'array',
              label: 'Historie stavů',
              labels: { singular: 'Změna stavu', plural: 'Změny stavu' },
              admin: { ...readOnly, initCollapsed: true },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'status',
                      type: 'select',
                      label: 'Stav',
                      options: options(ORDER_STATUSES, ORDER_STATUS_LABELS),
                      admin: { width: '25%' },
                    },
                    {
                      name: 'at',
                      type: 'date',
                      label: 'Kdy',
                      admin: { width: '25%', date: { pickerAppearance: 'dayAndTime' } },
                    },
                    {
                      name: 'by',
                      type: 'relationship',
                      relationTo: 'users',
                      label: 'Kdo',
                      admin: { width: '25%' },
                    },
                    { name: 'note', type: 'text', label: 'Poznámka', admin: { width: '25%' } },
                  ],
                },
              ],
            },
            {
              name: 'sentEmails',
              type: 'array',
              label: 'E-maily zákazníkovi při vyřizování',
              labels: { singular: 'E-mail', plural: 'E-maily' },
              admin: { ...readOnly, initCollapsed: true },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'kind',
                      type: 'select',
                      label: 'Druh',
                      options: options(SENT_EMAIL_KINDS, SENT_EMAIL_LABELS),
                      admin: { width: '30%' },
                    },
                    {
                      name: 'status',
                      type: 'select',
                      label: 'Výsledek',
                      options: options(EMAIL_STATUSES, EMAIL_STATUS_LABELS),
                      admin: { width: '30%' },
                    },
                    {
                      name: 'at',
                      type: 'date',
                      label: 'Kdy',
                      admin: { width: '20%', date: { pickerAppearance: 'dayAndTime' } },
                    },
                    {
                      name: 'by',
                      type: 'relationship',
                      relationTo: 'users',
                      label: 'Kdo',
                      admin: { width: '20%' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'to', type: 'text', label: 'Komu', admin: { width: '40%' } },
                    { name: 'subject', type: 'text', label: 'Předmět', admin: { width: '60%' } },
                  ],
                },
                { name: 'error', type: 'textarea', label: 'Chyba' },
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
              // Stage 6: results of the server-side marketing calls (src/integrations); details
              // and retries in Nastavení → Fronta marketingu.
              name: 'integrations',
              type: 'group',
              label: 'Marketing a měření (odesláno ze serveru)',
              admin: {
                description:
                  'Meta Conversions API (jen se souhlasem s marketingovými cookies), Heureka ' +
                  'Ověřeno zákazníky (ne při nesouhlasu zákazníka), Ecomail (jen se souhlasem ' +
                  's newsletterem).',
              },
              fields: (['meta', 'heureka', 'ecomail'] as const).map((prefix): Field => ({
                type: 'row',
                fields: [
                  {
                    name: `${prefix}Status`,
                    type: 'select',
                    label:
                      prefix === 'meta'
                        ? 'Meta CAPI'
                        : prefix === 'heureka'
                          ? 'Heureka Ověřeno zákazníky'
                          : 'Ecomail',
                    options: options(INTEGRATION_STATUSES, INTEGRATION_STATUS_LABELS),
                    admin: { ...readOnly, width: '30%' },
                  },
                  {
                    name: `${prefix}At`,
                    type: 'date',
                    label: 'Kdy',
                    admin: {
                      ...readOnly,
                      width: '25%',
                      date: { pickerAppearance: 'dayAndTime' },
                    },
                  },
                  {
                    name: `${prefix}Note`,
                    type: 'text',
                    label: 'Poznámka / chyba',
                    admin: { ...readOnly, width: '45%' },
                  },
                ],
              })),
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
