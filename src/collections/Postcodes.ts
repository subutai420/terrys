import type { CollectionConfig, TextFieldSingleValidation } from 'payload'

import { adminOnly, loggedIn } from '@/access'
import { postcodeExportEndpoint, postcodeImportEndpoint } from '@/delivery/postcodeEndpoints'
import { normalizePostcode, POSTCODE_REGEX } from '@/lib/delivery/constants'

import { ADMIN_GROUPS } from './adminGroups'

const validateCode: TextFieldSingleValidation = (value) =>
  typeof value === 'string' && POSTCODE_REGEX.test(normalizePostcode(value))
    ? true
    : 'PSČ musí mít 5 číslic a začínat číslicí 1–7, např. 120 00.'

/**
 * Czech postcodes (the official list is imported from CSV; ~15 000 rows are never edited by
 * hand). A postcode must be in this list to get any delivery method; unknown postcodes get
 * personal pickup only. `deliveryBlocked` switches delivery off for one postcode.
 *
 * Bulk changes: CSV import/export above the list (`/api/postcodes/import`, `/export`), or the
 * admin's built-in bulk edit (select rows → Upravit).
 */
export const Postcodes: CollectionConfig = {
  slug: 'postcodes',
  labels: {
    singular: 'PSČ',
    plural: 'PSČ',
  },
  admin: {
    group: ADMIN_GROUPS.delivery,
    useAsTitle: 'code',
    defaultColumns: ['code', 'city', 'district', 'deliveryBlocked'],
    listSearchableFields: ['code', 'city', 'district'],
    pagination: { defaultLimit: 50 },
    description:
      'Seznam PSČ v ČR. Doručujeme jen na PSČ z tohoto seznamu (ostatním nabídneme osobní ' +
      'odběr). Hromadně se plní importem CSV. Upravuje administrátor.',
    components: {
      beforeListTable: ['/components/admin/PostcodeImport#PostcodeImport'],
    },
  },
  defaultSort: 'code',
  access: {
    read: loggedIn,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  endpoints: [postcodeImportEndpoint, postcodeExportEndpoint],
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'code',
          type: 'text',
          label: 'PSČ',
          required: true,
          unique: true,
          index: true,
          validate: validateCode,
          hooks: {
            beforeValidate: [
              ({ value }) => (typeof value === 'string' ? normalizePostcode(value) : value),
            ],
          },
          admin: { width: '20%', placeholder: '12000', description: '5 číslic bez mezery.' },
        },
        {
          name: 'city',
          type: 'text',
          label: 'Obec / pošta',
          admin: { width: '40%' },
        },
        {
          name: 'district',
          type: 'text',
          label: 'Okres / popis',
          admin: { width: '40%' },
        },
      ],
    },
    {
      name: 'deliveryBlocked',
      type: 'checkbox',
      label: 'Nedoručujeme – nabídnout jen osobní odběr',
      defaultValue: false,
      index: true,
    },
  ],
}
