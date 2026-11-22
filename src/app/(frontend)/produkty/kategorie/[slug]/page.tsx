import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, permanentRedirect } from 'next/navigation'

import { CategoryPage } from '@/components/storefront/views/CategoryPage'
import { filterQueryString, hasActiveFilters, parseFilterParams } from '@/lib/filters'
import { lexicalToPlainText } from '@/lib/text'
import { getPublicPath, LEGACY_CATEGORY_HEADER } from '@/lib/urls'
import type { Category } from '@/payload-types'
import { findLegacyRedirect } from '@/redirects/legacyIndex'
import { getCategoryByLegacyPath, getCategoryBySlug } from '@/storefront/data'
import { buildMetadata } from '@/storefront/seo'

/**
 * Category pages. Two ways in:
 * - old URL `/produkty/<slug>-<id>`: `src/proxy.ts` rewrites it here and passes the old path in a
 *   header; the category is looked up by `legacyUrl`,
 * - clean URL `/produkty/kategorie/<slug>` of categories created in the new admin. A category that
 *   has a legacy URL is redirected there.
 *
 * Rendered per request (filters, sorting and paging are query parameters); the data itself is
 * cached (`src/storefront/data.ts`).
 */

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

async function loadCategory(slug: string): Promise<Category | null> {
  const legacyPath = (await headers()).get(LEGACY_CATEGORY_HEADER)
  if (legacyPath) return getCategoryByLegacyPath(legacyPath)
  const category = await getCategoryBySlug(slug)
  if (!category) return null
  const canonical = getPublicPath('categories', category)
  if (canonical !== `/produkty/kategorie/${encodeURIComponent(slug)}`) permanentRedirect(canonical)
  return category
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const category = await loadCategory(slug)
  if (!category) return {}
  const state = parseFilterParams(query)
  const filtered = hasActiveFilters(state)
  const path = getPublicPath('categories', category)
  const metadata = buildMetadata({
    title:
      state.page > 1 && !filtered ? `${category.title} – strana ${state.page}` : category.title,
    seo: state.page > 1 ? { ...category.seo, title: null } : category.seo,
    descriptionFallbacks: [
      lexicalToPlainText(category.intro),
      lexicalToPlainText(category.bottomText),
    ],
    image: category.image,
    // Filters and sorting: canonical = unfiltered category, noindex,follow.
    // Plain paging: self-referencing canonical (?strana=2), indexable.
    path: filtered ? path : path + filterQueryString({ ...state, page: state.page }),
    noindex: filtered,
  })
  return metadata
}

export default async function CategoryRoute({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const category = await loadCategory(slug)
  if (!category) {
    // Stage 8b fallback (normally answered by src/proxy.ts): an old alias of a category
    // (`/produkty/rib-eye-106` → `/produkty/vysoky-rostenec-rib-eye-106`) or a retired one.
    const legacyPath = (await headers()).get(LEGACY_CATEGORY_HEADER)
    const target = legacyPath ? await findLegacyRedirect(legacyPath, query) : null
    if (target) permanentRedirect(target)
    notFound()
  }
  return <CategoryPage category={category} state={parseFilterParams(query)} />
}
