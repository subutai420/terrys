import type { CollectionConfig, NumberFieldSingleValidation } from 'payload'

import { editors, publicProductsOrLoggedIn } from '@/access'
import { legacyUrlField, migrationGroup, seoGroup } from '@/fields/common'
import { productFeedsGroup } from '@/fields/feeds'
import { previewUrl } from '@/fields/preview'
import { slugField } from '@/fields/slug'
import {
  AVAILABILITY,
  AVAILABILITY_LABELS,
  DEFAULT_VAT_RATE,
  PRICE_UNIT_LABELS,
  PRICE_UNITS,
  VAT_RATES,
} from '@/lib/catalog'

import { VOUCHER_FORMAT_LABELS, VOUCHER_FORMATS } from '@/lib/vouchers/constants'
import { storefrontRevalidationHooks } from '@/storefront/revalidate'

import { ADMIN_GROUPS } from './adminGroups'

const availabilityOptions = AVAILABILITY.map((value) => ({
  value,
  label: AVAILABILITY_LABELS[value],
}))

/**
 * Variant weight is required unless the product has a fixed price per piece (sauces etc.).
 * `data` is the whole product, so we can look at its price unit.
 */
const validateVariantWeight: NumberFieldSingleValidation = (value, { data }) => {
  const priceUnit = (data as { priceUnit?: string } | undefined)?.priceUnit
  if (priceUnit === 'piece') return true
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 'Zadejte hmotnost v gramech (kladné číslo). Bez ní nelze spočítat odhad ceny.'
  }
  return true
}

/**
 * Products (meat, wagyu, sauces, ...).
 *
 * Pricing model (business rules in CLAUDE.md):
 * - `price` is the price incl. VAT per `priceUnit` (1 kg, 100 g, or a fixed price per piece).
 * - Every order is weighed by the butcher; the final price follows the real weight (about ±15 %).
 *   Variant prices are therefore ESTIMATES: price × weight, see `estimateVariantPrice` in
 *   `src/lib/price.ts`.
 * - VAT rate is per product (default 12 % for food).
 * - There are intentionally NO discount, sale-price, "original price" or coupon fields.
 * - No stock quantity in kg; availability is a simple status.
 *
 * Drafts are enabled: a product is visible on the storefront only after "Publish".
 */
