import type { CollectionConfig, Field } from 'payload'

import { anyone, editors } from '@/access'
import { nameField, sortOrderField } from '@/fields/common'
import { slugField } from '@/fields/slug'

import { ADMIN_GROUPS } from './adminGroups'

/**
 * Code lists (číselníky): small lists of values that products refer to (cut, country of
 * origin, meat type, "hodí se na", shelf life). They all share the same structure, so they are
 * built by one factory function. Every code list is readable by anyone (the storefront uses them
 * for filters) and editable by admin and staff.
 */
type CodeListOptions = {
  slug: string
  singular: string
  plural: string
  description: string
  /** Show the illustrative image field. Default true. */
  withImage?: boolean
  /** Extra fields inserted after the name. */
  extraFields?: Field[]
}

function codeListCollection({
  slug,
  singular,
  plural,
  description,
  withImage = true,
  extraFields = [],
}: CodeListOptions): CollectionConfig {
  return {
    slug,
    labels: { singular, plural },
    admin: {
      group: ADMIN_GROUPS.codeLists,
      useAsTitle: 'name',
      defaultColumns: ['name', 'slug', 'sortOrder'],
      description,
    },
    defaultSort: ['sortOrder', 'name'],
    access: {
      read: anyone,
      create: editors,
      update: editors,
      delete: editors,
    },
    fields: [
      nameField,
      ...extraFields,
      {
        name: 'description',
        type: 'textarea',
        label: 'Popis',
        admin: {
          description: 'Nepovinné. Krátký text, který se může zobrazit u filtru nebo na stránce.',
        },
      },
      ...(withImage
        ? [
            {
              name: 'image',
              type: 'upload',
              relationTo: 'media',
              label: 'Ilustrační obrázek',
            } satisfies Field,
          ]
        : []),
      slugField({ from: 'name' }),
      sortOrderField(),
    ],
  }
}

export const Cuts = codeListCollection({
  slug: 'cuts',
  singular: 'Řez',
  plural: 'Řezy',
  description: 'Části masa, např. Rib Eye, Svíčková, Striploin, Flank, Picanha.',
  extraFields: [
    {
      name: 'alternativeName',
      type: 'text',
      label: 'Druhý název',
      admin: {
        description:
          'Nepovinné. Český nebo anglický ekvivalent, např. u „Rib Eye“ je to „Vysoký roštěnec“.',
      },
    },
  ],
})

export const Origins = codeListCollection({
  slug: 'origins',
  singular: 'Země původu',
  plural: 'Země původu',
  description: 'Odkud maso pochází, např. Argentina, Uruguay, Austrálie, Japonsko.',
  extraFields: [
    {
      name: 'adjective',
      type: 'text',
      label: 'Přívlastek',
      admin: { description: 'Nepovinné. Např. „Argentinské hovězí“ – pro nadpisy a menu.' },
    },
  ],
})

export const MeatTypes = codeListCollection({
  slug: 'meat-types',
  singular: 'Druh masa',
  plural: 'Druhy masa',
  description: 'Např. hovězí, wagyu, telecí, zvěřina, drůbež, jehněčí, uzeniny.',
})

export const Usages = codeListCollection({
  slug: 'usages',
  singular: 'Hodí se na',
  plural: 'Hodí se na',
  description: 'Způsob přípravy, ke kterému se produkt hodí, např. grilování, pečení, na pánev.',
  withImage: false,
})

export const ShelfLives = codeListCollection({
  slug: 'shelf-lives',
  singular: 'Trvanlivost a skladování',
  plural: 'Trvanlivost a skladování',
  description:
    'Jak produkt skladovat a jak dlouho vydrží, např. „Chlazené, vakuově balené“ nebo „Mražené“. ' +
    'Konkrétní údaje o trvanlivosti uvádějte jen ověřené.',
  withImage: false,
})
