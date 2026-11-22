import path from 'path'
import type { CollectionConfig } from 'payload'
import { fileURLToPath } from 'url'

import { anyone, editors } from '@/access'

import { storefrontRevalidationHooks } from '@/storefront/revalidate'

import { ADMIN_GROUPS } from './adminGroups'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Uploaded images (product photos, category illustrations, article covers, ...).
 * Files are stored on the local disk in the `media/` folder in the project root
 * (ignored by git). A cloud storage adapter can replace this in a later stage.
 *
 * Payload automatically creates resized copies (`imageSizes`) in WebP on upload:
 * - `thumbnail` 400×400 (admin lists, small previews),
 * - `card`      800×800 (product and category cards, square crop around the focal point),
 * - `detail`    1600 px wide (product detail, article header),
 * - `og`        1200×630 (social sharing preview).
 */
export const Media: CollectionConfig = {
  slug: 'media',
  labels: {
    singular: 'Obrázek',
    plural: 'Obrázky',
  },
  admin: {
    group: ADMIN_GROUPS.content,
    useAsTitle: 'alt',
    defaultColumns: ['filename', 'alt', 'updatedAt'],
    description:
      'Fotky produktů, kategorií a článků. Nahrávejte co největší kvalitní fotky (ideálně ' +
      'alespoň 1600 px na šířku), menší velikosti se vytvoří automaticky.',
  },
  // Stage 3: clear the storefront cache after every change (src/storefront/revalidate.ts).
  hooks: { ...storefrontRevalidationHooks },
  access: {
    // Anyone can view uploaded files (they are shown on the public storefront).
    read: anyone,
    create: editors,
    update: editors,
    delete: editors,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      label: 'Alternativní text (popis obrázku)',
      required: true,
      admin: {
        description:
          'Povinné. Krátký popis toho, co je na obrázku, pro nevidomé a vyhledávače, ' +
          'např. „Hovězí steak Rib Eye na prkénku“.',
      },
    },
  ],
  upload: {
    staticDir: path.resolve(dirname, '../../media'),
    mimeTypes: ['image/*'],
    focalPoint: true,
    adminThumbnail: 'thumbnail',
    imageSizes: [
      {
        name: 'thumbnail',
        width: 400,
        height: 400,
        formatOptions: { format: 'webp', options: { quality: 80 } },
      },
      {
        name: 'card',
        width: 800,
        height: 800,
        formatOptions: { format: 'webp', options: { quality: 82 } },
      },
      {
        name: 'detail',
        width: 1600,
        withoutEnlargement: true,
        formatOptions: { format: 'webp', options: { quality: 85 } },
      },
      {
        name: 'og',
        width: 1200,
        height: 630,
        formatOptions: { format: 'webp', options: { quality: 82 } },
      },
    ],
  },
}
