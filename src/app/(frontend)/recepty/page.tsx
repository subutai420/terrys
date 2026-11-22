import type { Metadata } from 'next'

import { ListingHeader, RecipeGrid } from '@/components/storefront/views/ListingViews'
import { LISTING_PATHS } from '@/lib/urls'
import { getRecipes } from '@/storefront/data'
import { buildMetadata } from '@/storefront/seo'

export const revalidate = 3600

const INTRO = 'Ověřené postupy z naší kuchyně: steaky, pečeně, zvěřina i burgery.'

export const metadata: Metadata = buildMetadata({
  title: 'Recepty',
  descriptionFallbacks: [INTRO],
  path: LISTING_PATHS.recipes,
})

export default async function RecipesPage() {
  const recipes = await getRecipes(200)
  return (
    <div className="wrap pb-16">
      <ListingHeader
        title="Recepty"
        intro={INTRO}
        crumbs={[{ name: 'Recepty', href: LISTING_PATHS.recipes }]}
      />
      <RecipeGrid recipes={recipes} />
    </div>
  )
}
