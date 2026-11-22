import type { Field } from 'payload'

/**
 * Stage 6: product feed settings on categories and products (`src/feeds`). Shop-wide defaults
 * live in the global "Marketing" (`src/globals/Marketing.ts`).
 *
 * Category mapping: a product uses the first non-empty value found on its categories (primary
 * category first, then its parents, then its other categories), otherwise the global default.
 */
export const categoryFeedsGroup: Field = {
  name: 'feeds',
  type: 'group',
  label: 'Produktové feedy (Google, Meta, Heureka, Zboží)',
  admin: {
    description:
      'Nepovinné. Prázdné = převezme se z nadřazené kategorie, jinak výchozí hodnota v ' +
      'Nastavení → Marketing.',
  },
  fields: [
    {
      name: 'exclude',
      type: 'checkbox',
      label: 'Nevkládat produkty této kategorie do feedů',
      admin: {
        description:
          'Např. služby (broušení nožů) nebo zboží, které nechcete inzerovat. Platí i pro podkategorie.',
      },
    },
    {
      name: 'googleProductCategory',
      type: 'text',
      label: 'Kategorie Google (číslo z Google taxonomie)',
      admin: {
        description:
          'Např. 4628 = Maso, 427 = Dochucovadla a omáčky. Seznam: ' +
          'https://www.google.com/basepages/producttype/taxonomy-with-ids.cs-CZ.txt',
      },
      validate: (value: unknown) =>
        !value || /^\d{1,6}$/.test(String(value).trim()) ? true : 'Zadejte jen číslo kategorie.',
    },
    {
      name: 'heurekaCategory',
      type: 'text',
      label: 'Kategorie Heureka (celá cesta)',
      admin: {
        description:
          'Např. „Heureka.cz | Jídlo a nápoje | Čerstvé potraviny | Maso, drůbež, ryby“. Strom: ' +
          'https://www.heureka.cz/direct/xml-export/shops/heureka-sekce.xml',
      },
    },
    {
      name: 'zboziCategory',
      type: 'text',
      label: 'Kategorie Zboží.cz (celá cesta)',
      admin: {
        description:
          'Např. „Potraviny a nápoje | Potraviny | Maso a ryby“. Strom: ' +
          'https://www.zbozi.cz/static/categories.csv',
      },
    },
  ],
}

export const productFeedsGroup: Field = {
  name: 'feeds',
  type: 'group',
  label: 'Feedy a reklama',
  admin: { position: 'sidebar' },
  fields: [
    {
      name: 'exclude',
      type: 'checkbox',
      label: 'Nevkládat do produktových feedů',
      admin: {
        description: 'Produkt zůstane v obchodě, jen se nepošle do Google, Meta, Heureky a Zboží.',
      },
    },
  ],
}
