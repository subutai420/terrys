import type { Metadata } from 'next'

import { GlossaryList, ListingHeader } from '@/components/storefront/views/ListingViews'
import { getPublicPath, LISTING_PATHS } from '@/lib/urls'
import { getArticles } from '@/storefront/data'
import { buildMetadata } from '@/storefront/seo'

export const revalidate = 3600

const INTRO = 'Pojmy z řeznictví a kuchyně vysvětlené stručně a srozumitelně.'

export const metadata: Metadata = buildMetadata({
  title: 'Slovník pojmů',
  descriptionFallbacks: [INTRO],
  path: LISTING_PATHS.glossary,
})

export default async function GlossaryPage() {
  const terms = await getArticles('glossary', 500)
  return (
    <div className="wrap pb-16">
      <ListingHeader
        title="Slovník pojmů"
        intro={INTRO}
        crumbs={[
          { name: 'Terrys Academy', href: LISTING_PATHS.academy },
          { name: 'Slovník pojmů', href: LISTING_PATHS.glossary },
        ]}
      />
      {terms.length > 0 ? (
        <GlossaryList
          terms={terms.map((t) => ({
            id: t.id,
            title: t.title,
            href: getPublicPath('articles', t),
          }))}
        />
      ) : (
        <p className="rounded-card bg-white p-8 text-center">
          Slovník zatím neobsahuje žádné pojmy.
        </p>
      )}
    </div>
  )
}
