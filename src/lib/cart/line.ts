import type { PriceUnit } from '../catalog'
import type { VariantOption } from '../productView'

import type { AddToCartInput, CartLineAnalytics } from './store'

/** Product data a cart line is built from (plain, serialisable – passed to client components). */
export type CartProductInfo = {
  id: number
  title: string
  price: number
  priceUnit: PriceUnit
  url: string
  imageUrl: string | null
  /** Stage 6: category path + brand for the dataLayer (`src/lib/measurement/items.ts`). */
  analytics?: CartLineAnalytics
}

/** Cart line for a variant, or null when that variant cannot be bought. */
export function lineForVariant(
  product: CartProductInfo,
  option: VariantOption,
): AddToCartInput | null {
  if (!option.purchasable) return null
  return {
    productId: product.id,
    variantId: option.id,
    title: product.title,
    variantLabel: option.label,
    unitPrice: product.price,
    priceUnit: product.priceUnit,
    weightGrams: option.weightGrams,
    estimatedPrice: option.estimate,
    url: product.url,
    imageUrl: product.imageUrl,
    ...(product.analytics ? { analytics: product.analytics } : {}),
  }
}

/** Cart line for a fixed-price product without variants (e.g. a sauce). */
export function lineForSingle(product: CartProductInfo): AddToCartInput {
  return {
    productId: product.id,
    variantId: null,
    title: product.title,
    variantLabel: null,
    unitPrice: product.price,
    priceUnit: product.priceUnit,
    weightGrams: null,
    estimatedPrice: Math.round(product.price),
    url: product.url,
    imageUrl: product.imageUrl,
    ...(product.analytics ? { analytics: product.analytics } : {}),
  }
}
