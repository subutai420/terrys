import { type JsonLd as JsonLdData, serializeJsonLd } from '@/lib/jsonld'

/** Structured data for search engines (schema.org JSON-LD). */
export function JsonLd({ data }: { data: JsonLdData | JsonLdData[] }) {
  return (
    <script
      type="application/ld+json"
      // Serialised with `<` escaped, so CMS text cannot break out of the script tag.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  )
}
