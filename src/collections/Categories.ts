import type { CollectionConfig } from 'payload'

import { anyone, editors } from '@/access'
import { legacyUrlField, migrationGroup, seoGroup } from '@/fields/common'
import { previewUrl } from '@/fields/preview'
import { slugField } from '@/fields/slug'

import { storefrontRevalidationHooks } from '@/storefront/revalidate'

import { ADMIN_GROUPS } from './adminGroups'

/** Which column of the storefront mega-menu a category belongs to. */
export const MENU_COLUMNS = [
  { value: 'meat-type', label: 'Podle druhu masa' },
  { value: 'cut', label: 'Podle řezu' },
  { value: 'origin', label: 'Podle původu' },
  { value: 'standalone', label: 'Samostatná položka' },
] as const

/**
 * Product categories, e.g. "Steaky" > "Argentinské hovězí". Categories can be nested (parent)
 * and a product can belong to several categories (the relation is stored on the product,
 * field `categories`; the category shows the list of its products read-only).
 *
 * Categories have no drafts: a category is visible on the storefront once it is saved
 * (later the storefront may hide categories with no visible products).
 */
export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: {
    singular: 'Kategorie',
    plural: 'Kategorie',
  },
  admin: {
    group: ADMIN_GROUPS.catalog,
    useAsTitle: 'title',
    preview: previewUrl('categories'),
    defaultColumns: ['title', 'parent', 'menuColumn', 'menuOrder', 'slug'],
    description:
      'Kategorie v menu obchodu. Kategorie může mít nadřazenou kategorii a produkt může být ' +
      've více kategoriích najednou.',
  },
  defaultSort: ['menuOrder', 'title'],
  // Stage 3: clear the storefront cache after every change (src/storefront/revalidate.ts).
  hooks: { ...storefrontRevalidationHooks },
  access: {
    read: anyone,
    create: editors,
    update: editors,
    delete: editors,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Název',
      required: true,
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Obsah',
          fields: [
            {
              name: 'image',
              type: 'upload',
              relationTo: 'media',
              label: 'Ilustrační obrázek',
              admin: { description: 'Obrázek kategorie v menu a na dlaždicích.' },
            },
            {
              name: 'intro',
              type: 'richText',
              label: 'Úvodní text',
              admin: { description: 'Krátký text nad seznamem produktů.' },
            },
            {
              name: 'bottomText',
              type: 'richText',
              label: 'SEO text pod produkty',
              admin: {
                description:
                  'Delší text pod seznamem produktů (pro vyhledávače i zvídavé zákazníky).',
              },
            },
          ],
        },
        {
          label: 'Produkty',
          fields: [
            {
              name: 'products',
              type: 'join',
              collection: 'products',
              on: 'categories',
              label: 'Produkty v kategorii',
              admin: {
                description:
                  'Jen pro přehled. Produkt do kategorie zařadíte v detailu produktu (pole Kategorie).',
                defaultColumns: ['title', 'availability', 'price', '_status'],
              },
            },
          ],
        },
        {
          label: 'SEO',
          fields: [seoGroup],
        },
      ],
    },
    // Sidebar
    slugField(),
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'categories',
      label: 'Nadřazená kategorie',
      admin: {
        position: 'sidebar',
        description: 'Nechte prázdné u hlavních kategorií.',
      },
      // A category cannot be its own parent.
      filterOptions: ({ id }) => (id ? { id: { not_equals: id } } : true),
    },
    {
      name: 'menuColumn',
      type: 'select',
      label: 'Sloupec v menu',
      options: [...MENU_COLUMNS],
      admin: {
        position: 'sidebar',
        description:
          'Ve kterém sloupci rozbalovacího menu se kategorie ukáže. Prázdné = není v menu.',
      },
    },
    {
      name: 'menuOrder',
      type: 'number',
      label: 'Pořadí v menu',
      defaultValue: 100,
      admin: {
        position: 'sidebar',
        description: 'Nižší číslo = výše v menu.',
      },
    },
    legacyUrlField,
    migrationGroup,
  ],
}
