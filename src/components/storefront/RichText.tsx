import type { SerializedLinkNode, SerializedUploadNode } from '@payloadcms/richtext-lexical'
import {
  type JSXConvertersFunction,
  RichText as LexicalRichText,
} from '@payloadcms/richtext-lexical/react'
import Link from 'next/link'

import { hasRichText } from '@/lib/text'
import { getPublicPath, type PublicCollection } from '@/lib/urls'

import { isMedia, MediaImage } from './MediaImage'

/**
 * Renders Payload rich text (Lexical) on the storefront.
 *
 * Handles everything the stage 8 importer produces: paragraphs, headings (h2–h6), lists, quotes,
 * links, bold/italic/underline, line breaks, horizontal rules and images (upload nodes). Embeds
 * (iframes) were replaced by plain links during the import, tables were flattened.
 *
 * - Internal links (paths starting with "/") use next/link; imported links point to legacy paths,
 *   which the storefront serves directly. Links to documents picked in the admin ("internal")
 *   go through `getPublicPath()`.
 * - External links open in a new tab with rel="noopener noreferrer".
 * - Images use the `detail` size; an image whose upload failed during the import is skipped.
 */

type Props = {
  data: unknown
  className?: string
}

const COLLECTIONS: PublicCollection[] = ['products', 'categories', 'articles', 'recipes', 'pages']

function internalHref(node: SerializedLinkNode): string {
  const doc = node.fields.doc
  if (doc && typeof doc.value === 'object' && doc.value) {
    const collection = doc.relationTo as PublicCollection
    if (COLLECTIONS.includes(collection)) {
      return getPublicPath(collection, doc.value as Parameters<typeof getPublicPath>[1])
    }
  }
  return '/'
}

const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,
  link: ({ node, nodesToJSX }) => {
    const linkNode = node as SerializedLinkNode
    const children = nodesToJSX({ nodes: linkNode.children })
    const href =
      linkNode.fields.linkType === 'internal' ? internalHref(linkNode) : (linkNode.fields.url ?? '')
    if (href.startsWith('/') && !href.startsWith('//')) {
      return <Link href={href}>{children}</Link>
    }
    const external = /^https?:\/\//i.test(href)
    return (
      <a
        href={href}
        target={external || linkNode.fields.newTab ? '_blank' : undefined}
        rel={external || linkNode.fields.newTab ? 'noopener noreferrer' : undefined}
      >
        {children}
      </a>
    )
  },
  upload: ({ node }) => {
    const upload = node as SerializedUploadNode
    if (!isMedia(upload.value)) return null
    return (
      <figure>
        <MediaImage
          media={upload.value}
          size="detail"
          sizes="(min-width: 64rem) 720px, 100vw"
          className="h-auto w-full"
        />
      </figure>
    )
  },
})

export function RichText({ data, className = 'prose-terrys' }: Props) {
  if (!hasRichText(data)) return null
  return (
    <LexicalRichText
      // The stored shape is Lexical's serialized editor state.
      data={data as Parameters<typeof LexicalRichText>[0]['data']}
      converters={converters}
      className={className}
      disableIndent
      disableTextAlign
    />
  )
}
