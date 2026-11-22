import type { CartLineAnalytics } from '@/lib/cart/store'
import { type CategoryNode, categoryPath, productBrand } from '@/lib/measurement/items'
import { type ProductForItem, productItem } from '@/lib/measurement/productItems'
import type { Ga4Item } from '@/lib/measurement/items'

import { getAllCategories } from './data'

/**
 * Server helpers that turn storefront products into dataLayer items (stage 6): category path
 * from the (cached) category tree, brand, default variant.
 */

/** The cached category tree as plain nodes. */
export async function categoryNodes(): Promise<CategoryNode[]> {
  const all = await getAllCategories()
  return all.map((c) => ({
    id: c.id,
    title: c.title,
    parent: typeof c.parent === 'number' ? c.parent : (c.parent?.id ?? null),
  }))
}

type WithCategories = { categories?: (number | { id: number } | null)[] | null }

export async function productAnalytics(
  product: WithCategories & { brand?: string | null },
): Promise<CartLineAnalytics> {
  const all = await categoryNodes()
  return {
    categories: categoryPath(product.categories, all),
    brand: productBrand(product.brand),
  }
}

/** GA4 items of a product list (`view_item_list`), positions from 1 in the shown order. */
export async function listItems(
  products: (ProductForItem & WithCategories)[],
  list: { id: string; name: string },
  startIndex = 1,
): Promise<Ga4Item[]> {
  const all = await categoryNodes()
  return products.map((product, i) =>
    productItem(product, categoryPath(product.categories, all), {
      index: startIndex + i,
      list,
    }),
  )
}
