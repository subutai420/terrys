import type { Metadata } from 'next'
import Link from 'next/link'

import { ArticleCard, RecipeCard } from '@/components/storefront/Cards'
import { MediaImage } from '@/components/storefront/MediaImage'
import { ProductCard } from '@/components/storefront/ProductCard'
import { HOMEPAGE_DEFAULTS as D } from '@/globals/homepageDefaults'
import { buildMenu, childrenOf } from '@/lib/categoryTree'
import { formatCzk } from '@/lib/format'
import { publicText, weeklyRows } from '@/lib/openingHours'
import { getPublicPath, LISTING_PATHS } from '@/lib/urls'
import {
  type CardProduct,
  getAllCategories,
  getArticles,
  getCategorySampleImages,
  getHomepage,
  getLocations,
  getOriginTiles,
  getRecipes,
  getSettings,
  type MenuCategory,
  populated,
  usableImage,
} from '@/storefront/data'
import { buildMetadata } from '@/storefront/seo'

/**
 * Homepage (design A). Texts and selections come from the global "Úvodní stránka"
 * (`src/globals/Homepage.ts`); empty selections fall back to the category menu and the catalog.
 */

export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  const homepage = await getHomepage()
  return {
    ...buildMetadata({
      title: 'Terrys Steak – prémiové steaky a maso z celého světa',
      descriptionFallbacks: [publicText(homepage.hero?.text) ?? D.hero.text],
      image: homepage.hero?.image,
      path: '/',
    }),
    title: { absolute: 'Terrys Steak – prémiové steaky a maso z celého světa' },
  }
}

const TRUST_ICONS = [
  <path key="a" d="M12 3v3M5 21h14l-2-12H7zM8 9a4 4 0 0 1 8 0" />,
  <path key="b" d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7 18a2 2 0 1 0 0 .1M17 18a2 2 0 1 0 0 .1" />,
  <path key="c" d="M3 6h18v13H3zM3 10h18" />,
  <path key="d" d="M4 21V9l8-6 8 6v12M9 21v-7h6v7" />,
]

/** "Vysoký roštěnec / Rib Eye" → ["Vysoký roštěnec", "Rib Eye"] (old category naming). */
function splitTitle(title: string): [string, string | null] {
  const [first, ...rest] = title.split(' / ')
  return [first, rest.length ? rest.join(' / ') : null]
}

function asCategories(values: unknown): MenuCategory[] {
  return populated<MenuCategory>(values as (number | MenuCategory)[])
}

