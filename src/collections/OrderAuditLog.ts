import type { CollectionConfig } from 'payload'

import { editors, nobody } from '@/access'

/**
 * Stage 5: audit trail of orders – who changed a weight, price, voucher, invoice number, status
 * or shipment, when, and old → new value. Written ONLY by the hook `orderAuditAfterChange`
 * (`src/fulfilment/hooks.ts`) inside the same transaction as the order change; nobody can create,
 * edit or delete entries through the admin or the API (not even an admin), so the trail cannot
 * be tidied up afterwards.
 */
export const OrderAuditLog: CollectionConfig = {
  slug: 'order-audit-log',
  labels: { singular: 'Změna objednávky', plural: 'Historie změn objednávek' },
  admin: {
    // Listed in the custom "Objednávky" nav group (OrdersNavGroup).
    group: false,
    useAsTitle: 'summary',
    defaultColumns: ['at', 'orderNumber', 'field', 'oldValue', 'newValue', 'userEmail'],
    description:
      'Kdo a kdy změnil hmotnost, cenu, poukaz, číslo faktury, stav nebo zásilku. Záznamy nejdou ' +
      'upravit ani smazat.',
    pagination: { defaultLimit: 50 },
  },
  defaultSort: '-at',
  access: {
    read: editors,
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  fields: [
    { name: 'order', type: 'relationship', relationTo: 'orders', label: 'Objednávka', index: true },
    { name: 'orderNumber', type: 'text', label: 'Číslo objednávky', index: true },
    {
      name: 'at',
      type: 'date',
      label: 'Kdy',
      required: true,
      index: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    { name: 'user', type: 'relationship', relationTo: 'users', label: 'Kdo' },
    { name: 'userEmail', type: 'text', label: 'Kdo (e-mail)' },
    { name: 'field', type: 'text', label: 'Co', required: true },
    { name: 'lineId', type: 'text', label: 'Řádek objednávky (ID)' },
    { name: 'oldValue', type: 'text', label: 'Původně' },
    { name: 'newValue', type: 'text', label: 'Nově' },
    { name: 'summary', type: 'text', label: 'Shrnutí' },
  ],
}