export const Products: CollectionConfig = {
  slug: 'products',
  labels: {
    singular: 'Produkt',
    plural: 'Produkty',
  },
  admin: {
    group: ADMIN_GROUPS.catalog,
    useAsTitle: 'title',
    preview: previewUrl('products'),
    defaultColumns: ['title', 'price', 'priceUnit', 'availability', 'origin', '_status'],
    listSearchableFields: ['title', 'slug', 'sku'],
    description:
      'Nabídka e-shopu. Nový produkt se v obchodě ukáže až po kliknutí na „Publikovat“. ' +
      'Slevy ani akční ceny se nezadávají – Terrys slevy nedělá.',
  },
  defaultSort: 'title',
  versions: {
    drafts: true,
    maxPerDoc: 30,
  },
  // Stage 3: clear the storefront cache after every change (src/storefront/revalidate.ts).
  hooks: {
    ...storefrontRevalidationHooks,
    // Stage 7: a voucher always costs exactly its value, per piece, without weight variants
    // (business rule 1: no discounted vouchers). Set here so nobody has to remember it.
    beforeValidate: [
      ({ data }) => {
        const voucher = data?.voucher as { enabled?: boolean; value?: number } | undefined
        if (data && voucher?.enabled && typeof voucher.value === 'number') {
          data.price = voucher.value
          data.priceUnit = 'piece'
          data.variants = []
        }
        return data
      },
    ],
  },
  access: {
    read: publicProductsOrLoggedIn,
    create: editors,
    update: editors,
    delete: editors,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Název produktu',
      required: true,
    },
    {
      type: 'tabs',
      tabs: [
        // ------------------------------------------------------------------ Description
        {
          label: 'Popis a fotky',
          fields: [
            {
              name: 'shortDescription',
              type: 'richText',
              label: 'Krátký popis',
              admin: { description: 'Pár vět do karty produktu a pod název v detailu.' },
            },
            {
              name: 'description',
              type: 'richText',
              label: 'Podrobný popis',
              admin: {
                description: 'Celý popis produktu v detailu: původ, chuť, tipy k přípravě.',
              },
            },
            {
              name: 'mainImage',
              type: 'upload',
              relationTo: 'media',
              label: 'Hlavní fotka',
              required: true,
              admin: { description: 'Zobrazuje se v kartě produktu a jako první v galerii.' },
            },
            {
              name: 'gallery',
              type: 'upload',
              relationTo: 'media',
              hasMany: true,
              label: 'Další fotky (galerie)',
              admin: { description: 'Nepovinné. Pořadí lze měnit přetažením.' },
            },
          ],
        },
        // ------------------------------------------------------------------ Price & variants
        {
          label: 'Cena a varianty',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'price',
                  type: 'number',
                  label: 'Cena v Kč (vč. DPH)',
                  required: true,
                  min: 0,
                  admin: {
                    width: '34%',
                    description:
                      'Cena za zvolenou jednotku. Každou objednávku řezník váží a výsledná cena se ' +
                      'počítá podle skutečné hmotnosti (obvykle ±15 % od odhadu). Zákazník proto ' +
                      'u variant vidí jen ODHAD ceny.',
                  },
                },
                {
                  name: 'priceUnit',
                  type: 'select',
                  label: 'Jednotka ceny',
                  required: true,
                  defaultValue: 'kg',
                  options: PRICE_UNITS.map((value) => ({ value, label: PRICE_UNIT_LABELS[value] })),
                  admin: {
                    width: '33%',
                    description:
                      'Maso za 1 kg (nebo za 100 g). „Za kus“ jen u zboží s pevnou cenou, např. omáčky.',
                  },
                },
                {
                  name: 'vatRate',
                  type: 'select',
                  label: 'Sazba DPH',
                  required: true,
                  defaultValue: DEFAULT_VAT_RATE,
                  options: VAT_RATES.map((value) => ({ value, label: `${value} %` })),
                  admin: {
                    width: '33%',
                    description: 'Potraviny 12 %. Jinou sazbu jen po dohodě s účetní.',
                  },
                },
              ],
            },
            {
              name: 'variants',
              type: 'array',
              label: 'Varianty (velikosti porcí)',
              labels: { singular: 'Varianta', plural: 'Varianty' },
              admin: {
                description:
                  'Z čeho zákazník vybírá, např. 250 g, 500 g, 1 kg nebo celý kus. Odhad ceny ' +
                  'varianty = cena × hmotnost (zaokrouhleno na celé Kč). U zboží „za kus“ se ' +
                  'varianty nezadávají. Pořadí lze měnit přetažením.',
                initCollapsed: false,
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'label',
                      type: 'text',
                      label: 'Označení',
                      required: true,
                      admin: {
                        width: '30%',
                        description: 'Co uvidí zákazník, např. „500 g“, „Celý kus“, „Půlka“.',
                      },
                    },
                    {
                      name: 'kind',
                      type: 'select',
                      label: 'Typ',
                      required: true,
                      defaultValue: 'weight',
                      options: [
                        { value: 'weight', label: 'Porce o dané hmotnosti' },
                        { value: 'piece', label: 'Kus (celý / půlka)' },
                      ],
                      admin: { width: '30%' },
                    },
                    {
                      name: 'weightGrams',
                      type: 'number',
                      label: 'Hmotnost v gramech',
                      min: 1,
                      validate: validateVariantWeight,
                      admin: {
                        width: '40%',
                        description:
                          'Porce: cílová hmotnost (např. 500). Kus: průměrná hmotnost kusu (např. 2500).',
                      },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'availability',
                      type: 'select',
                      label: 'Dostupnost varianty',
                      options: availabilityOptions,
                      admin: {
                        width: '50%',
                        description: 'Nepovinné. Prázdné = stejná jako u produktu.',
                      },
                    },
                    {
                      name: 'sortOrder',
                      type: 'number',
                      label: 'Pořadí',
                      admin: {
                        width: '50%',
                        description: 'Nepovinné. Prázdné = pořadí v seznamu.',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        // ------------------------------------------------------------------ Properties
        {
          label: 'Vlastnosti',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'meatType',
                  type: 'relationship',
                  relationTo: 'meat-types',
                  label: 'Druh masa',
                  admin: { width: '33%' },
                },
                {
                  name: 'cut',
                  type: 'relationship',
                  relationTo: 'cuts',
                  label: 'Řez',
                  admin: { width: '33%' },
                },
                {
                  name: 'origin',
                  type: 'relationship',
                  relationTo: 'origins',
                  label: 'Země původu',
                  admin: { width: '34%' },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'usages',
                  type: 'relationship',
                  relationTo: 'usages',
                  hasMany: true,
                  label: 'Hodí se na',
                  admin: { width: '50%' },
                },
                {
                  name: 'shelfLife',
                  type: 'relationship',
                  relationTo: 'shelf-lives',
                  label: 'Trvanlivost a skladování',
                  admin: { width: '50%' },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'marbling',
                  type: 'text',
                  label: 'Mramorování',
                  admin: {
                    width: '33%',
                    description: 'Nepovinné. Např. „BMS 6“, „BMS 8/9“ nebo japonské „A5“.',
                  },
                },
                {
                  name: 'feeding',
                  type: 'select',
                  label: 'Krmení',
                  options: [
                    { value: 'grain', label: 'Dokrmováno obilím (grain fed)' },
                    { value: 'grass', label: 'Na trávě (grass fed)' },
                  ],
                  admin: { width: '33%', description: 'Nepovinné.' },
                },
                {
                  name: 'brand',
                  type: 'text',
                  label: 'Značka / producent',
                  admin: { width: '34%', description: 'Nepovinné. Např. jméno farmy nebo značky.' },
                },
              ],
            },
          ],
        },
        // ------------------------------------------------------------------ Related
        {
          label: 'Související',
          fields: [
            {
              name: 'relatedProducts',
              type: 'relationship',
              relationTo: 'products',
              hasMany: true,
              label: 'Související produkty',
              admin: { description: 'Doporučené produkty v detailu („Mohlo by vás zajímat“).' },
              filterOptions: ({ id }) => (id ? { id: { not_equals: id } } : true),
            },
            {
              name: 'relatedRecipes',
              type: 'relationship',
              relationTo: 'recipes',
              hasMany: true,
              label: 'Recepty s tímto produktem',
            },
          ],
        },
        // ------------------------------------------------------------------ SEO
        {
          label: 'SEO',
          fields: [seoGroup],
        },
      ],
    },
    // ---------------------------------------------------------------------- Sidebar
    slugField(),
    {
      name: 'availability',
      type: 'select',
      label: 'Dostupnost',
      required: true,
      defaultValue: 'in-stock',
      index: true,
      options: availabilityOptions,
      admin: {
        position: 'sidebar',
        description: '„Skryto“ = produkt zůstane v adminu, ale v obchodě se neukáže.',
      },
    },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
      label: 'Kategorie',
      admin: {
        position: 'sidebar',
        description: 'Produkt může být ve více kategoriích.',
      },
    },
    {
      name: 'sku',
      type: 'text',
      label: 'Kód zboží',
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Nepovinné. Interní kód (např. z pokladny nebo od dodavatele).',
      },
    },
    // Stage 7: a product becomes a gift voucher here (src/vouchers, CLAUDE.md "Vouchers").
    {
      name: 'voucher',
      type: 'group',
      label: 'Dárkový poukaz',
      admin: {
        position: 'sidebar',
        description:
          'Zaškrtněte jen u produktů „Dárkový poukaz“. Cena se pak sama nastaví na hodnotu ' +
          'poukazu (poukazy se nikdy neprodávají se slevou). Sazbu DPH poukazu určí účetní.',
      },
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          label: 'Tento produkt je dárkový poukaz',
          defaultValue: false,
          index: true,
        },
        {
          name: 'value',
          type: 'number',
          label: 'Hodnota poukazu (Kč)',
          min: 100,
          max: 100000,
          admin: {
            step: 100,
            condition: (_data, sibling) => Boolean(sibling?.enabled),
            description: 'Např. 500, 1 000, 2 000, 5 000.',
          },
          validate: (value: unknown, { siblingData }: { siblingData: unknown }) => {
            const enabled = (siblingData as { enabled?: boolean } | undefined)?.enabled
            if (!enabled) return true
            return typeof value === 'number' && Number.isInteger(value) && value > 0
              ? true
              : 'Zadejte hodnotu poukazu v celých Kč.'
          },
        },
        {
          name: 'formats',
          type: 'select',
          hasMany: true,
          label: 'Jak ho lze koupit',
          defaultValue: [...VOUCHER_FORMATS],
          options: VOUCHER_FORMATS.map((value) => ({ value, label: VOUCHER_FORMAT_LABELS[value] })),
          admin: {
            condition: (_data, sibling) => Boolean(sibling?.enabled),
            description:
              'Elektronický: PDF e-mailem hned po objednávce, platba převodem do 72 h. Tištěný: ' +
              'přibalíme k zásilce nebo k vyzvednutí, platí se při převzetí.',
          },
          validate: (value: unknown, { siblingData }: { siblingData: unknown }) => {
            const enabled = (siblingData as { enabled?: boolean } | undefined)?.enabled
            if (!enabled) return true
            return Array.isArray(value) && value.length > 0
              ? true
              : 'Vyberte aspoň jeden způsob (elektronický / tištěný).'
          },
        },
      ],
    },
    // Stage 6: per-product switch for the product feeds (src/feeds).
    productFeedsGroup,
    legacyUrlField,
    migrationGroup,
  ],
}