export default async function HomePage() {
  const [homepage, settings, categories, tiles, articles, recipes, locations, samples] =
    await Promise.all([
      getHomepage(),
      getSettings(),
      getAllCategories(),
      getOriginTiles(),
      getArticles('magazine', 3),
      getRecipes(3),
      getLocations(),
      getCategorySampleImages(),
    ])
  /** Category tile picture: its own (if large enough), else a photo of one of its products. */
  const categoryImage = (category: MenuCategory) =>
    usableImage(category.image ?? byIdImage(category.id)) ??
    usableImage(samples[category.id]) ??
    null
  const menu = buildMenu(categories)
  const byId = new Map(categories.map((c) => [c.id, c]))
  function byIdImage(id: number) {
    return byId.get(id)?.image
  }
  const hero = homepage.hero ?? {}
  const delivery = formatCzk(settings.deliveryPrice ?? 229)

  // Featured categories: editor's choice, else the "by cut" menu column.
  const chosenFeatured = asCategories(homepage.featuredCategories?.categories)
  const featured = (
    chosenFeatured.length
      ? chosenFeatured
      : (menu.columns.find((c) => c.key === 'cut')?.items ?? [])
  ).slice(0, 8)

  // Country tiles: editor's order/selection, else all origins with products.
  const chosenOrigins = populated<{ id: number }>(homepage.origins?.list as never).map((o) => o.id)
  const originTiles = chosenOrigins.length
    ? chosenOrigins
        .map((id) => tiles.find((t) => t.originId === id))
        .filter((t): t is (typeof tiles)[number] => Boolean(t))
    : tiles.filter((t) => t.categoryId !== null).slice(0, 12)
  const tileCategoryIds = new Set(originTiles.map((t) => t.categoryId))

  // Other categories: editor's choice, else meat-type column + standalone items, else the
  // top-level categories with a picture (the old homepage tiles).
  const chosenOther = asCategories(homepage.otherCategories?.categories)
  const menuConfigured = categories.some((c) => c.menuColumn)
  const configuredOther = !menuConfigured
    ? []
    : [
        ...(menu.columns.find((c) => c.key === 'meat-type')?.items ?? []),
        ...menu.standalone.map((s) => s.category),
      ]
  const other = (
    chosenOther.length
      ? chosenOther
      : configuredOther.length
        ? configuredOther
        : childrenOf(categories, null).filter((c) => !tileCategoryIds.has(c.id))
  )
    .filter((c) => categoryImage(c))
    .slice(0, 12)

  const featuredProducts = populated<CardProduct & { id: number }>(
    homepage.featuredProducts?.products as never,
  )
  const trust = (homepage.trustItems?.length ? homepage.trustItems : D.trustItems).slice(0, 4)
  const story = homepage.story
  const storyParagraphs = (publicText(story?.text) ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  const shop = locations.find((l) => l.kind === 'shop')
  const shopStreet = publicText(shop?.address?.street)
  const shopHours = shop ? weeklyRows(shop.openingHours).filter((r) => r.text !== 'Zavřeno') : []

  return (
    <>
      {/* ------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden bg-hero text-white">
        <MediaImage
          media={hero.image}
          size="detail"
          sizes="100vw"
          alt=""
          fill
          preload
          className="object-cover opacity-60"
        />
        <div
          className={`wrap relative flex flex-col justify-center py-10 sm:py-12 ${hero.image ? 'min-h-[26rem] sm:min-h-[28.75rem]' : ''}`}
        >
          <div className="max-w-[32.5rem] border-t-4 border-brand-gold-dark bg-[rgba(43,26,17,0.88)] px-6 pt-6 pb-6 sm:px-9 sm:pt-9 sm:pb-8">
            <h1 className="text-[2rem] font-bold text-white sm:text-[2.75rem]">
              {publicText(hero.heading) ?? D.hero.heading}
            </h1>
            <p className="mt-3.5 mb-6 text-lg text-on-dark">
              {publicText(hero.text) ?? D.hero.text}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href={publicText(hero.primaryUrl) ?? D.hero.primaryUrl} className="btn">
                {publicText(hero.primaryLabel) ?? D.hero.primaryLabel}
              </Link>
              {publicText(hero.secondaryLabel) && publicText(hero.secondaryUrl) ? (
                <Link
                  href={publicText(hero.secondaryUrl) as string}
                  className="btn btn-ghost-light"
                >
                  {publicText(hero.secondaryLabel)}
                </Link>
              ) : null}
            </div>
            {shop && shopStreet ? (
              <p className="mt-4.5 text-[0.9375rem] text-on-dark-muted">
                {shop.kind === 'shop' ? 'Prodejna' : shop.name}:{' '}
                {[shopStreet, publicText(shop.address?.city)].filter(Boolean).join(', ')}
                {shopHours.length ? `, ${shopHours[0].label} ${shopHours[0].text}` : ''}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- trust bar */}
      <div className="border-b border-line bg-white">
        <ul className="wrap grid gap-5 py-4.5 sm:grid-cols-2 lg:grid-cols-4">
          {trust.map((item, index) => (
            <li
              key={`${item.title}-${index}`}
              className="flex items-start gap-3 text-[0.90625rem] text-muted"
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
                className="mt-0.5 flex-none text-brand-red"
              >
                {TRUST_ICONS[index % TRUST_ICONS.length]}
              </svg>
              <div>
                <b className="block font-slab text-base font-semibold text-brand-brown">
                  {item.title}
                </b>
                {item.text?.replace('{doprava}', delivery)}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* ------------------------------------------------------------- featured categories */}
      {featured.length > 0 ? (
        <section className="py-14">
          <div className="wrap">
            <h2 className="sec-title">
              {publicText(homepage.featuredCategories?.heading) ?? D.featuredCategoriesHeading}
              <small>
                {publicText(homepage.featuredCategories?.subheading) ??
                  D.featuredCategoriesSubheading}
              </small>
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
              {featured.map((category) => {
                const [main, second] = splitTitle(category.title)
                const image = categoryImage(category)
                return (
                  <Link
                    key={category.id}
                    href={getPublicPath('categories', category)}
                    className="group overflow-hidden rounded-card bg-white shadow-[0_1px_0_var(--color-line)]"
                  >
                    <div className="relative aspect-[4/3] bg-brand-beige-light">
                      <MediaImage
                        media={image}
                        size="card"
                        sizes="(min-width: 64rem) 300px, 50vw"
                        alt=""
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      />
                    </div>
                    <div className="px-4 py-3.5">
                      <h3 className="text-lg sm:text-xl">{second ?? main}</h3>
                      {second ? <span className="text-[0.90625rem] text-muted">{main}</span> : null}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------- origins + other categories */}
      {originTiles.length > 0 || other.length > 0 ? (
        <section className={featured.length > 0 ? 'pb-14' : 'py-14'}>
          <div className="wrap">
            {originTiles.length > 0 ? (
              <>
                <h2 className="sec-title">
                  {publicText(homepage.origins?.heading) ?? D.originsHeading}
                </h2>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  {originTiles.map((tile) => {
                    const category = tile.categoryId ? byId.get(tile.categoryId) : null
                    const href = category
                      ? getPublicPath('categories', category)
                      : `${LISTING_PATHS.products}${tile.filterSlug ? `?puvod=${tile.filterSlug}` : ''}`
                    const label = category?.title ?? tile.label
                    return (
                      <Link
                        key={tile.originId}
                        href={href}
                        className="group relative block aspect-[3/2] overflow-hidden rounded-card bg-black"
                      >
                        <MediaImage
                          media={tile.image}
                          size="card"
                          sizes="(min-width: 64rem) 300px, 50vw"
                          alt=""
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                        <span className="absolute inset-x-0 bottom-0 bg-[rgba(43,26,17,0.88)] px-3.5 py-2.5 font-slab text-[0.9375rem] font-semibold text-white sm:text-base">
                          {label}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </>
            ) : null}
            {other.length > 0 ? (
              <>
                <h2 className={`sec-title ${originTiles.length > 0 ? 'mt-12' : ''}`}>
                  {publicText(homepage.otherCategories?.heading) ?? D.otherCategoriesHeading}
                </h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  {other.map((category) => (
                    <Link
                      key={category.id}
                      href={getPublicPath('categories', category)}
                      className="group relative block aspect-square overflow-hidden rounded-card bg-black"
                    >
                      <MediaImage
                        media={categoryImage(category)}
                        size="card"
                        sizes="(min-width: 64rem) 200px, (min-width: 40rem) 33vw, 50vw"
                        alt=""
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      />
                      <span className="absolute inset-x-0 bottom-0 bg-[rgba(43,26,17,0.88)] px-3 py-2 font-slab text-sm font-semibold text-white">
                        {category.title}
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------- featured products */}
      {featuredProducts.length > 0 ? (
        <section className="pb-14">
          <div className="wrap">
            <h2 className="sec-title">
              {publicText(homepage.featuredProducts?.heading) ?? D.featuredProductsHeading}
            </h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {featuredProducts.slice(0, 8).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------- story */}
      {publicText(story?.heading) && storyParagraphs.length > 0 ? (
        <section className="bg-brand-brown py-14 text-on-dark">
          <div className={`wrap grid items-center gap-12 ${story?.image ? 'lg:grid-cols-2' : ''}`}>
            <div>
              <h2 className="text-[2rem] text-white sm:text-[2.375rem]">
                {publicText(story?.heading)}
              </h2>
              {storyParagraphs.map((paragraph) => (
                <p key={paragraph} className="mt-4 max-w-[52ch] text-[1.0625rem]">
                  {paragraph}
                </p>
              ))}
              {publicText(story?.linkLabel) && publicText(story?.linkUrl) ? (
                <Link href={publicText(story?.linkUrl) as string} className="btn mt-6">
                  {publicText(story?.linkLabel)}
                </Link>
              ) : null}
            </div>
            {story?.image ? (
              <MediaImage
                media={story.image}
                size="detail"
                sizes="(min-width: 64rem) 600px, 100vw"
                className="aspect-[4/5] max-h-[32.5rem] w-full rounded-card object-cover"
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------- magazine + recipes */}
      {articles.length > 0 ? (
        <section className="py-14">
          <div className="wrap">
            <h2 className="sec-title">
              {publicText(homepage.magazine?.heading) ?? D.magazineHeading}
              <small>{publicText(homepage.magazine?.subheading) ?? D.magazineSubheading}</small>
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} kicker="Magazín" />
              ))}
            </div>
            <p className="mt-6 text-center">
              <Link
                href={LISTING_PATHS.magazine}
                className="font-semibold text-brand-red hover:underline"
              >
                Všechny články
              </Link>
            </p>
          </div>
        </section>
      ) : null}
      {recipes.length > 0 ? (
        <section className={articles.length > 0 ? 'pb-14' : 'py-14'}>
          <div className="wrap">
            <h2 className="sec-title">
              {publicText(homepage.magazine?.recipesHeading) ?? D.recipesHeading}
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {recipes.map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
            <p className="mt-6 text-center">
              <Link
                href={LISTING_PATHS.recipes}
                className="font-semibold text-brand-red hover:underline"
              >
                Všechny recepty
              </Link>
            </p>
          </div>
        </section>
      ) : null}
    </>
  )
}
