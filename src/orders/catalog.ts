import type { Payload } from 'payload'

import type { Availability, PriceUnit, VariantKind } from '@/lib/catalog'
import {
  type CartCheckResult,
  type CatalogProduct,
  checkCartLines,
  type RequestedLine,
} from '@/lib/orders/cartCheck'
import { getPublicPath } from '@/lib/urls'
import type { Media, Product } from '@/payload-types'

/**
 * Loads the products of a cart with the PUBLIC access rules (published, not hidden – exactly
 * what a visitor may buy) and re-validates the lines (`checkCartLines`). Used by the cart
 * validation endpoint and by the order placement. Never cached: prices must be current.
 */

function thumbnailUrl(media: unknown): string | null {
  if (!media || typeof media !== 'object') return null
  const m = media as Media
  const url = m.sizes?.thumbnail?.url ?? m.url
  if (!url) return null
  // Payload returns absolute URLs; our own files are served from the same origin.
  const match = url.match(/^https?:\/\/[^/]+(\/api\/media\/file\/.*)$/i)
  return match ? match[1] : url
}

export function toCatalogProduct(doc: Product): CatalogProduct {
  return {
    id: doc.id,
    title: doc.title,
    price: doc.price,
    priceUnit: doc.priceUnit as PriceUnit,
    vatRate: doc.vatRate ?? '12',
    availability: doc.availability as Availability,
    sku: doc.sku ?? null,
    url: getPublicPath('products', doc),
    imageUrl: thumbnailUrl(doc.mainImage),
    variants: (doc.variants ?? []).map((variant) => ({
      id: variant.id ?? null,
      label: variant.label,
      kind: variant.kind as VariantKind,
      weightGrams: variant.weightGrams ?? null,
      availability: (variant.availability as Availability | null | undefined) ?? null,
      sortOrder: variant.sortOrder ?? null,
    })),
  }
}

export async function loadCatalogProducts(
  payload: Payload,
  ids: number[],
): Promise<Map<number, CatalogProduct>> {
  const unique = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0)
  if (unique.length === 0) return new Map()
  const result = await payload.find({
    collection: 'products',
    where: { id: { in: unique } },
    depth: 1,
    limit: unique.length,
    pagination: false,
    draft: false,
    // Public rules: drafts and hidden products are treated as "no longer offered".
    overrideAccess: false,
    select: {
      title: true,
      slug: true,
      legacyUrl: true,
      price: true,
      priceUnit: true,
      vatRate: true,
      availability: true,
      variants: true,
      mainImage: true,
      sku: true,
    },
    populate: { media: { url: true, sizes: true } },
  })
  return new Map(result.docs.map((doc) => [doc.id, toCatalogProduct(doc as Product)]))
}

export async function checkCart(
  payload: Payload,
  lines: RequestedLine[],
): Promise<CartCheckResult> {
  const products = await loadCatalogProducts(
    payload,
    lines.map((line) => line.productId),
  )
  return checkCartLines(lines, products)
}
