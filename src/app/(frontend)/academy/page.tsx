import type { Metadata } from 'next'
import Link from 'next/link'

import { ArticleGrid, ListingHeader } from '@/components/storefront/views/ListingViews'
import { getPublicPath, LISTING_PATHS } from '@/lib/urls'
import { getArticles } from '@/storefront/data'
import { buildMetadata } from '@/storefront/seo'

export const revalidate = 3600

const INTRO = 'Všechno, co potřebujete vědět o mase: řezy, úpravy a pojmy vysvětlené od řezníků.'

export const metadata: Metadata = buildMetadata({
  title: 'Terrys Academy',
  descriptionFallbacks: [INTRO],
  path: LISTING_PATHS.academy,
})

export default async function AcademyPage() {
  const [articles, glossary] = await Promise.all([
    getArticles('academy', 200),
    getArticles('glossary', 12),
  ])
  return (
    <div className="wrap pb-16">
      <ListingHeader
        title="Terrys Academy"
        intro={INTRO}
        crumbs={[{ name: 'Terrys Academy', href: LISTING_PATHS.academy }]}
      />
      {articles.length > 0 ? <ArticleGrid articles={articles} kicker="Terrys Academy" /> : null}
      {glossary.length > 0 ? (
        <section
          className="mt-12 rounded-card bg-brand-brown px-6 py-8 text-on-dark sm:px-10"
          aria-labelledby="slovnik"
        >
          <h2 id="slovnik" className="text-[1.75rem] text-white">
            Slovník pojmů
          </h2>
          <p className="mt-2 max-w-2xl">
            Co je flambování, chuck roll nebo konfitování? Krátká vysvětlení pojmů z kuchyně a
            řeznictví.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2">
            {glossary.map((term) => (
              <li key={term.id}>
                <Link
                  href={getPublicPath('articles', term)}
                  className="inline-block rounded-full bg-brand-brown-light px-3.5 py-1.5 font-semibold text-white hover:bg-white hover:text-brand-brown"
                >
                  {term.title}
                </Link>
              </li>
            ))}
          </ul>
          <Link href={LISTING_PATHS.glossary} className="btn mt-6">
            Celý slovník pojmů
          </Link>
        </section>
      ) : null}
    </div>
  )
}
