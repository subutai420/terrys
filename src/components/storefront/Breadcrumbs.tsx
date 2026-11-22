import Link from 'next/link'

import { breadcrumbJsonLd } from '@/lib/jsonld'
import { absoluteUrl } from '@/lib/urls'

import { JsonLd } from './JsonLd'

export type Crumb = { name: string; href: string }

/** Breadcrumb trail ("Domů / Kategorie / Produkt") with BreadcrumbList structured data. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const all = [{ name: 'Domů', href: '/' }, ...items]
  return (
    <>
      <nav aria-label="Drobečková navigace" className="py-4 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {all.map((item, index) => {
            const last = index === all.length - 1
            return (
              <li key={`${item.href}-${index}`} className="flex items-center gap-2">
                {index > 0 && (
                  <span aria-hidden="true" className="text-line">
                    /
                  </span>
                )}
                {last ? (
                  <span aria-current="page" className="text-ink">
                    {item.name}
                  </span>
                ) : (
                  <Link href={item.href} className="underline-offset-2 hover:underline">
                    {item.name}
                  </Link>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
      <JsonLd
        data={breadcrumbJsonLd(
          all.map((item) => ({ name: item.name, url: absoluteUrl(item.href) })),
        )}
      />
    </>
  )
}
