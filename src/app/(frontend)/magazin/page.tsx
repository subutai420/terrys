import type { Metadata } from 'next'

import { ArticleGrid, ListingHeader } from '@/components/storefront/views/ListingViews'
import { LISTING_PATHS } from '@/lib/urls'
import { getArticles } from '@/storefront/data'
import { buildMetadata } from '@/storefront/seo'

export const revalidate = 3600

const INTRO = 'Řezy, plemena, postupy a novinky od našich řezníků.'

export const metadata: Metadata = buildMetadata({
  title: 'Magazín',
  descriptionFallbacks: [INTRO],
  path: LISTING_PATHS.magazine,
})

export default async function MagazinePage() {
  const articles = await getArticles('magazine', 200)
  return (
    <div className="wrap pb-16">
      <ListingHeader
        title="Magazín"
        intro={INTRO}
        crumbs={[{ name: 'Magazín', href: LISTING_PATHS.magazine }]}
      />
      <ArticleGrid articles={articles} kicker="Magazín" />
    </div>
  )
}
