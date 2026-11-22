import type { Metadata } from 'next'
import Link from 'next/link'

import { MediaImage } from '@/components/storefront/MediaImage'
import { OpenNow } from '@/components/storefront/OpenNow'
import { ListingHeader } from '@/components/storefront/views/ListingViews'
import { publicText, weeklyRows } from '@/lib/openingHours'
import { getPublicPath, LISTING_PATHS } from '@/lib/urls'
import { getLocations } from '@/storefront/data'
import { buildMetadata } from '@/storefront/seo'

export const revalidate = 3600

const INTRO = 'Kde nás najdete a kde si můžete vyzvednout objednávku.'

export const metadata: Metadata = buildMetadata({
  title: 'Prodejny a výdejní místa',
  descriptionFallbacks: [INTRO],
  path: LISTING_PATHS.stores,
})

export default async function StoresPage() {
  const locations = await getLocations()
  return (
    <div className="wrap pb-16">
      <ListingHeader
        title="Prodejny a výdejní místa"
        intro={INTRO}
        crumbs={[{ name: 'Prodejny', href: LISTING_PATHS.stores }]}
      />
      {locations.length === 0 ? (
        <p className="rounded-card bg-white p-8 text-center">
          Informace o prodejnách připravujeme.
        </p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {locations.map((location) => {
            const page = typeof location.page === 'object' && location.page ? location.page : null
            const street = publicText(location.address?.street)
            const city = publicText(location.address?.city)
            const rows = weeklyRows(location.openingHours)
            return (
              <article key={location.id} className="overflow-hidden rounded-card bg-white">
                {location.image ? (
                  <div className="relative aspect-[16/9]">
                    <MediaImage
                      media={location.image}
                      size="card"
                      sizes="(min-width: 48rem) 600px, 100vw"
                      alt=""
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : null}
                <div className="p-6">
                  <h2 className="text-2xl">{location.name}</h2>
                  <p className="mt-1 text-sm font-semibold text-muted">
                    {location.kind === 'shop' ? 'Prodejna' : 'Výdejní místo'}
                    {location.isPickupPoint ? ' · osobní odběr objednávek' : ''}
                  </p>
                  <div className="mt-3">
                    <OpenNow hours={location.openingHours} />
                  </div>
                  {street || city ? (
                    <p className="mt-3">{[street, city].filter(Boolean).join(', ')}</p>
                  ) : null}
                  {rows.length > 0 ? (
                    <ul className="mt-3 text-[0.9375rem]">
                      {rows.map((row) => (
                        <li key={row.day}>
                          <span className="inline-block w-24 text-muted">{row.label}</span>{' '}
                          {row.text}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {page ? (
                    <Link href={getPublicPath('pages', page)} className="btn btn-ghost mt-5">
                      Více o místě
                    </Link>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
