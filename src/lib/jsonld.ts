import type { Availability, PriceUnit } from './catalog'
import { isWeightPriced, type VariantOption } from './productView'

/**
 * schema.org structured data (JSON-LD) builders. Pure, unit-tested in `jsonld.test.ts`.
 *
 * Product pricing (business rule 4) is represented honestly:
 * - each purchasable variant is an `Offer` whose `price` is the ESTIMATED price of that variant
 *   (the same number the page shows), with the variant label as `name`,
 * - the real unit price is attached as `UnitPriceSpecification` (`referenceQuantity` 1 KGM / 100
 *   GRM / 1 piece), so machines know the price is per kilogram,
 * - the description of each offer says the final price follows the weighed amount.
 * Delivery: flat price from settings (never free, business rule 2).
 */

export type JsonLd = Record<string, unknown>

const UNIT_CODES: Record<PriceUnit, { value: number; unitCode: string }> = {
  kg: { value: 1, unitCode: 'KGM' },
  '100g': { value: 100, unitCode: 'GRM' },
  piece: { value: 1, unitCode: 'H87' },
}

const AVAILABILITY_SCHEMA: Record<Availability, string> = {
  'in-stock': 'https://schema.org/InStock',
  'in-transit': 'https://schema.org/BackOrder',
  'sold-out': 'https://schema.org/OutOfStock',
  hidden: 'https://schema.org/Discontinued',
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

export type ProductJsonLdInput = {
  name: string
  url: string
  description?: string
  images: string[]
  sku?: string | null
  brand?: string | null
  category?: string | null
  price: number
  priceUnit: PriceUnit
  availability: Availability
  options: VariantOption[]
  deliveryPrice: number
  /** Estimate notice from settings (`priceNotice`). */
  priceNotice: string
}

export function productJsonLd(input: ProductJsonLdInput): JsonLd {
  const unitPriceSpecification = {
    '@type': 'UnitPriceSpecification',
    price: input.price,
    priceCurrency: 'CZK',
    valueAddedTaxIncluded: true,
    referenceQuantity: { '@type': 'QuantitativeValue', ...UNIT_CODES[input.priceUnit] },
  }
  const shippingDetails = {
    '@type': 'OfferShippingDetails',
    shippingRate: { '@type': 'MonetaryAmount', value: input.deliveryPrice, currency: 'CZK' },
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'CZ' },
  }
  const base = {
    '@type': 'Offer',
    url: input.url,
    priceCurrency: 'CZK',
    shippingDetails,
    seller: { '@type': 'Organization', name: 'Terrys' },
  }

  const weightPriced = isWeightPriced(input.priceUnit)
  const offers =
    input.options.length > 0
      ? input.options
          .filter((option) => option.estimate !== null)
          .map((option) => ({
            ...base,
            name: option.label,
            price: option.estimate,
            availability: AVAILABILITY_SCHEMA[option.availability],
            priceSpecification: weightPriced ? unitPriceSpecification : undefined,
            description: weightPriced ? input.priceNotice : undefined,
          }))
      : [
          {
            ...base,
            price: input.price,
            availability: AVAILABILITY_SCHEMA[input.availability],
            priceSpecification: weightPriced ? unitPriceSpecification : undefined,
            description: weightPriced ? input.priceNotice : undefined,
          },
        ]

  return stripUndefined({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    url: input.url,
    description: input.description,
    image: input.images.length ? input.images : undefined,
    sku: input.sku || undefined,
    brand: input.brand ? { '@type': 'Brand', name: input.brand } : undefined,
    category: input.category || undefined,
    offers: offers.length ? offers : undefined,
  })
}

export type ArticleJsonLdInput = {
  headline: string
  url: string
  description?: string
  image?: string | null
  datePublished?: string | null
  dateModified?: string | null
  authorName?: string | null
  siteName: string
  logoUrl: string
}

export function articleJsonLd(input: ArticleJsonLdInput): JsonLd {
  return stripUndefined({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.headline.slice(0, 110),
    url: input.url,
    mainEntityOfPage: input.url,
    description: input.description,
    image: input.image ? [input.image] : undefined,
    datePublished: input.datePublished || undefined,
    dateModified: input.dateModified || undefined,
    author: {
      '@type': input.authorName ? 'Person' : 'Organization',
      name: input.authorName || input.siteName,
    },
    publisher: {
      '@type': 'Organization',
      name: input.siteName,
      logo: { '@type': 'ImageObject', url: input.logoUrl },
    },
    inLanguage: 'cs',
  })
}

