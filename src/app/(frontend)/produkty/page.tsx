import type { Metadata } from 'next'

import { CategoryView } from '@/components/storefront/views/CategoryView'
import { buildMenu, childrenOf } from '@/lib/categoryTree'
import { filterQueryString, hasActiveFilters, parseFilterParams } from '@/lib/filters'
import { getPublicPath, LISTING_PATHS } from '@/lib/urls'
import { getAllCardProducts, getAllCategories } from '@/storefront/data'
import { buildMetadata } from '@/storefront/seo'

/** All products (old URL /produkty), with the same filters as a category. */

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const state = parseFilterParams(await searchParams)
  const filtered = hasActiveFilters(state)
  return buildMetadata({
    title:
      state.page > 1 && !filtered ? `Všechny produkty – strana ${state.page}` : 'Všechny produkty',
    descriptionFallbacks: [
      'Celá nabídka řeznictví Terrys: hovězí steaky z celého světa, wagyu, telecí, zvěřina, drůbež, uzeniny a další.',
    ],
    path: filtered ? LISTING_PATHS.products : LISTING_PATHS.products + filterQueryString(state),
    noindex: filtered,
  })
}

export default async function ProductsPage({ searchParams }: Props) {
  const state = parseFilterParams(await searchParams)
  const [products, categories] = await Promise.all([getAllCardProducts(), getAllCategories()])
  const menu = buildMenu(categories)
  // Chips: the configured standalone/meat-type categories, else the top-level ones.
  const topLevel =
    menu.columns.length > 0
      ? [
          ...(menu.columns.find((c) => c.key === 'meat-type')?.items ?? []),
          ...menu.standalone.map((s) => s.category),
        ]
      : childrenOf(categories, null)
  return (
    <CategoryView
      title="Všechny produkty"
      basePath={LISTING_PATHS.products}
      crumbs={[{ name: 'Produkty', href: LISTING_PATHS.products }]}
      products={products}
      state={state}
      introText="Celá nabídka našeho řeznictví na jednom místě. Vyberte si podle druhu masa, řezu nebo země původu."
      subcategories={topLevel.map((c) => ({
        title: c.title,
        href: getPublicPath('categories', c),
      }))}
      listId="all-products"
    />
  )
}
