import type { CollectionConfig } from 'payload'

import { editors, publishedOrLoggedIn } from '@/access'
import { legacyUrlField, migrationGroup, seoGroup } from '@/fields/common'
import { previewUrl } from '@/fields/preview'
import { slugField } from '@/fields/slug'

import { storefrontRevalidationHooks } from '@/storefront/revalidate'

import { ADMIN_GROUPS } from './adminGroups'

/**
 * Recipes. Each recipe can list the products used in it ("V tomto receptu jsme použili").
 * Drafts enabled.
 */
export const Recipes: CollectionConfig = {
  slug: 'recipes',
  labels: {
    singular: 'Recept',
    plural: 'Recepty',
  },
  admin: {
    group: ADMIN_GROUPS.content,
    useAsTitle: 'title',
    preview: previewUrl('recipes'),
    defaultColumns: ['title', 'difficulty', 'publishedAt', '_status'],
    description:
      'Recepty. Postupy a teploty uvádějte jen ověřené (od majitele nebo řezníků). ' +
      'Na webu se ukážou až po publikování.',
  },
  defaultSort: '-publishedAt',
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
      label: 'Název receptu',
      required: true,
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Recept',
          fields: [
            {
              name: 'perex',
              type: 'textarea',
              label: 'Úvod',
              admin: { description: 'Krátký úvod k receptu, zobrazí se i ve výpisu.' },
            },
            {
              name: 'coverImage',
              type: 'upload',
              relationTo: 'media',
              label: 'Hlavní fotka',
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'prepTimeMinutes',
                  type: 'number',
                  label: 'Příprava (minuty)',
                  min: 0,
                  admin: { width: '25%' },
                },
                {
                  name: 'cookTimeMinutes',
                  type: 'number',
                  label: 'Tepelná úprava (minuty)',
                  min: 0,
                  admin: { width: '25%' },
                },
                {
                  name: 'servings',
                  type: 'number',
                  label: 'Počet porcí',
                  min: 1,
                  admin: { width: '25%' },
                },
                {
                  name: 'difficulty',
                  type: 'select',
                  label: 'Náročnost',
                  options: [
                    { value: 'easy', label: 'Snadná' },
                    { value: 'medium', label: 'Střední' },
                    { value: 'hard', label: 'Náročná' },
                  ],
                  admin: { width: '25%' },
                },
              ],
            },
            {
              name: 'coreTemperatureNote',
              type: 'text',
              label: 'Teplota v jádru',
              admin: {
                description:
                  'Nepovinné. Doporučená teplota uvnitř masa, např. „54 °C pro medium rare“. ' +
                  'Jen ověřené údaje.',
              },
            },
            {
              name: 'ingredients',
              type: 'array',
              label: 'Suroviny',
              labels: { singular: 'Surovina', plural: 'Suroviny' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'amount',
                      type: 'text',
                      label: 'Množství',
                      admin: { width: '20%', description: 'Např. „2“, „1–2“, „špetka“.' },
                    },
                    {
                      name: 'unit',
                      type: 'text',
                      label: 'Jednotka',
                      admin: { width: '20%', description: 'Např. g, ks, lžíce.' },
                    },
                    {
                      name: 'name',
                      type: 'text',
                      label: 'Surovina',
                      required: true,
                      admin: { width: '60%' },
                    },
                  ],
                },
              ],
            },
            {
              name: 'steps',
              type: 'array',
              label: 'Postup',
              labels: { singular: 'Krok', plural: 'Kroky' },
              fields: [
                {
                  name: 'text',
                  type: 'textarea',
                  label: 'Popis kroku',
                  required: true,
                },
                {
                  name: 'image',
                  type: 'upload',
                  relationTo: 'media',
                  label: 'Fotka ke kroku',
                },
              ],
            },
            {
              // Added in stage 8: old recipes are long texts with photos and links between the
              // steps, which the plain-text steps cannot hold. Also for tips and serving notes.
              name: 'content',
              type: 'richText',
              label: 'Text receptu (úvod, tipy, fotky)',
              admin: {
                description:
                  'Nepovinné. Delší text k receptu: úvod, tipy, fotky s popisem. Suroviny a ' +
                  'postup patří do polí výše.',
              },
            },
            {
              name: 'relatedProducts',
              type: 'relationship',
              relationTo: 'products',
              hasMany: true,
              label: 'V tomto receptu jsme použili',
              admin: { description: 'Produkty z e-shopu, které se v receptu používají.' },
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
      name: 'publishedAt',
      type: 'date',
      label: 'Datum zveřejnění',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayOnly', displayFormat: 'd. M. yyyy' },
        description: 'Prázdné = vyplní se při prvním publikování.',
      },
      hooks: {
        beforeChange: [
          ({ value, siblingData }) =>
            !value && siblingData?._status === 'published' ? new Date().toISOString() : value,
        ],
      },
    },
    legacyUrlField,
    migrationGroup,
  ],
}
