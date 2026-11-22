import type { Metadata } from 'next'
import Link from 'next/link'

import { ViewItemListEvent } from '@/components/storefront/AnalyticsEvents'
import { ProductCard } from '@/components/storefront/ProductCard'
import { ListingHeader } from '@/components/storefront/views/ListingViews'
import { LIST_ATTRIBUTE } from '@/lib/measurement/dom'
import { LISTING_PATHS } from '@/lib/urls'
import { listItems } from '@/storefront/analytics'
import { searchProducts } from '@/storefront/search'

/**
 * Product search. Keeps the old URL `/vyhledavani?ProductsSearch=…` (used in ads); `q` works too.
 * Never indexed (noindex,follow; robots.txt also disallows it).
 */

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

function readQuery(params: Record<string, string | string[] | undefined>): string {
  const raw = params.ProductsSearch ?? params.productsSearch ?? params.q
  return (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100) ?? ''
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = readQuery(await searchParams)
  return {
    title: query ? `Hledání „${query}“` : 'Hledání',
    robots: { index: false, follow: true },
    alternates: { canonical: LISTING_PATHS.search },
  }
}

export default async function SearchPage({ searchParams }: Props) {
  const query = readQuery(await searchParams)
  const products = query ? await searchProducts(query) : []
  const analyticsItems = await listItems(products, { id: 'search', name: 'Vyhledávání' })
  return (
    <div className="wrap pb-16">
      <ListingHeader
        title={query ? `Hledání „${query}“` : 'Hledání'}
        crumbs={[{ name: 'Hledání', href: LISTING_PATHS.search }]}
      />
      <form
        action={LISTING_PATHS.search}
        method="get"
        role="search"
        className="mb-8 flex max-w-xl overflow-hidden rounded-card bg-white"
      >
        <label htmlFor="hledat-stranka" className="sr-only">
          Hledaný výraz
        </label>
        <input
          id="hledat-stranka"
          type="search"
          name="ProductsSearch"
          defaultValue={query}
          placeholder="Např. svíčková, wagyu, Argentina"
          className="min-w-0 flex-1 px-4 py-3"
        />
        <button
          type="submit"
          className="bg-brand-red px-5 font-bold text-white hover:bg-brand-red-dark"
        >
          Hledat
        </button>
      </form>
      {query ? (
        <p className="mb-5 text-muted" aria-live="polite" data-testid="search-count">
          {products.length === 0
            ? 'Nic jsme nenašli.'
            : `Nalezeno: ${products.length} ${products.length === 1 ? 'produkt' : products.length < 5 ? 'produkty' : 'produktů'}`}
        </p>
      ) : null}
      {products.length > 0 ? <h2 className="sr-only">Nalezené produkty</h2> : null}
      {products.length > 0 ? (
        <div
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
          data-testid="search-results"
          {...{ [LIST_ATTRIBUTE]: 'search' }}
        >
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : query ? (
        <div className="rounded-card bg-white p-8">
          <p>
            Zkuste jiné slovo, například název řezu (svíčková, rib eye), zemi původu nebo druh masa.
          </p>
          <p className="mt-3">
            <Link
              href={LISTING_PATHS.products}
              className="font-semibold text-brand-red hover:underline"
            >
              Projít všechny produkty
            </Link>
          </p>
        </div>
      ) : null}
      {products.length > 0 ? (
        <ViewItemListEvent listId="search" listName="Vyhledávání" items={analyticsItems} />
      ) : null}
    </div>
  )
}
