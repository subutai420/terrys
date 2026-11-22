import type { CollectionConfig } from 'payload'

import { editors, publishedOrLoggedIn } from '@/access'
import { legacyUrlField, migrationGroup, seoGroup } from '@/fields/common'
import { previewUrl } from '@/fields/preview'
import { slugField } from '@/fields/slug'

import { storefrontRevalidationHooks } from '@/storefront/revalidate'

import { ADMIN_GROUPS } from './adminGroups'

/**
 * Static pages: Doprava a platba, Obchodní podmínky, Ochrana osobních údajů (GDPR), O nás,
 * Vše o nákupu, ... Drafts enabled.
 */
export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: {
    singular: 'Stránka',
    plural: 'Stránky',
  },
  admin: {
    group: ADMIN_GROUPS.content,
    useAsTitle: 'title',
    preview: previewUrl('pages'),
    defaultColumns: ['title', 'slug', '_status', 'updatedAt'],
    description:
      'Stálé stránky webu (Doprava a platba, Obchodní podmínky, O nás…). Změny se na webu ' +
      'projeví po publikování.',
  },
  defaultSort: 'title',
  versions: {
    drafts: true,
    maxPerDoc: 30,
  },
  // Stage 3: clear the storefront cache after every change (src/storefront/revalidate.ts).
  hooks: { ...storefrontRevalidationHooks },
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
      name: 'content',
      type: 'richText',
      label: 'Obsah stránky',
    },
    seoGroup,
    slugField(),
    legacyUrlField,
    migrationGroup,
  ],
}
