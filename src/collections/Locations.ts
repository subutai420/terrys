import type { CollectionConfig, Field } from 'payload'

import { adminOnly, anyone } from '@/access'
import { sortOrderField } from '@/fields/common'
import { slugField } from '@/fields/slug'

import { storefrontRevalidationHooks } from '@/storefront/revalidate'

import { ADMIN_GROUPS } from './adminGroups'

const WEEKDAYS = [
  { name: 'monday', label: 'Pondělí' },
  { name: 'tuesday', label: 'Úterý' },
  { name: 'wednesday', label: 'Středa' },
  { name: 'thursday', label: 'Čtvrtek' },
  { name: 'friday', label: 'Pátek' },
  { name: 'saturday', label: 'Sobota' },
  { name: 'sunday', label: 'Neděle' },
] as const

const openingHoursFields: Field[] = WEEKDAYS.map(({ name, label }) => ({
  name,
  type: 'text',
  label,
  admin: { width: '33%', placeholder: 'např. 9:30–17:30' },
}))

/**
 * Physical places: the shop in Prague (Italská 17) and the pickup warehouse Slivínko.
 * Stage 2 (delivery) uses `isPickupPoint` to offer personal pickup (always free).
 * Only administrators can edit; anyone can read (shown on the storefront).
 */
export const Locations: CollectionConfig = {
  slug: 'locations',
  labels: {
    singular: 'Provozovna',
    plural: 'Provozovny a odběrná místa',
  },
  admin: {
    group: ADMIN_GROUPS.settings,
    useAsTitle: 'name',
    defaultColumns: ['name', 'kind', 'isPickupPoint', 'sortOrder'],
    description: 'Prodejna a odběrná místa: adresa, otevírací doba, mapa. Upravuje administrátor.',
  },
  defaultSort: ['sortOrder', 'name'],
  // Stage 3: clear the storefront cache after every change (src/storefront/revalidate.ts).
  hooks: { ...storefrontRevalidationHooks },
  access: {
    read: anyone,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Název',
      required: true,
      admin: { description: 'Např. „Prodejna Praha 2 – Vinohrady“.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'kind',
          type: 'select',
          label: 'Typ',
          required: true,
          defaultValue: 'shop',
          options: [
            { value: 'shop', label: 'Prodejna' },
            { value: 'warehouse', label: 'Sklad / výdejní místo' },
          ],
          admin: { width: '50%' },
        },
        {
          name: 'isPickupPoint',
          type: 'checkbox',
          label: 'Lze zde vyzvednout objednávku (osobní odběr zdarma)',
          defaultValue: true,
          admin: { width: '50%' },
        },
      ],
    },
    {
      name: 'address',
      type: 'group',
      label: 'Adresa',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'street', type: 'text', label: 'Ulice a číslo', admin: { width: '40%' } },
            { name: 'city', type: 'text', label: 'Obec / část obce', admin: { width: '40%' } },
            { name: 'zip', type: 'text', label: 'PSČ', admin: { width: '20%' } },
          ],
        },
      ],
    },
    {
      name: 'openingHours',
      type: 'group',
      label: 'Otevírací doba',
      admin: {
        description: 'Pro každý den, např. „9:30–17:30“. Prázdné pole = zavřeno.',
      },
      fields: [
        { type: 'row', fields: openingHoursFields.slice(0, 3) },
        { type: 'row', fields: openingHoursFields.slice(3, 6) },
        { type: 'row', fields: openingHoursFields.slice(6) },
        {
          name: 'note',
          type: 'text',
          label: 'Poznámka k otevírací době',
          admin: { description: 'Např. „Ve svátky zavřeno“ nebo „Výdej jen po domluvě“.' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'phone', type: 'text', label: 'Telefon', admin: { width: '50%' } },
        { name: 'email', type: 'email', label: 'E-mail', admin: { width: '50%' } },
      ],
    },
    {
      name: 'mapUrl',
      type: 'text',
      label: 'Odkaz na mapu',
      admin: { description: 'Odkaz na Mapy.cz nebo Google Maps.' },
    },
    {
      name: 'parkingNote',
      type: 'textarea',
      label: 'Parkování a příjezd',
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      label: 'Fotka',
    },
    {
      // Stage 3: the store page (Obsah → Stránky) shows this place's address, hours and map.
      name: 'page',
      type: 'relationship',
      relationTo: 'pages',
      label: 'Stránka prodejny na webu',
      admin: {
        description:
          'Nepovinné. Stránka, na které se ukáže adresa, otevírací doba a „dnes otevřeno“, ' +
          'např. „Prodejna Terrys Steak Praha“.',
      },
    },
    slugField({ from: 'name' }),
    sortOrderField(),
  ],
}
