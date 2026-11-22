import path from 'path'
import type { CollectionConfig } from 'payload'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Uploaded images (product photos, banners, ...).
 * Files are stored on the local disk in the `media/` folder in the project root
 * (ignored by git). A cloud storage adapter can replace this in a later stage.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  labels: {
    singular: 'Médium',
    plural: 'Média',
  },
  access: {
    // Anyone can view uploaded files (they are shown on the public storefront).
    // Creating, editing and deleting requires a logged-in admin user (Payload default).
    read: () => true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      label: 'Alternativní text',
      required: true,
      admin: {
        description:
          'Krátký popis obrázku pro nevidomé a vyhledávače, např. „Hovězí steak Rib Eye na prkénku“.',
      },
    },
  ],
  upload: {
    staticDir: path.resolve(dirname, '../../media'),
    mimeTypes: ['image/*'],
  },
}
