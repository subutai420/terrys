import type { CollectionAdminOptions } from 'payload'

import { getPublicPath, getSiteUrl, type PublicCollection, type UrlDoc } from '@/lib/urls'

/**
 * "Náhled" (preview) button in the admin (stage 3): opens the storefront page of the document in
 * draft mode, so editors see unpublished changes. See `src/app/(frontend)/next/preview/route.ts`.
 */
export function previewUrl(collection: PublicCollection): CollectionAdminOptions['preview'] {
  return (doc) => {
    const path = getPublicPath(collection, doc as UrlDoc)
    return `${getSiteUrl()}/next/preview?path=${encodeURIComponent(path)}`
  }
}
