import { ancestorsOf, childrenOf, MENU_COLUMN_LABELS, parentId } from '@/lib/categoryTree'
import type { FilterState } from '@/lib/filters'
import { lexicalToPlainText } from '@/lib/text'
import { getPublicPath } from '@/lib/urls'
import type { Category } from '@/payload-types'
import { getAllCategories, getCategoryProducts, usableImage } from '@/storefront/data'

import { CategoryView } from './CategoryView'

/** Loads everything a category page needs and renders it. */
export async function CategoryPage({
  category,
  state,
}: {
  category: Category
  state: FilterState
}) {
  const [all, products] = await Promise.all([getAllCategories(), getCategoryProducts(category.id)])
  const node = all.find((c) => c.id === category.id) ?? { ...category, parent: parentId(category) }
  const path = getPublicPath('categories', category)
  const ancestors = ancestorsOf(all, node)
  const link = (c: (typeof all)[number]) => ({
    title: c.title,
    href: getPublicPath('categories', c),
    current: c.id === category.id,
  })

  // Sidebar: categories of the same menu column (e.g. all cuts), else the siblings in the tree.
  const sameColumn =
    category.menuColumn && category.menuColumn !== 'standalone'
      ? all.filter((c) => c.menuColumn === category.menuColumn)
      : []
  const parent = parentId(node)
  const siblings =
    sameColumn.length > 1 ? sameColumn : parent !== null ? childrenOf(all, parent) : []
  const siblingHeading =
    sameColumn.length > 1 && category.menuColumn && category.menuColumn !== 'standalone'
      ? MENU_COLUMN_LABELS[category.menuColumn]
      : (all.find((c) => c.id === parent)?.title ?? 'Kategorie')

  return (
    <CategoryView
      title={category.title}
      basePath={path}
      crumbs={[
        ...ancestors.map((c) => ({ name: c.title, href: getPublicPath('categories', c) })),
        { name: category.title, href: path },
      ]}
      products={products}
      state={state}
      intro={lexicalToPlainText(category.intro) ? category.intro : null}
      bottomText={lexicalToPlainText(category.bottomText) ? category.bottomText : null}
      image={usableImage(category.image)}
      subcategories={childrenOf(all, category.id).map(link)}
      siblings={siblings.length > 1 ? { heading: siblingHeading, links: siblings.map(link) } : null}
      listId={`category-${category.id}`}
    />
  )
}
