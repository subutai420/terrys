import type { Availability, PriceUnit, VariantKind } from '../catalog'
import { formatUnitPrice } from '../format'
import { formatWeight, isWeightPriced, purchaseMode, variantOptions } from '../productView'

import { MAX_LINE_QUANTITY } from './constants'
import { lineEstimate } from './money'

/**
 * Re-validation of cart lines against the CURRENT catalog (pure; the Payload glue in
 * `src/orders/catalog.ts` loads the products). Used by the cart page on load and by the order
 * placement – one rule set, so the cart never shows something the server would refuse.
 */

export type CatalogProduct = {
  id: number
  title: string
  price: number
  priceUnit: PriceUnit
  vatRate: string
  availability: Availability
  sku: string | null
  url: string
  imageUrl: string | null
  variants: {
    id: string | null
    label: string
    kind: VariantKind
    weightGrams: number | null
    availability: Availability | null
    sortOrder: number | null
  }[]
}

/** What the browser remembers about a line (display snapshot from the moment of adding). */
export type LineSnapshot = {
  title?: string
  variantLabel?: string | null
  unitPrice?: number
  weightGrams?: number | null
}

export type RequestedLine = {
  productId: number
  variantId: string | null
  quantity: number
  snapshot?: LineSnapshot
}

export type ResolvedLine = {
  productId: number
  variantId: string | null
  quantity: number
  title: string
  variantLabel: string | null
  sku: string | null
  unitPrice: number
  priceUnit: PriceUnit
  vatRate: string
  /** Estimated weight of one piece (null for fixed-price items). */
  weightGrams: number | null
  /** Estimate of ONE piece, whole CZK (what the cart store keeps). */
  estimatedPrice: number
  /** Estimate of the whole line (quantity included, rounded once), whole CZK. */
  lineEstimate: number
  url: string
  imageUrl: string | null
}

export type LineProblemCode = 'gone' | 'sold-out' | 'variant-gone' | 'not-purchasable'
export type LineProblem = {
  productId: number
  variantId: string | null
  title: string
  code: LineProblemCode
  message: string
}

export type LineChange = {
  productId: number
  variantId: string | null
  message: string
}

export type CartCheckResult = {
  lines: ResolvedLine[]
  /** Lines that cannot be ordered any more (removed from the cart). */
  problems: LineProblem[]
  /** Lines that changed since they were added (kept, with the new values). */
  changes: LineChange[]
}

const lineName = (title: string, label: string | null) => (label ? `${title} (${label})` : title)

/** Merges duplicate lines (same product + variant) and clamps quantities. */
export function mergeLines<T extends RequestedLine>(lines: T[]): T[] {
  const map = new Map<string, T>()
  for (const line of lines) {
    const key = `${line.productId}:${line.variantId ?? ''}`
    const existing = map.get(key)
    if (existing) {
      existing.quantity = Math.min(MAX_LINE_QUANTITY, existing.quantity + line.quantity)
    } else {
      map.set(key, { ...line, quantity: Math.min(MAX_LINE_QUANTITY, line.quantity) })
    }
  }
  return [...map.values()]
}

