import type { Availability, PriceUnit, VariantKind } from '../catalog'
import { defaultVariantIndex, variantOptions } from '../productView'

import { buildGa4Item, type Ga4Item } from './items'

/**
 * A storefront product as a GA4 item for lists and the detail page: the variant shown by default
 * (the first purchasable one), so `item_id` equals the feed id of that variant. Pure.
 */

export type ProductForItem = {
  id: number
  title: string
  brand?: string | null
  price: number
  priceUnit: PriceUnit
  availability: Availability
  variants?:
    | {
        id?: string | null
        label: string
        kind: VariantKind
        weightGrams?: number | null
        availability?: Availability | null
        sortOrder?: number | null
      }[]
    | null
}

export function productItem(
  product: ProductForItem,
  categories: string[],
  options: { index?: number; list?: { id: string; name: string } } = {},
): Ga4Item {
  const variants = variantOptions(product)
  const chosen = variants[defaultVariantIndex(variants)]
  return buildGa4Item(
    {
      productId: product.id,
      variantId: chosen?.id ?? null,
      title: product.title,
      variantLabel: chosen?.label ?? null,
      categories,
      brand: product.brand,
      // Weight-priced product without variants cannot be bought: no price rather than a per-kg one.
      price: chosen
        ? chosen.estimate
        : product.priceUnit === 'piece'
          ? Math.round(product.price)
          : null,
      quantity: 1,
      weightGrams: chosen?.weightGrams ?? null,
      priceUnit: product.priceUnit,
      unitPrice: product.price,
      index: options.index,
    },
    options.list,
  )
}
