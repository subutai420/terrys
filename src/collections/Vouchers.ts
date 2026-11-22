import type { CollectionConfig, FieldAccess } from 'payload'

import { adminOnly, editors } from '@/access'
import { displayVoucherCode, normalizeVoucherCode } from '@/lib/vouchers/code'
import {
  VOUCHER_EVENT_LABELS,
  VOUCHER_EVENTS,
  VOUCHER_STATUS_LABELS,
  VOUCHER_STATUSES,
  VOUCHER_TYPE_LABELS,
  VOUCHER_TYPES,
} from '@/lib/vouchers/constants'

/**
 * Gift vouchers (stage 7). One record = one code.
 *
 * - Shop vouchers (electronic / printed) are created ONLY by `src/vouchers/issue.ts` (order
 *   placement for electronic ones, "Vystavit" on the order screen for printed ones).
 * - Old-shop vouchers ("legacy") are entered by hand here (Create) or imported from CSV; they
 *   start as paid with the balance staff typed in.
 * - Status, balance, payment and redemptions change ONLY through the services
 *   (`src/vouchers/service.ts`) – the fields are read-only in the form (field access) so the
 *   balance can never be edited behind the redemption records' back. Staff may edit the note.
 *
 * Lifecycle and balance rules: `src/lib/vouchers/{constants,balance}.ts`. Access: admin + staff
 * manage, admin deletes; butcher and the public never see vouchers.
 */

const readOnly = { readOnly: true } as const
/** Writable on create (legacy entry), never on update through the API/form. */
const createOnly: { update: FieldAccess } = { update: () => false }
const serviceOnly: { create: FieldAccess; update: FieldAccess } = {
  create: () => false,
  update: () => false,
}

