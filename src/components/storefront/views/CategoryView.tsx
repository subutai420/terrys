import Link from 'next/link'

import {
  buildFacets,
  type FilterState,
  filterProducts,
  filterQueryString,
  hasActiveFilters,
  paginate,
  sortProducts,
  withPage,
} from '@/lib/filters'
import { PRICE_UNIT_SHORT } from '@/lib/productView'
import type { CardProduct } from '@/storefront/data'

import { ViewItemListEvent } from '../AnalyticsEvents'
import { Breadcrumbs, type Crumb } from '../Breadcrumbs'
import { FilterForm, SortSelect } from '../FilterForm'
import { MediaImage } from '../MediaImage'
import { ProductCard } from '../ProductCard'
import { RichText } from '../RichText'

export type CategoryLink = { title: string; href: string; current?: boolean }

type Props = {
  title: string
  basePath: string
  crumbs: Crumb[]
  products: CardProduct[]
  state: FilterState
  intro?: unknown
  introText?: string | null
  bottomText?: unknown
  image?: unknown
  /** Subcategories shown as chips above the products. */
  subcategories?: CategoryLink[]
  /** Sibling categories in the sidebar (e.g. all cuts), current one highlighted. */
  siblings?: { heading: string; links: CategoryLink[] } | null
  listId: string
}

function Pagination({
  state,
  totalPages,
  basePath,
}: {
  state: FilterState
  totalPages: number
  basePath: string
}) {
  if (totalPages <= 1) return null
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
  return (
    <nav aria-label="Stránkování" className="mt-8 flex flex-wrap items-center justify-center gap-2">
      {pages.map((page) => {
        const href = basePath + filterQueryString(withPage(state, page))
        const current = page === state.page
        return (
          <Link
            key={page}
            href={href}
            aria-current={current ? 'page' : undefined}
            aria-label={`Strana ${page}`}
            className={`grid h-11 min-w-11 place-items-center rounded-card px-3 font-bold ${
              current
                ? 'bg-brand-brown text-white'
                : 'bg-white text-brand-brown hover:bg-brand-beige-light'
            }`}
          >
            {page}
          </Link>
        )
      })}
    </nav>
  )
}

/** Category / product listing page of design A: header, sidebar filters, grid, SEO text. */
export function CategoryView({
  title,
  basePath,
  crumbs,
  products,
  state,
  intro,
  introText,
  bottomText,
  image,
  subcategories = [],
  siblings,
  listId,
}: Props) {
  const facets = buildFacets(products, state)
  const filtered = sortProducts(filterProducts(products, state), state.sort)
  const page = paginate(filtered, state.page)
  const activeCount = Object.values(state.selected).reduce((sum, values) => sum + values.length, 0)
  const formId = `filtry-${listId}`
  const units = new Set(page.items.map((p) => p.priceUnit))

  return (
    <div className="wrap pb-16">
      <Breadcrumbs items={crumbs} />
      <header className="relative overflow-hidden rounded-card bg-hero text-white">
        {image ? (
          <MediaImage
            media={image}
            size="detail"
            sizes="(min-width: 80rem) 1240px, 100vw"
            alt=""
            fill
            preload
            className="object-cover opacity-45"
          />
        ) : null}
        <div className="relative max-w-3xl px-5 py-7 sm:px-10 sm:py-11">
          <h1 className="text-[1.875rem] text-white sm:text-[2.5rem]">{title}</h1>
          {intro ? (
            <RichText
              data={intro}
              className="prose-terrys mt-3 text-[1.0625rem] text-on-dark [&_a]:text-white"
            />
          ) : introText ? (
            <p className="mt-3 text-[1.0625rem] text-on-dark">{introText}</p>
          ) : null}
        </div>
      </header>

      {subcategories.length > 0 ? (
        <ul className="mt-5 flex flex-wrap gap-2" aria-label="Podkategorie">
          {subcategories.map((child) => (
            <li key={child.href}>
              <Link
                href={child.href}
                className="inline-block rounded-full bg-white px-4 py-2 text-[0.9375rem] font-semibold text-brand-brown hover:bg-brand-brown hover:text-white"
              >
                {child.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-7 pt-7 lg:grid-cols-[16.25rem_1fr]">
        <aside aria-label="Filtry" className="space-y-4 lg:sticky lg:top-3 lg:self-start">
          {siblings && siblings.links.length > 1 ? (
            <nav
              aria-label={siblings.heading}
              className="hidden rounded-card bg-white p-5 lg:block"
            >
              <h2 className="mb-2.5 border-b-2 border-brand-beige pb-1.5 text-[1.0625rem] font-semibold">
                {siblings.heading}
              </h2>
              <ul className="text-[0.9375rem]">
                {siblings.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={link.current ? 'page' : undefined}
                      className="block rounded px-2 py-1.5 hover:bg-brand-beige-light aria-[current=page]:bg-brand-red aria-[current=page]:font-bold aria-[current=page]:text-white"
                    >
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          {facets.length > 0 ? (
            <FilterForm
              action={basePath}
              facets={facets}
              sort={state.sort}
              activeCount={activeCount}
              formId={formId}
            />
          ) : null}
        </aside>

        <div className="min-w-0">
          <div className="mb-4.5 flex flex-wrap items-center justify-between gap-4">
            <p className="text-muted" aria-live="polite" data-testid="product-count">
              {page.totalItems === 1
                ? '1 produkt'
                : page.totalItems >= 2 && page.totalItems <= 4
                  ? `${page.totalItems} produkty`
                  : `${page.totalItems} produktů`}
            </p>
            {facets.length > 0 ? <SortSelect sort={state.sort} formId={formId} /> : null}
          </div>
          <h2 className="sr-only">Produkty</h2>
          {page.items.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" data-testid="product-grid">
              {page.items.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  imageSizes={
                    index < 3
                      ? '(min-width: 80rem) 300px, (min-width: 40rem) 45vw, 100vw'
                      : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <div className="rounded-card bg-white p-8 text-center">
              <p className="font-semibold">Tomuto výběru neodpovídá žádný produkt.</p>
              {hasActiveFilters(state) ? (
                <Link
                  href={basePath}
                  className="mt-3 inline-block font-semibold text-brand-red hover:underline"
                >
                  Zrušit filtry
                </Link>
              ) : null}
            </div>
          )}
          <Pagination state={state} totalPages={page.totalPages} basePath={basePath} />
          {page.items.length > 0 ? (
            <p className="mt-7 rounded border-l-4 border-brand-gold-dark bg-brand-beige-light px-4.5 py-3.5 text-[0.9375rem]">
              <b>
                Cena je za{' '}
                {[...units]
                  .map((unit) => (unit === 'piece' ? 'kus' : PRICE_UNIT_SHORT[unit]))
                  .join(' / ')}
                .
              </b>{' '}
              Řezník každou objednávku naporcuje a zváží, výsledná cena se proto může od odhadu
              lišit zhruba o 15 %. Platíte až při převzetí.
            </p>
          ) : null}
        </div>
      </div>

      {bottomText ? (
        <section className="mt-12 rounded-card bg-white px-5 py-7 sm:px-10 sm:py-9">
          <div className="max-w-[75ch]">
            <RichText data={bottomText} />
          </div>
        </section>
      ) : null}

      <ViewItemListEvent
        listId={listId}
        listName={title}
        items={page.items.map((product) => ({
          item_id: String(product.id),
          item_name: product.title,
          price: product.price,
        }))}
      />
    </div>
  )
}
