import type { Metadata } from 'next'
import Link from 'next/link'

import { buildMenu, childrenOf } from '@/lib/categoryTree'
import { getPublicPath, LISTING_PATHS } from '@/lib/urls'
import { getAllCategories } from '@/storefront/data'

export const metadata: Metadata = {
  title: 'Stránka nenalezena',
  robots: { index: false, follow: true },
}

/** 404 page of the storefront (also for unknown /produkty/… paths). */
export default async function NotFound() {
  const categories = await getAllCategories()
  const menu = buildMenu(categories)
  const top = (
    menu.columns.length > 0
      ? [
          ...menu.columns.flatMap((c) => c.items.slice(0, 3)),
          ...menu.standalone.map((s) => s.category),
        ]
      : childrenOf(categories, null)
  ).slice(0, 10)

  return (
    <div className="wrap py-14">
      <div className="mx-auto max-w-2xl rounded-card bg-white px-6 py-10 text-center sm:px-12">
        <p className="font-slab text-6xl font-bold text-brand-red">404</p>
        <h1 className="mt-3 text-[1.75rem] sm:text-[2.25rem]">Tuhle stránku jsme nenašli</h1>
        <p className="mt-3 text-muted">
          Možná se produkt přestal prodávat, nebo se adresa změnila. Zkuste vyhledávání nebo
          některou z kategorií níže.
        </p>
        <form
          action={LISTING_PATHS.search}
          method="get"
          role="search"
          className="mx-auto mt-6 flex max-w-md overflow-hidden rounded-card border border-line"
        >
          <label htmlFor="hledat-404" className="sr-only">
            Hledat v obchodě
          </label>
          <input
            id="hledat-404"
            type="search"
            name="ProductsSearch"
            placeholder="Hledat řez, zemi nebo wagyu"
            className="min-w-0 flex-1 px-4 py-3"
          />
          <button
            type="submit"
            className="bg-brand-red px-5 font-bold text-white hover:bg-brand-red-dark"
          >
            Hledat
          </button>
        </form>
        {top.length > 0 ? (
          <ul className="mt-8 flex flex-wrap justify-center gap-2">
            {top.map((category) => (
              <li key={category.id}>
                <Link
                  href={getPublicPath('categories', category)}
                  className="inline-block rounded-full bg-brand-beige-light px-4 py-2 font-semibold text-brand-brown hover:bg-brand-brown hover:text-white"
                >
                  {category.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <Link href="/" className="btn mt-8">
          Zpět na úvodní stránku
        </Link>
      </div>
    </div>
  )
}