export const Vouchers: CollectionConfig = {
  slug: 'vouchers',
  labels: { singular: 'Dárkový poukaz', plural: 'Dárkové poukazy' },
  admin: {
    group: false, // custom nav group "Poukazy"
    useAsTitle: 'code',
    defaultColumns: ['code', 'value', 'balance', 'type', 'status', 'expiresOn', 'orderNumber'],
    listSearchableFields: ['code', 'codeNormalized', 'orderNumber', 'recipientName'],
    description:
      'Všechny poukazy. Hledat lze kódem (stačí část, bez pomlček). Platby a uplatnění se dělají ' +
      'v „Poukazy – platby“ a na stránce „Vyřízení objednávky“. Tlačítkem „Vytvořit“ zapíšete ' +
      'STARÝ poukaz ze starého e-shopu.',
    pagination: { defaultLimit: 50 },
  },
  defaultSort: '-createdAt',
  access: {
    read: editors,
    create: editors,
    update: editors,
    delete: adminOnly,
  },
  hooks: {
    beforeValidate: [
      ({ data, operation, req, context }) => {
        if (!data) return data
        if (typeof data.code === 'string') {
          const normalized = normalizeVoucherCode(data.code)
          data.codeNormalized = normalized
          data.code = displayVoucherCode(data.code)
        }
        // Created by a person in the admin = an old-shop voucher, already paid.
        if (operation === 'create' && req.user && !context?.voucherService) {
          data.type = 'legacy'
          const value = Number(data.value ?? 0)
          const balance =
            data.balance === undefined || data.balance === null ? value : Number(data.balance)
          data.balance = balance
          data.status = balance <= 0 ? 'redeemed' : balance < value ? 'partially-redeemed' : 'paid'
          data.paidAt = new Date().toISOString()
          data.paidBy = req.user.id
          data.history = [
            {
              event: 'issued',
              at: new Date().toISOString(),
              by: req.user.id,
              note: 'Starý poukaz ze starého e-shopu zapsán ručně.',
            },
          ]
        }
        return data
      },
    ],
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
          access: createOnly,
          admin: {
            width: '40%',
            description: 'U starého poukazu opište kód přesně z poukazu (mezery a pomlčky nevadí).',
          },
        },
        {
          name: 'value',
          type: 'number',
          label: 'Hodnota (Kč)',
          required: true,
          min: 1,
          access: createOnly,
          admin: { width: '20%' },
        },
        {
          name: 'balance',
          type: 'number',
          label: 'Zbývá (Kč)',
          min: 0,
          access: createOnly,
          admin: {
            width: '20%',
            description: 'U starého poukazu: kolik na něm ještě zbývá (prázdné = celá hodnota).',
          },
        },
        {
          name: 'expiresOn',
          type: 'date',
          label: 'Platnost do',
          required: true,
          access: createOnly,
          admin: {
            width: '20%',
            date: { pickerAppearance: 'dayOnly', displayFormat: 'd. M. yyyy' },
          },
        },
      ],
    },
    {
      // Uppercase, without dashes/spaces: what lookups compare. Unique = no code twice.
      name: 'codeNormalized',
      type: 'text',
      unique: true,
      index: true,
      admin: { hidden: true },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'type',
          type: 'select',
          label: 'Druh',
          required: true,
          defaultValue: 'legacy',
          options: VOUCHER_TYPES.map((value) => ({ value, label: VOUCHER_TYPE_LABELS[value] })),
          access: serviceOnly,
          admin: { ...readOnly, width: '33%' },
        },
        {
          name: 'status',
          type: 'select',
          label: 'Stav',
          required: true,
          defaultValue: 'issued',
          index: true,
          options: VOUCHER_STATUSES.map((value) => ({
            value,
            label: VOUCHER_STATUS_LABELS[value],
          })),
          access: serviceOnly,
          admin: { ...readOnly, width: '33%' },
        },
        {
          name: 'batch',
          type: 'relationship',
          relationTo: 'voucher-batches',
          label: 'Šarže',
          access: serviceOnly,
          admin: { ...readOnly, width: '34%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'order',
          type: 'relationship',
          relationTo: 'orders',
          label: 'Koupeno v objednávce',
          access: serviceOnly,
          admin: { ...readOnly, width: '50%' },
        },
        {
          name: 'orderNumber',
          type: 'text',
          label: 'Číslo objednávky (VS)',
          index: true,
          access: serviceOnly,
          admin: { ...readOnly, width: '50%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'recipientName',
          type: 'text',
          label: 'Pro koho (na poukazu)',
          access: serviceOnly,
          admin: { ...readOnly, width: '50%' },
        },
        {
          name: 'message',
          type: 'text',
          label: 'Věnování (na poukazu)',
          access: serviceOnly,
          admin: { ...readOnly, width: '50%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'paidAt',
          type: 'date',
          label: 'Zaplaceno',
          access: serviceOnly,
          admin: { ...readOnly, width: '50%', date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'paidBy',
          type: 'relationship',
          relationTo: 'users',
          label: 'Zaplacení označil(a)',
          access: serviceOnly,
          admin: { ...readOnly, width: '50%' },
        },
      ],
    },
    {
      name: 'redemptions',
      type: 'array',
      label: 'Uplatnění (kde se poukazem platilo)',
      labels: { singular: 'Uplatnění', plural: 'Uplatnění' },
      access: serviceOnly,
      admin: readOnly,
      fields: [
        {
          type: 'row',
          fields: [
            {
              // Not `order`: arrays already have an `_order` column (index name clash).
              name: 'redeemedIn',
              type: 'relationship',
              relationTo: 'orders',
              label: 'Objednávka',
              admin: { width: '30%' },
            },
            { name: 'orderNumber', type: 'text', label: 'Číslo', admin: { width: '20%' } },
            { name: 'amount', type: 'number', label: 'Částka (Kč)', admin: { width: '20%' } },
            {
              name: 'at',
              type: 'date',
              label: 'Kdy',
              admin: { width: '30%', date: { pickerAppearance: 'dayAndTime' } },
            },
          ],
        },
        { name: 'by', type: 'relationship', relationTo: 'users', label: 'Zapsal(a)' },
      ],
    },
    {
      name: 'history',
      type: 'array',
      label: 'Historie',
      labels: { singular: 'Událost', plural: 'Události' },
      access: serviceOnly,
      admin: { ...readOnly, initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'event',
              type: 'select',
              label: 'Co',
              options: VOUCHER_EVENTS.map((value) => ({
                value,
                label: VOUCHER_EVENT_LABELS[value],
              })),
              admin: { width: '30%' },
            },
            {
              name: 'at',
              type: 'date',
              label: 'Kdy',
              admin: { width: '30%', date: { pickerAppearance: 'dayAndTime' } },
            },
            {
              name: 'by',
              type: 'relationship',
              relationTo: 'users',
              label: 'Kdo',
              admin: { width: '40%' },
            },
          ],
        },
        { name: 'note', type: 'text', label: 'Poznámka' },
      ],
    },
    {
      name: 'note',
      type: 'textarea',
      label: 'Poznámka',
      admin: { description: 'Interní, zákazník ji nevidí (např. odkud starý poukaz je).' },
    },
  ],
}
