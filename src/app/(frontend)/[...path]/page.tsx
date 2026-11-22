import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'

import { CategoryPage } from '@/components/storefront/views/CategoryPage'
import { ArticleView, PageView, RecipeView } from '@/components/storefront/views/ContentViews'
import { ProductView } from '@/components/storefront/views/ProductView'
import { parseFilterParams } from '@/lib/filters'
import { lexicalToPlainText } from '@/lib/text'
import { getPublicPath, pathFromSegments } from '@/lib/urls'
import { getLocations } from '@/storefront/data'
import { resolvePath } from '@/storefront/resolve'
import { buildMetadata } from '@/storefront/seo'

/**
 * Every document page of the storefront: products, articles (magazine, academy, glossary),
 * recipes and static pages – at their OLD terrys.cz address (legacyUrl) or at the clean path of
 * documents created in the new admin. See `src/storefront/resolve.ts` and `src/lib/urls.ts`.
 *
 * Static generation: no paths are pre-rendered at build time; each page is rendered on its first
 * visit and then served from the cache until an edit in the admin revalidates it (ISR).
 * Unknown paths → notFound() → real 404 (not-found.tsx).
 */

type Props = { params: Promise<{ path: string[] }> }

export const dynamicParams = true
export const revalidate = 3600

export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params
  const resolved = await resolvePath(pathFromSegments(path))
  if (!resolved || resolved.kind === 'redirect') return {}
  switch (resolved.kind) {
    case 'product': {
      const doc = resolved.doc
      return buildMetadata({
        title: doc.title,
        seo: doc.seo,
        descriptionFallbacks: [
          lexicalToPlainText(doc.shortDescription),
          lexicalToPlainText(doc.description),
        ],
        image: doc.mainImage,
        path: getPublicPath('products', doc),
      })
    }
    case 'article':
      return buildMetadata({
        title: resolved.doc.title,
        seo: resolved.doc.seo,
        descriptionFallbacks: [resolved.doc.perex, lexicalToPlainText(resolved.doc.content)],
        image: resolved.doc.coverImage,
        path: getPublicPath('articles', resolved.doc),
        type: 'article',
      })
    case 'recipe':
      return buildMetadata({
        title: resolved.doc.title,
        seo: resolved.doc.seo,
        descriptionFallbacks: [resolved.doc.perex, lexicalToPlainText(resolved.doc.content)],
        image: resolved.doc.coverImage,
        path: getPublicPath('recipes', resolved.doc),
        type: 'article',
      })
    case 'page':
      return buildMetadata({
        title: resolved.doc.title,
        seo: resolved.doc.seo,
        descriptionFallbacks: [lexicalToPlainText(resolved.doc.content)],
        path: getPublicPath('pages', resolved.doc),
      })
    case 'category':
      return buildMetadata({
        title: resolved.doc.title,
        seo: resolved.doc.seo,
        descriptionFallbacks: [lexicalToPlainText(resolved.doc.intro)],
        image: resolved.doc.image,
        path: getPublicPath('categories', resolved.doc),
      })
  }
}

export default async function DocumentPage({ params }: Props) {
  const { path } = await params
  const resolved = await resolvePath(pathFromSegments(path))
  if (!resolved) notFound()

  switch (resolved.kind) {
    case 'redirect':
      permanentRedirect(resolved.to)
    case 'product':
      return <ProductView product={resolved.doc} />
    case 'article':
      return <ArticleView article={resolved.doc} />
    case 'recipe':
      return <RecipeView recipe={resolved.doc} />
    case 'page': {
      const locations = await getLocations()
      const location =
        locations.find((l) => {
          const page = l.page
          return (typeof page === 'object' && page ? page.id : page) === resolved.doc.id
        }) ?? null
      return <PageView page={resolved.doc} location={location} />
    }
    case 'category':
      return <CategoryPage category={resolved.doc} state={parseFilterParams({})} />
  }
}
