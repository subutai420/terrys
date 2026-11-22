/**
 * Country tiles on the homepage ("Steaky ze všech koutů světa"), pure logic (tested in
 * `originTiles.test.ts`).
 *
 * A tile = an origin (code list "Země původu") that has public products. Where it leads:
 * 1. the category set on the origin ("Kategorie země") by an editor,
 * 2. otherwise the category whose products come (almost) only from that country – e.g. the old
 *    category "Argentinské hovězí" for Argentina (≥ 80 % of its products). Only categories
 *    of the "Podle původu" menu column qualify (or, before the menu is configured, top-level
 *    categories), and only "steak" categories – mostly beef or wagyu (`STEAK_MEAT_TYPES`) – so that
 *    e.g. veal from the Netherlands does not become a country tile,
 * 3. otherwise the product listing filtered by the country (`/produkty?puvod=…`).
 * Image: the origin's own image, else the linked category's image, else a product photo.
 */

export type TileProduct = {
  originId: number | null
  meatTypeSlug?: string | null
  categoryIds: number[]
  image: unknown
  inStock: boolean
}

export type TileOrigin = {
  id: number
  name: string
  slug?: string | null
  adjective?: string | null
  image?: unknown
  categoryId?: number | null
}

export type TileCategory = { id: number; image?: unknown }

export type OriginTile = {
  originId: number
  label: string
  categoryId: number | null
  /** Used when no category matches. */
  filterSlug: string | null
  image: unknown
  productCount: number
}

export const AUTO_MATCH_SHARE = 0.8
/** Meat type slugs (code list "Druhy masa") that count as steak meat for country tiles. */
export const STEAK_MEAT_TYPES = ['hovezi', 'wagyu']

export function buildOriginTiles(
  origins: TileOrigin[],
  products: TileProduct[],
  categories: TileCategory[],
  /** Categories that may be matched automatically (origin column, or top-level ones). */
  candidateCategoryIds: number[],
): OriginTile[] {
  const candidates = new Set(candidateCategoryIds)
  const categoryTotals = new Map<number, number>()
  const categorySteak = new Map<number, number>()
  for (const product of products) {
    const steak = STEAK_MEAT_TYPES.includes(product.meatTypeSlug ?? '')
    for (const id of product.categoryIds) {
      categoryTotals.set(id, (categoryTotals.get(id) ?? 0) + 1)
      if (steak) categorySteak.set(id, (categorySteak.get(id) ?? 0) + 1)
    }
  }
  const categoryById = new Map(categories.map((c) => [c.id, c]))

  const tiles: OriginTile[] = []
  for (const origin of origins) {
    const own = products.filter((p) => p.originId === origin.id)
    if (own.length === 0) continue

    let categoryId = origin.categoryId ?? null
    if (!categoryId) {
      const perCategory = new Map<number, number>()
      for (const product of own) {
        for (const id of product.categoryIds) perCategory.set(id, (perCategory.get(id) ?? 0) + 1)
      }
      let best: { id: number; count: number; total: number } | null = null
      for (const [id, count] of perCategory) {
        const total = categoryTotals.get(id) ?? count
        if (!candidates.has(id)) continue
        if (count / total < AUTO_MATCH_SHARE) continue
        if ((categorySteak.get(id) ?? 0) / total < 0.5) continue
        if (!best || count > best.count || (count === best.count && total < best.total)) {
          best = { id, count, total }
        }
      }
      categoryId = best?.id ?? null
    }

    // Photo: preferably a product of the linked category (a steak, not a sauce from the country).
    const inCategory = categoryId
      ? own.filter((p) => p.categoryIds.includes(categoryId as number))
      : []
    const isSteak = (p: TileProduct) => STEAK_MEAT_TYPES.includes(p.meatTypeSlug ?? '')
    const sample =
      inCategory.find((p) => p.inStock && p.image && isSteak(p)) ??
      inCategory.find((p) => p.inStock && p.image) ??
      own.find((p) => p.inStock && p.image) ??
      own.find((p) => p.image)
    tiles.push({
      originId: origin.id,
      label: origin.adjective?.trim() || origin.name,
      categoryId,
      filterSlug: origin.slug ?? null,
      image:
        origin.image ||
        (categoryId ? categoryById.get(categoryId)?.image : null) ||
        sample?.image ||
        null,
      productCount: own.length,
    })
  }
  return tiles
}
