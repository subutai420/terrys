import type { CollectionConfig } from 'payload'

import { editors, publishedOrLoggedIn } from '@/access'
import { legacyUrlField, seoGroup } from '@/fields/common'
import { slugField } from '@/fields/slug'

import { ADMIN_GROUPS } from './adminGroups'

export const ARTICLE_SECTIONS = [
  { value: 'magazine', label: 'Magazín' },
  { value: 'academy', label: 'Terrys Academy' },
] as const

/**
 * Articles for the magazine (Magazín) and Terrys Academy. Drafts enabled.
 */
export const Articles: CollectionConfig = {
  slug: 'articles',
  labels: {
    singular: 'Článek',
    plural: 'Články',
  },
  admin: {
    group: ADMIN_GROUPS.content,
    useAsTitle: 'title',
    defaultColumns: ['title', 'section', 'publishedAt', '_status'],
    description: 'Články do Magazínu a Terrys Academy. Na webu se ukážou až po publikování.',
  },
  defaultSort: '-publishedAt',
  versions: {
    drafts: true,
    maxPerDoc: 30,
  },
  access: {
    read: publishedOrLoggedIn,
    create: editors,
    update: editors,
    delete: editors,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Nadpis',
      required: true,
    },
    {
      name: 'perex',
      type: 'textarea',
      label: 'Perex',
      admin: { description: 'Úvodní odstavec, zobrazí se i ve výpisu článků (2–3 věty).' },
    },
    {
      name: 'coverImage',
      type: 'upload',
      relationTo: 'media',
      label: 'Úvodní obrázek',
    },
    {
      name: 'content',
      type: 'richText',
      label: 'Text článku',
    },
    {
      name: 'relatedProducts',
      type: 'relationship',
      relationTo: 'products',
      hasMany: true,
      label: 'Související produkty',
      admin: { description: 'Produkty, které se zobrazí u článku.' },
    },
    seoGroup,
    // Sidebar
    slugField(),
    {
      name: 'section',
      type: 'select',
      label: 'Rubrika',
      required: true,
      defaultValue: 'magazine',
      options: [...ARTICLE_SECTIONS],
      admin: { position: 'sidebar' },
    },
    {
      name: 'authorName',
      type: 'text',
      label: 'Autor',
      admin: { position: 'sidebar', description: 'Např. „Řezníci z Terrysu“.' },
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: 'Datum zveřejnění',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayOnly', displayFormat: 'd. M. yyyy' },
        description: 'Datum zobrazené u článku. Prázdné = vyplní se při prvním publikování.',
      },
      hooks: {
        // Fill the date automatically when the article is published for the first time.
        beforeChange: [
          ({ value, siblingData }) =>
            !value && siblingData?._status === 'published' ? new Date().toISOString() : value,
        ],
      },
    },
    legacyUrlField,
  ],
}