export function checkCartLines(
  requested: RequestedLine[],
  products: Map<number, CatalogProduct>,
): CartCheckResult {
  const result: CartCheckResult = { lines: [], problems: [], changes: [] }

  for (const line of mergeLines(requested)) {
    const product = products.get(line.productId)
    const snapshotTitle = line.snapshot?.title ?? 'Produkt'
    const problem = (code: LineProblemCode, message: string, title = snapshotTitle) =>
      result.problems.push({
        productId: line.productId,
        variantId: line.variantId,
        title,
        code,
        message,
      })

    if (!product) {
      problem(
        'gone',
        `${lineName(snapshotTitle, line.snapshot?.variantLabel ?? null)} už v nabídce není, z košíku jsme ho odebrali.`,
      )
      continue
    }

    const mode = purchaseMode(product)
    let variantLabel: string | null = null
    let weightGrams: number | null = null

    if (line.variantId === null) {
      if (product.variants.length > 0 || mode !== 'single') {
        problem(
          product.availability === 'sold-out' ? 'sold-out' : 'variant-gone',
          product.availability === 'sold-out'
            ? `${product.title} je vyprodaný, z košíku jsme ho odebrali.`
            : `U produktu ${product.title} se změnila nabídka velikostí. Vyberte prosím velikost znovu na stránce produktu.`,
          product.title,
        )
        continue
      }
    } else {
      const option = variantOptions(product).find((item) => item.id === line.variantId)
      if (!option) {
        problem(
          'variant-gone',
          `Velikost „${line.snapshot?.variantLabel ?? '?'}“ u produktu ${product.title} už nenabízíme. Vyberte prosím jinou na stránce produktu.`,
          product.title,
        )
        continue
      }
      if (!option.purchasable) {
        const soldOut = option.availability === 'sold-out' || product.availability === 'sold-out'
        problem(
          soldOut ? 'sold-out' : 'not-purchasable',
          soldOut
            ? `${lineName(product.title, option.label)} je vyprodaný, z košíku jsme ho odebrali.`
            : `${lineName(product.title, option.label)} teď nelze objednat, z košíku jsme ho odebrali.`,
          product.title,
        )
        continue
      }
      variantLabel = option.label
      weightGrams = isWeightPriced(product.priceUnit) ? option.weightGrams : null
    }

    const money = {
      unitPrice: product.price,
      priceUnit: product.priceUnit,
      weightGrams,
    }
    const perPiece = lineEstimate({ ...money, quantity: 1 })
    const total = lineEstimate({ ...money, quantity: line.quantity })
    if (perPiece === null || total === null) {
      problem(
        'not-purchasable',
        `${lineName(product.title, variantLabel)} teď nelze objednat, z košíku jsme ho odebrali.`,
        product.title,
      )
      continue
    }

    const snapshot = line.snapshot
    if (snapshot) {
      const name = lineName(product.title, variantLabel)
      if (typeof snapshot.unitPrice === 'number' && snapshot.unitPrice !== product.price) {
        result.changes.push({
          productId: line.productId,
          variantId: line.variantId,
          message: `${name}: cena se od vložení do košíku změnila z ${formatUnitPrice(snapshot.unitPrice)} na ${formatUnitPrice(product.price)} za ${product.priceUnit === 'kg' ? 'kg' : product.priceUnit === '100g' ? '100 g' : 'kus'}.`,
        })
      } else if (
        snapshot.weightGrams !== undefined &&
        weightGrams !== null &&
        snapshot.weightGrams !== weightGrams
      ) {
        result.changes.push({
          productId: line.productId,
          variantId: line.variantId,
          message: `${name}: odhadovaná hmotnost je nově ${formatWeight(weightGrams)}, odhad ceny jsme přepočítali.`,
        })
      } else if (
        snapshot.variantLabel !== undefined &&
        snapshot.variantLabel !== null &&
        variantLabel !== null &&
        snapshot.variantLabel !== variantLabel
      ) {
        result.changes.push({
          productId: line.productId,
          variantId: line.variantId,
          message: `${product.title}: velikost se nově jmenuje „${variantLabel}“ (dříve „${snapshot.variantLabel}“).`,
        })
      }
    }

    result.lines.push({
      productId: product.id,
      variantId: line.variantId,
      quantity: line.quantity,
      title: product.title,
      variantLabel,
      sku: product.sku,
      unitPrice: product.price,
      priceUnit: product.priceUnit,
      vatRate: product.vatRate,
      weightGrams,
      estimatedPrice: perPiece,
      lineEstimate: total,
      url: product.url,
      imageUrl: product.imageUrl,
    })
  }

  return result
}
