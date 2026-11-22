/**
 * Category tree helpers: menu columns, ancestors (breadcrumbs), descendants (a parent category
 * lists the products of its subcategories too). Pure, unit-tested in `categoryTree.test.ts`.
 */

export type MenuColumn = 'meat-type' | 'cut' | 'origin' | 'standalone'

export type TreeCategory = {
  id: number
  title: string
  slug?: string | null
  legacyUrl?: string | null
  parent?: number | { id: number } | null
  menuColumn?: MenuColumn | null
  menuOrder?: number | null
}

export const MENU_COLUMN_LABELS: Record<Exclude<MenuColumn, 'standalone'>, string> = {
  'meat-type': 'Podle druhu masa',
  cut: 'Podle řezu',
  origin: 'Podle původu',
}

export function parentId(category: TreeCategory): number | null {
  const parent = category.parent
  if (parent === null || parent === undefined) return null
  return typeof parent === 'number' ? parent : parent.id
}

const collator = new Intl.Collator('cs')

export function byMenuOrder<T extends TreeCategory>(a: T, b: T): number {
  return (a.menuOrder ?? 100) - (b.menuOrder ?? 100) || collator.compare(a.title, b.title)
}

export function childrenOf<T extends TreeCategory>(categories: T[], id: number | null): T[] {
  return categories.filter((c) => parentId(c) === id).sort(byMenuOrder)
}

/** Ancestors from the root down to (not including) the category. Cycles are cut off. */
export function ancestorsOf<T extends TreeCategory>(categories: T[], category: T): T[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const chain: T[] = []
  const seen = new Set<number>([category.id])
  let current = parentId(category)
  while (current !== null && !seen.has(current)) {
    const parent = byId.get(current)
    if (!parent) break
    chain.unshift(parent)
    seen.add(current)
    current = parentId(parent)
  }
  return chain
}

/** The category id plus the ids of all its subcategories (any depth). */
export function descendantIds(categories: TreeCategory[], id: number): number[] {
  const result = new Set<number>([id])
  let added = true
  while (added) {
    added = false
    for (const category of categories) {
      const parent = parentId(category)
      if (parent !== null && result.has(parent) && !result.has(category.id)) {
        result.add(category.id)
        added = true
      }
    }
  }
  return [...result]
}

export type MenuItem<T extends TreeCategory> = { category: T; children: T[] }
export type Menu<T extends TreeCategory> = {
  columns: { key: Exclude<MenuColumn, 'standalone'>; label: string; items: T[] }[]
  standalone: MenuItem<T>[]
}

/**
 * Mega menu from `menuColumn` + `menuOrder`. Three columns (meat type, cut, origin) and
 * standalone items (each with its subcategories).
 *
 * Fallback: when no category has a menu column set yet (e.g. right after the import from the old
 * web), the top-level categories become standalone items with their children, so the menu is
 * never empty. Editors switch to the designed menu just by filling in "Sloupec v menu".
 */
export function buildMenu<T extends TreeCategory>(categories: T[]): Menu<T> {
  const inMenu = categories.filter((c) => c.menuColumn)
  if (inMenu.length === 0) {
    return {
      columns: [],
      standalone: childrenOf(categories, null).map((category) => ({
        category,
        children: childrenOf(categories, category.id),
      })),
    }
  }
  const columns = (Object.keys(MENU_COLUMN_LABELS) as Exclude<MenuColumn, 'standalone'>[])
    .map((key) => ({
      key,
      label: MENU_COLUMN_LABELS[key],
      items: inMenu.filter((c) => c.menuColumn === key).sort(byMenuOrder),
    }))
    .filter((column) => column.items.length > 0)
  const standalone = inMenu
    .filter((c) => c.menuColumn === 'standalone')
    .sort(byMenuOrder)
    .map((category) => ({
      category,
      children: childrenOf(categories, category.id).filter((child) => !child.menuColumn),
    }))
  return { columns, standalone }
}