export type RecipeJsonLdInput = {
  name: string
  url: string
  description?: string
  image?: string | null
  datePublished?: string | null
  prepTimeMinutes?: number | null
  cookTimeMinutes?: number | null
  servings?: number | null
  ingredients: string[]
  steps: string[]
  siteName: string
}

/** ISO 8601 duration ("PT1H30M") from minutes. */
export function isoDuration(minutes: number | null | undefined): string | undefined {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return undefined
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}`
}

export function recipeJsonLd(input: RecipeJsonLdInput): JsonLd {
  const total =
    (input.prepTimeMinutes ?? 0) + (input.cookTimeMinutes ?? 0) > 0
      ? (input.prepTimeMinutes ?? 0) + (input.cookTimeMinutes ?? 0)
      : null
  return stripUndefined({
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: input.name,
    url: input.url,
    description: input.description,
    image: input.image ? [input.image] : undefined,
    datePublished: input.datePublished || undefined,
    author: { '@type': 'Organization', name: input.siteName },
    prepTime: isoDuration(input.prepTimeMinutes),
    cookTime: isoDuration(input.cookTimeMinutes),
    totalTime: isoDuration(total),
    recipeYield: input.servings ? `${input.servings} porce` : undefined,
    recipeIngredient: input.ingredients.length ? input.ingredients : undefined,
    recipeInstructions: input.steps.length
      ? input.steps.map((text) => ({ '@type': 'HowToStep', text }))
      : undefined,
    inLanguage: 'cs',
  })
}

export type LocalBusinessJsonLdInput = {
  name: string
  url: string
  image?: string | null
  telephone?: string | null
  email?: string | null
  street?: string | null
  city?: string | null
  zip?: string | null
  mapUrl?: string | null
  openingHoursSpecification: unknown[]
}

export function localBusinessJsonLd(input: LocalBusinessJsonLdInput): JsonLd {
  return stripUndefined({
    '@context': 'https://schema.org',
    '@type': 'ButcherShop',
    name: input.name,
    url: input.url,
    image: input.image || undefined,
    telephone: input.telephone || undefined,
    email: input.email || undefined,
    hasMap: input.mapUrl || undefined,
    address:
      input.street || input.city
        ? stripUndefined({
            '@type': 'PostalAddress',
            streetAddress: input.street || undefined,
            addressLocality: input.city || undefined,
            postalCode: input.zip || undefined,
            addressCountry: 'CZ',
          })
        : undefined,
    openingHoursSpecification: input.openingHoursSpecification.length
      ? input.openingHoursSpecification
      : undefined,
  })
}

export type OrganizationJsonLdInput = {
  name: string
  url: string
  logoUrl: string
  email?: string | null
  telephone?: string | null
  sameAs: string[]
  legalName?: string | null
  vatId?: string | null
  taxId?: string | null
}

export function organizationJsonLd(input: OrganizationJsonLdInput): JsonLd {
  return stripUndefined({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${input.url}/#organization`,
    name: input.name,
    legalName: input.legalName || undefined,
    url: input.url,
    logo: input.logoUrl,
    email: input.email || undefined,
    telephone: input.telephone || undefined,
    vatID: input.vatId || undefined,
    taxID: input.taxId || undefined,
    sameAs: input.sameAs.length ? input.sameAs : undefined,
  })
}

/** WebSite with a search action pointing to the old-compatible search URL. */
export function websiteJsonLd(input: { name: string; url: string }): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${input.url}/#website`,
    name: input.name,
    url: input.url,
    inLanguage: 'cs',
    publisher: { '@id': `${input.url}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${input.url}/vyhledavani?ProductsSearch={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

/** Removes undefined properties (JSON.stringify drops them anyway; keeps tests readable). */
function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

/**
 * Serialises JSON-LD for a <script> tag. `<` is escaped so text from the CMS can never close the
 * script element.
 */
export function serializeJsonLd(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
