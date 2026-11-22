import type { GroupField, NumberField, TextField } from 'payload'

/**
 * Small reusable field definitions shared by several collections.
 */

/** Old terrys.cz URL of the same item; used later to create 301 redirects from the old web. */
export const legacyUrlField: TextField = {
  name: 'legacyUrl',
  type: 'text',
  label: 'Původní URL (starý web)',
  index: true,
  admin: {
    position: 'sidebar',
    description:
      'Adresa této položky na starém webu terrys.cz, např. „/produkty/wagyu-98“. Slouží k ' +
      'automatickému přesměrování (301) ze starých odkazů. Nepovinné.',
  },
}

/** Manual ordering in lists and menus (lower number = earlier). */
export const sortOrderField = (): NumberField => ({
  name: 'sortOrder',
  type: 'number',
  label: 'Pořadí',
  defaultValue: 100,
  admin: {
    position: 'sidebar',
    description: 'Nižší číslo = zobrazí se dříve. Položky se stejným číslem se řadí podle názvu.',
  },
})

/** SEO fields: title and description for search engines and social sharing. */
export const seoGroup: GroupField = {
  name: 'seo',
  type: 'group',
  label: 'SEO (vyhledávače)',
  admin: {
    description: 'Nepovinné. Když pole necháte prázdná, použije se název a úvodní text stránky.',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'SEO titulek',
      maxLength: 70,
      admin: {
        description: 'Titulek ve výsledcích vyhledávání, ideálně 50–60 znaků.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'SEO popis',
      maxLength: 200,
      admin: {
        description: 'Krátký popis ve výsledcích vyhledávání, ideálně 120–160 znaků.',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      label: 'Obrázek pro sdílení',
      admin: {
        description:
          'Obrázek při sdílení na Facebooku apod. Když chybí, použije se hlavní obrázek.',
      },
    },
  ],
}

/** Name field used by code lists (číselníky). */
export const nameField: TextField = {
  name: 'name',
  type: 'text',
  label: 'Název',
  required: true,
}
