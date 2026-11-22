import type { GlobalConfig } from 'payload'

import { anyone, editors } from '@/access'
import { ADMIN_GROUPS } from '@/collections/adminGroups'
import { revalidateGlobalAfterChange } from '@/storefront/revalidate'

import { HOMEPAGE_DEFAULTS as D } from './homepageDefaults'

/**
 * Editable blocks of the storefront homepage ("Úvodní stránka"). Everything else on the homepage
 * (latest articles and recipes, country tiles) is filled automatically from the catalog.
 * Empty fields fall back to the defaults in `homepageDefaults.ts`; an empty section (e.g. the
 * story) is simply not shown.
 */
export const Homepage: GlobalConfig = {
  slug: 'homepage',
  label: 'Úvodní stránka',
  admin: {
    group: ADMIN_GROUPS.content,
    description:
      'Texty a výběr kategorií a produktů na úvodní stránce obchodu. Nejnovější články, recepty ' +
      'a dlaždice zemí se doplňují samy. Prázdná pole = výchozí text, prázdná sekce se neukáže.',
  },
  access: {
    read: anyone,
    update: editors,
  },
  hooks: {
    afterChange: [revalidateGlobalAfterChange],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Úvod',
          fields: [
            {
              name: 'hero',
              type: 'group',
              label: 'Úvodní pás s fotkou',
              fields: [
                {
                  name: 'heading',
                  type: 'text',
                  label: 'Nadpis',
                  defaultValue: D.hero.heading,
                },
                {
                  name: 'text',
                  type: 'textarea',
                  label: 'Text pod nadpisem',
                  defaultValue: D.hero.text,
                },
                {
                  name: 'image',
                  type: 'upload',
                  relationTo: 'media',
                  label: 'Fotka na pozadí',
                  admin: {
                    description:
                      'Široká fotka (ideálně alespoň 1600 px). Bez fotky se ukáže tmavé pozadí.',
                  },
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'primaryLabel',
                      type: 'text',
                      label: 'Hlavní tlačítko – text',
                      defaultValue: D.hero.primaryLabel,
                      admin: { width: '50%' },
                    },
                    {
                      name: 'primaryUrl',
                      type: 'text',
                      label: 'Hlavní tlačítko – odkaz',
                      defaultValue: D.hero.primaryUrl,
                      admin: { width: '50%', description: 'Např. „/produkty“.' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'secondaryLabel',
                      type: 'text',
                      label: 'Druhé tlačítko – text',
                      admin: { width: '50%', description: 'Nepovinné, např. „Dárkové poukazy“.' },
                    },
                    {
                      name: 'secondaryUrl',
                      type: 'text',
                      label: 'Druhé tlačítko – odkaz',
                      admin: { width: '50%' },
                    },
                  ],
                },
              ],
            },
            {
              name: 'trustItems',
              type: 'array',
              label: 'Proč nakoupit u nás (lišta pod úvodem)',
              labels: { singular: 'Položka', plural: 'Položky' },
              maxRows: 4,
              defaultValue: D.trustItems.map((item) => ({ ...item })),
              admin: {
                description:
                  'Nejvýše 4 krátké body. Ve druhém řádku můžete napsat {doprava} – nahradí se ' +
                  'cenou dopravy z Nastavení obchodu. Neuvádějte slevy ani dopravu zdarma.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'title',
                      type: 'text',
                      label: 'Tučný řádek',
                      required: true,
                      admin: { width: '50%' },
                    },
                    { name: 'text', type: 'text', label: 'Druhý řádek', admin: { width: '50%' } },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Kategorie a produkty',
          fields: [
            {
              name: 'featuredCategories',
              type: 'group',
              label: 'Nejoblíbenější řezy (velké karty)',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'heading',
                      type: 'text',
                      label: 'Nadpis',
                      defaultValue: D.featuredCategoriesHeading,
                      admin: { width: '50%' },
                    },
                    {
                      name: 'subheading',
                      type: 'text',
                      label: 'Podnadpis',
                      defaultValue: D.featuredCategoriesSubheading,
                      admin: { width: '50%' },
                    },
                  ],
                },
                {
                  name: 'categories',
                  type: 'relationship',
                  relationTo: 'categories',
                  hasMany: true,
                  label: 'Kategorie',
                  admin: {
                    description:
                      'Ideálně 4 kategorie s fotkou. Prázdné = kategorie ze sloupce menu „Podle řezu“.',
                  },
                },
              ],
            },
            {
              name: 'origins',
              type: 'group',
              label: 'Dlaždice zemí',
              admin: {
                description:
                  'Dlaždice se berou z číselníku Země původu (jen země, ze kterých máme produkty). ' +
                  'Kam dlaždice vede, nastavíte u země polem „Kategorie země“.',
              },
              fields: [
                {
                  name: 'heading',
                  type: 'text',
                  label: 'Nadpis',
                  defaultValue: D.originsHeading,
                },
                {
                  name: 'list',
                  type: 'relationship',
                  relationTo: 'origins',
                  hasMany: true,
                  label: 'Výběr a pořadí zemí',
                  admin: { description: 'Nepovinné. Prázdné = všechny země s produkty.' },
                },
              ],
            },
            {
              name: 'otherCategories',
              type: 'group',
              label: 'Další kategorie (malé dlaždice)',
              fields: [
                {
                  name: 'heading',
                  type: 'text',
                  label: 'Nadpis',
                  defaultValue: D.otherCategoriesHeading,
                },
                {
                  name: 'categories',
                  type: 'relationship',
                  relationTo: 'categories',
                  hasMany: true,
                  label: 'Kategorie',
                  admin: {
                    description:
                      'Ideálně 6 kategorií. Prázdné = kategorie ze sloupce menu „Podle druhu masa“ ' +
                      'a samostatné položky.',
                  },
                },
              ],
            },
            {
              name: 'featuredProducts',
              type: 'group',
              label: 'Doporučené produkty',
              fields: [
                {
                  name: 'heading',
                  type: 'text',
                  label: 'Nadpis',
                  defaultValue: D.featuredProductsHeading,
                },
                {
                  name: 'products',
                  type: 'relationship',
                  relationTo: 'products',
                  hasMany: true,
                  label: 'Produkty',
                  admin: { description: 'Nepovinné. Prázdné = sekce se neukáže.' },
                },
              ],
            },
          ],
        },
        {
          label: 'Příběh a magazín',
          fields: [
            {
              name: 'story',
              type: 'group',
              label: 'Pás „O nás“ (hnědý)',
              admin: { description: 'Ukáže se jen s vyplněným nadpisem a textem.' },
              fields: [
                { name: 'heading', type: 'text', label: 'Nadpis' },
                {
                  name: 'text',
                  type: 'textarea',
                  label: 'Text (odstavce oddělte prázdným řádkem)',
                },
                { name: 'image', type: 'upload', relationTo: 'media', label: 'Fotka' },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'linkLabel',
                      type: 'text',
                      label: 'Tlačítko – text',
                      admin: { width: '50%' },
                    },
                    {
                      name: 'linkUrl',
                      type: 'text',
                      label: 'Tlačítko – odkaz',
                      admin: { width: '50%' },
                    },
                  ],
                },
              ],
            },
            {
              name: 'magazine',
              type: 'group',
              label: 'Magazín a recepty',
              admin: { description: 'Nejnovější 3 články a 3 recepty se doplní samy.' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'heading',
                      type: 'text',
                      label: 'Nadpis magazínu',
                      defaultValue: D.magazineHeading,
                      admin: { width: '50%' },
                    },
                    {
                      name: 'subheading',
                      type: 'text',
                      label: 'Podnadpis magazínu',
                      defaultValue: D.magazineSubheading,
                      admin: { width: '50%' },
                    },
                  ],
                },
                {
                  name: 'recipesHeading',
                  type: 'text',
                  label: 'Nadpis receptů',
                  defaultValue: D.recipesHeading,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
