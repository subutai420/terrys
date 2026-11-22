import Image from 'next/image'
import Link from 'next/link'

import { buildMenu, childrenOf } from '@/lib/categoryTree'
import { formatCzk } from '@/lib/format'
import { publicText } from '@/lib/openingHours'
import { getPublicPath, LISTING_PATHS } from '@/lib/urls'
import { getAllCategories, getAllPages, getSettings } from '@/storefront/data'

import { CartCount } from './CartCount'
import { MainNav, type NavData } from './MainNav'

/** Link to a static page by its old URL, if that page is published. */
export async function findPageLink(legacyUrl: string) {
  const pages = await getAllPages()
  const page = pages.find((p) => p.legacyUrl === legacyUrl)
  return page ? { title: page.title, href: getPublicPath('pages', page) } : null
}

async function navData(): Promise<NavData> {
  const categories = await getAllCategories()
  const menu = buildMenu(categories)
  const link = (c: (typeof categories)[number]) => ({
    title: c.title,
    href: getPublicPath('categories', c),
  })
  const columns = menu.columns.map((column) => ({
    key: column.key,
    label: column.label,
    items: column.items.map(link),
  }))
  const standalone = menu.standalone.map(({ category, children }) => ({
    ...link(category),
    children: children.map(link),
  }))
  // Quick links in the bar: the "meat type" column when the menu is configured, otherwise the
  // first top-level categories.
  const meatTypes = menu.columns.find((column) => column.key === 'meat-type')
  const quick = (
    meatTypes ? meatTypes.items : menu.columns.length === 0 ? childrenOf(categories, null) : []
  )
    .slice(0, 6)
    .map(link)
  return {
    columns,
    standalone,
    quick,
    content: [
      { title: 'Magazín', href: LISTING_PATHS.magazine },
      { title: 'Recepty', href: LISTING_PATHS.recipes },
      { title: 'Prodejny', href: LISTING_PATHS.stores },
    ],
  }
}

export async function Header() {
  const [settings, nav, deliveryPage] = await Promise.all([
    getSettings(),
    navData(),
    findPageLink('/doprava-a-platba'),
  ])
  const phone = publicText(settings.contact?.phone)

  return (
    <header>
      <a
        href="#obsah"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-ink"
      >
        Přeskočit na obsah
      </a>
      <div className="bg-white text-sm text-muted">
        <div className="wrap flex min-h-[2.375rem] flex-wrap items-center gap-x-6 gap-y-1 py-1">
          {deliveryPage ? (
            <Link href={deliveryPage.href} className="font-semibold text-brand-red hover:underline">
              Doprava a platba
            </Link>
          ) : null}
          <span className="hidden sm:inline">
            Chlazený rozvoz za {formatCzk(settings.deliveryPrice ?? 229)}, platíte při převzetí
          </span>
          <span className="flex-1" />
          {phone ? (
            <span>
              Potřebujete poradit?{' '}
              <a
                href={`tel:${phone.replace(/\s+/g, '')}`}
                className="font-bold text-ink hover:underline"
              >
                {phone}
              </a>
            </span>
          ) : null}
        </div>
      </div>
      <div className="bg-[linear-gradient(180deg,#b5050a,var(--color-brand-red-dark))] text-white">
        <div className="wrap grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-3 py-3 lg:min-h-24 lg:grid-cols-[auto_1fr_auto] lg:gap-8 lg:py-0">
          <Link href="/" className="block" aria-label="Terrys – úvodní stránka">
            <Image
              src="/img/logo-white.svg"
              alt="Terrys Steak"
              width={190}
              height={68}
              unoptimized
              preload
              className="h-auto w-[8.75rem] lg:w-[11.875rem]"
            />
          </Link>
          <form
            action={LISTING_PATHS.search}
            method="get"
            role="search"
            className="col-span-2 row-start-2 flex w-full overflow-hidden rounded-card bg-white lg:col-span-1 lg:row-start-auto lg:max-w-[35rem] lg:justify-self-center"
          >
            <label htmlFor="hledat" className="sr-only">
              Hledat v obchodě
            </label>
            <input
              id="hledat"
              type="search"
              name="ProductsSearch"
              placeholder="Hledat řez, zemi nebo wagyu"
              className="min-w-0 flex-1 px-4 py-3 text-ink placeholder:text-muted focus-visible:outline-offset-[-3px]"
              data-testid="search-input"
            />
            <button
              type="submit"
              className="bg-brand-gold-dark px-4 font-bold text-brand-brown hover:bg-brand-gold-light"
            >
              Hledat
            </button>
          </form>
          <div className="flex items-center justify-self-end gap-5 text-[0.9375rem] font-bold">
            <Link
              href="/kosik"
              className="flex items-center gap-2 hover:underline"
              data-testid="cart-link"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M3 4h2l2.4 11h11l2-8H6.2" />
                <circle cx="9" cy="20" r="1.5" />
                <circle cx="18" cy="20" r="1.5" />
              </svg>
              <span className="hidden sm:inline">Košík</span>
              <CartCount />
            </Link>
          </div>
        </div>
      </div>
      <MainNav nav={nav} />
    </header>
  )
}
