import type { CollectionConfig, TextareaFieldValidation } from 'payload'

import { adminOnly, loggedIn } from '@/access'
import { weekdaysField } from '@/fields/delivery'
import { normalizePatternText, parsePostcodePatterns } from '@/lib/delivery/postcodePatterns'

import { ADMIN_GROUPS } from './adminGroups'

const validatePatterns: TextareaFieldValidation = (value) => {
  const { patterns, invalid } = parsePostcodePatterns(value ?? '')
  if (invalid.length) {
    return (
      `Neplatné položky: ${invalid.join(', ')}. Zadejte celé PSČ (např. 250 01) nebo ` +
      'začátek PSČ s hvězdičkou (např. 1* nebo 252*).'
    )
  }
  if (!patterns.length) return 'Zadejte alespoň jedno PSČ nebo začátek PSČ s hvězdičkou.'
  return true
}

/**
 * Delivery zones: which postcodes a delivery method serves, optionally with its own weekdays.
 * A handful of zones with postcode prefixes ("1*" = Prague) replaces editing thousands of
 * postcode rows. When several zones of one method match a postcode, the most specific one wins
 * (full postcode > longer prefix > shorter prefix).
 */
export const DeliveryZones: CollectionConfig = {
  slug: 'delivery-zones',
  labels: {
    singular: 'Rozvozová oblast',
    plural: 'Rozvozové oblasti',
  },
  admin: {
    group: ADMIN_GROUPS.delivery,
    useAsTitle: 'name',
    defaultColumns: ['name', 'method', 'postcodes', 'weekdays', 'active'],
    description:
      'Která PSČ obsluhuje daný způsob dopravy a ve které dny. Zadávají se celá PSČ nebo ' +
      'začátky PSČ s hvězdičkou (1* = celá Praha). Upravuje administrátor.',
  },
  defaultSort: 'name',
  access: {
    read: loggedIn,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'name',
          type: 'text',
          label: 'Název oblasti',
          required: true,
          admin: { width: '50%', description: 'Např. „Praha“ nebo „Mladoboleslavsko“.' },
        },
        {
          name: 'method',
          type: 'relationship',
          relationTo: 'shipping-methods',
          label: 'Způsob dopravy',
          required: true,
          filterOptions: { type: { not_equals: 'pickup' } },
          admin: { width: '50%' },
        },
      ],
    },
    {
      name: 'postcodes',
      type: 'textarea',
      label: 'PSČ v oblasti',
      required: true,
      validate: validatePatterns,
      hooks: {
        // Tidy up on save: "250 01,1*" -> "25001, 1*"
        beforeValidate: [
          ({ value }) => (typeof value === 'string' ? normalizePatternText(value) || value : value),
        ],
      },
      admin: {
        placeholder: '1*, 250 01, 252*',
        description:
          'Oddělte čárkou nebo novým řádkem. Celé PSČ (250 01) = jen toto PSČ; začátek s ' +
          'hvězdičkou (252*) = všechna PSČ začínající 252. Praha = 1*.',
      },
    },
    weekdaysField({
      admin: {
        description:
          'Nepovinné. Prázdné = dny podle způsobu dopravy. Vyplňte, pokud sem jezdíme jen ' +
          'v některé dny (např. jen ve středu).',
      },
    }),
    {
      name: 'note',
      type: 'textarea',
      label: 'Interní poznámka',
    },
    {
      name: 'active',
      type: 'checkbox',
      label: 'Aktivní',
      defaultValue: true,
      admin: { position: 'sidebar' },
    },
  ],
}
