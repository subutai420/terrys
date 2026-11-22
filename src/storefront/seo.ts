import type { Metadata } from 'next'

import { isMedia, mediaSource } from '@/components/storefront/MediaImage'
import { LOGO_PATH } from '@/lib/site'
import { metaDescription } from '@/lib/text'
import { absoluteUrl } from '@/lib/urls'

/**
 * Page metadata from the SEO fields of a document, with fallbacks:
 * title → `seo.title` or the document title; description → `seo.description`, then the given
 * fallbacks (perex, plain text of the description…); image → `seo.image`, then the main image
 * (its 1200×630 `og` size), then the logo. The canonical URL is always set.
 */
export function buildMetadata({
  title,
  seo,
  descriptionFallbacks = [],
  image,
  path,
  noindex = false,
  type = 'website',
}: {
  title: string
  seo?: { title?: string | null; description?: string | null; image?: unknown } | null
  descriptionFallbacks?: (string | null | undefined)[]
  image?: unknown
  /** Canonical path, e.g. from `getPublicPath()`. */
  path: string
  noindex?: boolean
  type?: 'website' | 'article'
}): Metadata {
  const description = metaDescription(seo?.description, ...descriptionFallbacks)
  const ogMedia = isMedia(seo?.image) ? seo?.image : isMedia(image) ? image : null
  const og = ogMedia && isMedia(ogMedia) ? mediaSource(ogMedia, 'og') : null
  const canonical = absoluteUrl(path)
  const pageTitle = seo?.title?.trim() || title
  return {
    // An SEO title is used as-is (no " | Terrys Steak" suffix): the editor wrote the full title.
    title: seo?.title?.trim() ? { absolute: pageTitle } : pageTitle,
    description,
    alternates: { canonical },
    robots: noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      type,
      url: canonical,
      title: pageTitle,
      description,
      images: og
        ? [
            {
              url: absoluteUrl(og.src),
              width: og.width,
              height: og.height,
              alt: isMedia(ogMedia) ? ogMedia.alt : '',
            },
          ]
        : [{ url: absoluteUrl(LOGO_PATH) }],
      locale: 'cs_CZ',
    },
  }
}
