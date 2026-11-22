import type { Availability, PriceUnit, VariantKind } from '../catalog'
import { variantUrl } from '../jsonld'
import { itemGroupId, itemId } from '../measurement/ids'
import { productBrand } from '../measurement/items'
import { pricePerKg } from '../price'
import { formatWeight, isWeightPriced, variantOptions } from '../productView'
import { absoluteUrl, getPublicPath } from '../urls'

/**
 * Feed items (stage 6): ONE item per thing that can be bought – each variant (concrete weight →
 * concrete estimated price), or the product itself for fixed-price goods without variants. Pure,
 * unit-tested in `feeds.test.ts`; the Payload loader is `src/feeds/generate.ts`.
 *
 * Rules:
 * - only published, non-hidden products reach this function (loaded with the public rules),
 * - left out (and reported): product or category "exclude from feeds", weight-priced products
 *   without variants (cannot be bought online), variants without a computable price, products
 *   without a photo,
 * - sold-out variants are kept with availability `sold-out` (Google/Meta show them as out of
 *   stock; the Heureka and Zboží renderers drop them – those specs want only sellable items),
 * - price = the estimate the product page shows for that variant (`?varianta=` preselects it),
 *   never a sale price; the per-kg price goes into unit pricing fields.
 */

export type FeedVariantInput = {
  id?: string | null
  label: string
  kind: VariantKind
  weightGrams?: number | null
  availability?: Availability | null
  sortOrder?: number | null
}

export type FeedProductInput = {
  id: number
  title: string
  slug?: string | null
  legacyUrl?: string | null
  price: number
  priceUnit: PriceUnit
  availability: Availability
  variants?: FeedVariantInput[] | null
  brand?: string | null
  /** Plain text (short description + description). */
  description: string
  /** Absolute or root-relative image URLs, main image first. */
  images: string[]
  /** Category path titles, root first (Google `product_type`). */
  categoryPath: string[]
  categories: { google: string | null; heureka: string | null; zbozi: string | null }
  excluded: boolean
  categoryExcluded: boolean
  /**
   * Stage 7: gift voucher product. `included` = Marketing → Dárkové poukazy → feeds switch
   * (default off). Only the PRINTED format goes to feeds: it ships like goods, so the feeds'
   * shipping (229 Kč / pickup) is true for it; an electronic voucher has no shipping at all,
   * which the per-shop shipping of the feeds cannot express. The landing page offers both.
   */
  voucher?: { included: boolean; formats: string[] } | null
}

export type FeedItem = {
  id: string
  /** Set only for products with variants. */
  groupId: string | null
  productId: number
  title: string
  productTitle: string
  variantLabel: string | null
  description: string
  link: string
  imageLink: string
  additionalImages: string[]
  /** Estimated price incl. VAT, whole CZK. */
  price: number
  availability: Exclude<Availability, 'hidden'>
  brand: string
  /** True when the brand comes from the product (not the default "Terrys"). */
  hasOwnBrand: boolean
  productType: string
  categories: FeedProductInput['categories']
  weightGrams: number | null
  priceUnit: PriceUnit
  unitPrice: number
  pricePerKg: number | null
}

export type ExcludedProduct = { productId: number; title: string; reason: string }

export function feedTitle(productTitle: string, variantLabel: string | null): string {
  if (!variantLabel) return productTitle
  return productTitle.toLowerCase().includes(variantLabel.toLowerCase())
    ? productTitle
    : `${productTitle} – ${variantLabel}`
}

export function buildFeedItems(
  products: FeedProductInput[],
  siteUrl: string,
): { items: FeedItem[]; excluded: ExcludedProduct[] } {
  const items: FeedItem[] = []
  const excluded: ExcludedProduct[] = []
  for (const product of products) {
    const skip = (reason: string) =>
      excluded.push({ productId: product.id, title: product.title, reason })
    if (product.availability === 'hidden') {
      skip('skrytý produkt')
      continue
    }
    if (product.excluded) {
      skip('vyřazen z feedů u produktu')
      continue
    }
    if (product.categoryExcluded) {
      skip('vyřazen z feedů v kategorii')
      continue
    }
    const images = product.images.map((url) => absoluteUrl(url, siteUrl))
    if (images.length === 0) {
      skip('bez fotky')
      continue
    }
    const productUrl = absoluteUrl(getPublicPath('products', product), siteUrl)
    const brand = productBrand(product.brand)
    const base = {
      productId: product.id,
      productTitle: product.title,
      description: product.description || product.title,
      imageLink: images[0],
      additionalImages: images.slice(1, 11),
      brand,
      hasOwnBrand: brand !== productBrand(null),
      productType: product.categoryPath.join(' > '),
      categories: product.categories,
      priceUnit: product.priceUnit,
      unitPrice: product.price,
      pricePerKg: pricePerKg({ unitPrice: product.price, priceUnit: product.priceUnit }),
    }
    if (product.voucher) {
      if (!product.voucher.included) {
        skip('dárkový poukaz – do feedů se nezařazuje (Nastavení → Marketing)')
        continue
      }
      if (!product.voucher.formats.includes('printed')) {
        skip('poukaz jen elektronický – ve feedech je jen tištěný')
        continue
      }
      items.push({
        ...base,
        pricePerKg: null,
        id: itemId(product.id, 'printed'),
        groupId: null,
        title: feedTitle(product.title, 'tištěný'),
        variantLabel: 'Tištěný',
        link: variantUrl(productUrl, 'printed'),
        price: Math.round(product.price),
        availability: product.availability,
        weightGrams: null,
      })
      continue
    }
    const options = variantOptions(product)
    if (options.length === 0) {
      if (isWeightPriced(product.priceUnit)) {
        skip('cena za kg bez variant – nelze objednat online')
        continue
      }
      items.push({
        ...base,
        id: itemId(product.id),
        groupId: null,
        title: product.title,
        variantLabel: null,
        link: productUrl,
        price: Math.round(product.price),
        availability: product.availability,
        weightGrams: null,
      })
      continue
    }
    let added = 0
    for (const option of options) {
      if (option.estimate === null || !option.id || option.estimate <= 0) continue
      const availability = option.availability === 'hidden' ? null : option.availability
      if (!availability) continue
      items.push({
        ...base,
        id: itemId(product.id, option.id),
        groupId: itemGroupId(product.id),
        title: feedTitle(product.title, option.label),
        variantLabel: option.label,
        link: variantUrl(productUrl, option.id),
        price: option.estimate,
        availability,
        weightGrams: isWeightPriced(product.priceUnit) ? option.weightGrams : null,
      })
      added++
    }
    if (added === 0) skip('žádná varianta s cenou')
  }
  return { items, excluded }
}

/** "Cena je odhad za 500 g (990 Kč/kg)…" – for channels whose description may carry it. */
export function estimateNotice(item: FeedItem): string {
  if (!item.weightGrams || item.pricePerKg === null) return ''
  return (
    `Cena je odhad za ${formatWeight(item.weightGrams)} (${item.pricePerKg.toLocaleString('cs-CZ')} Kč/kg). ` +
    'Řezník každou objednávku váží, výsledná cena se řídí skutečnou hmotností (obvykle ±15 %).'
  )
}
