import type { CollectionConfig } from 'payload'

import { adminOnly, editors, nobody, orderReaders } from '@/access'
import {
  EMAIL_STATUS_LABELS,
  EMAIL_STATUSES,
  WITHDRAWAL_STATUS_LABELS,
  WITHDRAWAL_STATUSES,
} from '@/lib/orders/constants'

import { ADMIN_GROUPS } from './adminGroups'

/**
 * Withdrawals from the contract ("odstoupení od smlouvy") submitted through the online function
 * at /odstoupeni-od-smlouvy (stage 4). Created only by the server. A withdrawal is recorded even
 * when the order cannot be matched (the customer exercised a right; staff resolve it by hand).
 * The matched order shows its withdrawals in the tab "Interní".
 *
 * Whether the right applies (perishable food: § 1837 občanského zákoníku) is decided by the
 * staff/owner case by case – the form itself is neutral.
 */
export const Withdrawals: CollectionConfig = {
  slug: 'withdrawals',
  labels: { singular: 'Odstoupení od smlouvy', plural: 'Odstoupení od smlouvy' },
  admin: {
    group: ADMIN_GROUPS.orders,
    useAsTitle: 'name',
    defaultColumns: ['submittedAt', 'orderNumberEntered', 'name', 'order', 'status'],
    description:
      'Odstoupení odeslaná zákazníky přes formulář na webu. Zákazník dostal potvrzení e-mailem. ' +
      'U potravin podléhajících rychlé zkáze odstoupení obvykle nelze – posuďte každý případ.',
  },
  defaultSort: '-submittedAt',
  access: {
    read: orderReaders,
    create: nobody,
    update: editors,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'status',
      type: 'select',
      label: 'Stav vyřízení',
      required: true,
      defaultValue: 'new',
      options: WITHDRAWAL_STATUSES.map((value) => ({
        value,
        label: WITHDRAWAL_STATUS_LABELS[value],
      })),
      admin: { position: 'sidebar' },
    },
    {
      name: 'submittedAt',
      type: 'date',
      label: 'Odesláno',
      required: true,
      admin: { readOnly: true, position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'order',
      type: 'relationship',
      relationTo: 'orders',
      label: 'Objednávka',
      admin: {
        position: 'sidebar',
        description:
          'Dohledáno podle čísla objednávky a e-mailu. Prázdné = nedohledáno, ověřte ručně.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'name',
          type: 'text',
          label: 'Jméno a příjmení',
          required: true,
          admin: { readOnly: true, width: '50%' },
        },
        {
          name: 'email',
          type: 'email',
          label: 'E-mail',
          required: true,
          admin: { readOnly: true, width: '50%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'orderNumberEntered',
          type: 'text',
          label: 'Číslo objednávky (jak ho zadal)',
          required: true,
          admin: { readOnly: true, width: '50%' },
        },
        { name: 'phone', type: 'text', label: 'Telefon', admin: { readOnly: true, width: '50%' } },
      ],
    },
    {
      name: 'items',
      type: 'textarea',
      label: 'Čeho se odstoupení týká',
      admin: { readOnly: true, description: 'Prázdné = celé objednávky.' },
    },
    {
      name: 'message',
      type: 'textarea',
      label: 'Zpráva zákazníka (nepovinná)',
      admin: { readOnly: true },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'confirmationStatus',
          type: 'select',
          label: 'Potvrzení zákazníkovi (e-mail)',
          defaultValue: 'pending',
          options: EMAIL_STATUSES.map((value) => ({ value, label: EMAIL_STATUS_LABELS[value] })),
          admin: { readOnly: true, width: '50%' },
        },
        {
          name: 'confirmationSentAt',
          type: 'date',
          label: 'Potvrzení odesláno',
          admin: { readOnly: true, width: '50%', date: { pickerAppearance: 'dayAndTime' } },
        },
      ],
    },
    {
      name: 'confirmationError',
      type: 'textarea',
      label: 'Chyba při odeslání potvrzení',
      admin: {
        readOnly: true,
        condition: (data) => Boolean(data?.confirmationError),
        description: 'Odstoupení platí i bez potvrzení. Pošlete ho zákazníkovi ručně.',
      },
    },
    {
      name: 'internalNote',
      type: 'textarea',
      label: 'Interní poznámka',
    },
  ],
}
