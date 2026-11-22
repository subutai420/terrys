import Link from 'next/link'

import { articleJsonLd, localBusinessJsonLd, recipeJsonLd } from '@/lib/jsonld'
import { openingHoursSpecification, publicText, weeklyRows } from '@/lib/openingHours'
import {
  defaultVariantIndex,
  isWeightPriced,
  purchaseMode,
  variantOptions,
} from '@/lib/productView'
import { LOGO_PATH, SITE_NAME } from '@/lib/site'
import { lexicalToPlainText, metaDescription } from '@/lib/text'
import { absoluteUrl, getPublicPath, isGlossaryTerm, LISTING_PATHS } from '@/lib/urls'
import type { Article, Location, Page, Recipe } from '@/payload-types'
import { type CardProduct, getSettings, populated } from '@/storefront/data'

import { Breadcrumbs } from '../Breadcrumbs'
import { BuyBox } from '../BuyBox'
import { formatDate } from '../Cards'
import { JsonLd } from '../JsonLd'
import { isMedia, MediaImage, mediaSource } from '../MediaImage'
import { OpenNow } from '../OpenNow'
import { ProductCard } from '../ProductCard'
import { RichText } from '../RichText'

/**
 * The publish date, unless it was only filled in automatically by the stage 8 import (the old
 * site had no date for glossary terms and recipes; showing the import day would be untrue).
 */
export function realPublishDate(doc: {
  publishedAt?: string | null
  migration?: { importedAt?: string | null } | null
}): string | null {
  const published = doc.publishedAt
  if (!published) return null
  const imported = doc.migration?.importedAt
  if (imported && published.slice(0, 10) === imported.slice(0, 10)) return null
  return published
}

/** Imported texts often repeat the perex as their first paragraph; then it is shown once. */
function startsWithText(content: unknown, text: string | null | undefined): boolean {
  const start = (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  return Boolean(start) && lexicalToPlainText(content).replace(/\s+/g, ' ').startsWith(start)
}

function coverUrl(media: unknown): string | null {
  if (!isMedia(media)) return null
  const source = mediaSource(media, 'detail')
  return source ? absoluteUrl(source.src) : null
}

// ------------------------------------------------------------------------------------- article

export function articleSectionCrumbs(article: Pick<Article, 'section' | 'legacyUrl'>) {
  if (isGlossaryTerm(article)) {
    return [
      { name: 'Terrys Academy', href: LISTING_PATHS.academy },
      { name: 'Slovník pojmů', href: LISTING_PATHS.glossary },
    ]
  }
  return article.section === 'academy'
    ? [{ name: 'Terrys Academy', href: LISTING_PATHS.academy }]
    : [{ name: 'Magazín', href: LISTING_PATHS.magazine }]
}

export function ArticleView({ article }: { article: Article }) {
  const url = getPublicPath('articles', article)
  const products = populated<CardProduct & { id: number }>(article.relatedProducts as never)
  const publishedAt = realPublishDate(article)
  const date = formatDate(publishedAt)
  // Imported glossary terms repeat the perex as the first paragraph of the text.
  const showPerex = Boolean(article.perex) && !startsWithText(article.content, article.perex)
  const glossary = isGlossaryTerm(article)
  return (
    <article className="wrap pb-14">
      <Breadcrumbs items={[...articleSectionCrumbs(article), { name: article.title, href: url }]} />
      <div className="mx-auto max-w-3xl">
        <header className="pb-6">
          <p className="font-bold text-brand-red">
            {glossary
              ? 'Slovník pojmů'
              : article.section === 'academy'
                ? 'Terrys Academy'
                : 'Magazín'}
          </p>
          <h1 className="mt-1 text-[2rem] sm:text-[2.5rem]">{article.title}</h1>
          {date || publicText(article.authorName) ? (
            <p className="mt-3 text-sm text-muted">
              {[publicText(article.authorName), date].filter(Boolean).join(' · ')}
            </p>
          ) : null}
          {showPerex ? <p className="mt-4 text-lg text-ink">{article.perex}</p> : null}
        </header>
        {isMedia(article.coverImage) ? (
          <MediaImage
            media={article.coverImage}
            size="detail"
            sizes="(min-width: 48rem) 768px, 100vw"
            preload
            className="mb-8 h-auto w-full rounded-card"
          />
        ) : null}
        <div className="rounded-card bg-white px-5 py-7 sm:px-10 sm:py-10">
          <RichText data={article.content} />
        </div>
      </div>
      {products.length > 0 ? (
        <section className="pt-12" aria-labelledby="produkty-clanku">
          <h2 id="produkty-clanku" className="sec-title">
            Produkty k článku
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {products.slice(0, 8).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}
      <JsonLd
        data={articleJsonLd({
          headline: article.title,
          url: absoluteUrl(url),
          description: metaDescription(
            article.seo?.description,
            article.perex,
            lexicalToPlainText(article.content),
          ),
          image: coverUrl(article.seo?.image) ?? coverUrl(article.coverImage),
          datePublished: publishedAt,
          dateModified: article.updatedAt,
          authorName: publicText(article.authorName),
          siteName: SITE_NAME,
          logoUrl: absoluteUrl(LOGO_PATH),
        })}
      />
    </article>
  )
}

// ------------------------------------------------------------------------------------- recipe

const DIFFICULTY = { easy: 'Snadná', medium: 'Střední', hard: 'Náročná' }

export async function RecipeView({ recipe }: { recipe: Recipe }) {
  const settings = await getSettings()
  const url = getPublicPath('recipes', recipe)
  const products = populated<CardProduct & { id: number }>(recipe.relatedProducts as never).filter(
    (p) => p.availability !== 'hidden',
  )
  const ingredients = (recipe.ingredients ?? []).map((i) =>
    [publicText(i.amount), publicText(i.unit), i.name].filter(Boolean).join(' '),
  )
  const steps = (recipe.steps ?? []).filter((step) => publicText(step.text))
  const facts = [
    recipe.prepTimeMinutes ? { label: 'Příprava', value: `${recipe.prepTimeMinutes} min` } : null,
    recipe.cookTimeMinutes
      ? { label: 'Tepelná úprava', value: `${recipe.cookTimeMinutes} min` }
      : null,
    recipe.servings ? { label: 'Porce', value: String(recipe.servings) } : null,
    recipe.difficulty ? { label: 'Náročnost', value: DIFFICULTY[recipe.difficulty] } : null,
    publicText(recipe.coreTemperatureNote)
      ? { label: 'Teplota v jádru', value: publicText(recipe.coreTemperatureNote) as string }
      : null,
  ].filter((f): f is { label: string; value: string } => Boolean(f))

  return (
    <article className="wrap pb-14">
      <Breadcrumbs
        items={[
          { name: 'Recepty', href: LISTING_PATHS.recipes },
          { name: recipe.title, href: url },
        ]}
      />
      <div className="mx-auto max-w-4xl">
        <header className="pb-6">
          <p className="font-bold text-brand-red">Recept</p>
          <h1 className="mt-1 text-[2rem] sm:text-[2.5rem]">{recipe.title}</h1>
          {recipe.perex && !startsWithText(recipe.content, recipe.perex) ? (
            <p className="mt-4 text-lg">{recipe.perex}</p>
          ) : null}
        </header>
        {isMedia(recipe.coverImage) ? (
          <MediaImage
            media={recipe.coverImage}
            size="detail"
            sizes="(min-width: 56rem) 896px, 100vw"
            preload
            className="mb-6 h-auto w-full rounded-card"
          />
        ) : null}
        {facts.length > 0 ? (
          <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {facts.map((fact) => (
              <div key={fact.label} className="rounded-card bg-white px-4 py-3">
                <dt className="text-sm text-muted">{fact.label}</dt>
                <dd className="font-slab font-semibold text-brand-brown">{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="rounded-card bg-white px-5 py-7 sm:px-10 sm:py-10">
          {ingredients.length > 0 || steps.length > 0 ? (
            <div className="grid gap-8 md:grid-cols-[16rem_1fr]">
              {ingredients.length > 0 ? (
                <section aria-labelledby="suroviny">
                  <h2 id="suroviny" className="mb-3 text-xl">
                    Suroviny
                  </h2>
                  <ul className="space-y-1.5 border-l-4 border-brand-gold-dark pl-4">
                    {ingredients.map((ingredient, index) => (
                      <li key={`${ingredient}-${index}`}>{ingredient}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {steps.length > 0 ? (
                <section aria-labelledby="postup">
                  <h2 id="postup" className="mb-3 text-xl">
                    Postup
                  </h2>
                  <ol className="space-y-5">
                    {steps.map((step, index) => (
                      <li key={step.id ?? index} className="grid grid-cols-[2.25rem_1fr] gap-3">
                        <span
                          className="grid h-9 w-9 place-items-center rounded-full bg-brand-red font-bold text-white"
                          aria-hidden="true"
                        >
                          {index + 1}
                        </span>
                        <div>
                          <p className="whitespace-pre-line">{step.text}</p>
                          {isMedia(step.image) ? (
                            <MediaImage
                              media={step.image}
                              size="card"
                              sizes="(min-width: 48rem) 560px, 90vw"
                              className="mt-3 h-auto w-full max-w-md rounded-card"
                            />
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
            </div>
          ) : null}
          <div className={ingredients.length > 0 || steps.length > 0 ? 'mt-10' : ''}>
            <RichText data={recipe.content} />
          </div>
        </div>
      </div>

      {products.length > 0 ? (
        <section className="mx-auto max-w-4xl pt-12" aria-labelledby="pouzili-jsme">
          <h2 id="pouzili-jsme" className="sec-title">
            V tomto receptu jsme použili
          </h2>
          <ul className="space-y-5">
            {products.map((product) => {
              const productUrl = getPublicPath('products', product)
              const options = variantOptions(product)
              const thumb = isMedia(product.mainImage)
                ? mediaSource(product.mainImage, 'thumbnail')
                : null
              return (
                <li
                  key={product.id}
                  className="grid gap-4 rounded-card bg-white p-4 sm:grid-cols-[9rem_1fr] sm:p-5"
                >
                  <Link
                    href={productUrl}
                    className="relative block aspect-square w-28 overflow-hidden rounded-card bg-brand-beige-light sm:w-36"
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    <MediaImage
                      media={product.mainImage}
                      size="thumbnail"
                      sizes="144px"
                      alt=""
                      fill
                      className="object-cover"
                    />
                  </Link>
                  <div>
                    <h3 className="text-lg">
                      <Link href={productUrl} className="hover:underline">
                        {product.title}
                      </Link>
                    </h3>
                    <BuyBox
                      product={{
                        id: product.id,
                        title: product.title,
                        price: product.price,
                        priceUnit: product.priceUnit,
                        url: productUrl,
                        imageUrl: thumb?.src ?? null,
                      }}
                      options={options}
                      defaultIndex={defaultVariantIndex(options)}
                      mode={purchaseMode(product)}
                      weightPriced={isWeightPriced(product.priceUnit)}
                      priceNotice={settings.priceNotice}
                      soldOut={product.availability === 'sold-out'}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <JsonLd
        data={recipeJsonLd({
          name: recipe.title,
          url: absoluteUrl(url),
          description: metaDescription(
            recipe.seo?.description,
            recipe.perex,
            lexicalToPlainText(recipe.content),
          ),
          image: coverUrl(recipe.seo?.image) ?? coverUrl(recipe.coverImage),
          datePublished: realPublishDate(recipe),
          prepTimeMinutes: recipe.prepTimeMinutes,
          cookTimeMinutes: recipe.cookTimeMinutes,
          servings: recipe.servings,
          ingredients,
          steps: steps.map((step) => step.text),
          siteName: SITE_NAME,
        })}
      />
    </article>
  )
}

// ------------------------------------------------------------------------------------- page

export function LocationBox({ location, pageUrl }: { location: Location; pageUrl: string }) {
  const street = publicText(location.address?.street)
  const city = publicText(location.address?.city)
  const zip = publicText(location.address?.zip)
  const phone = publicText(location.phone)
  const email = publicText(location.email)
  const mapUrl = publicText(location.mapUrl)
  const parking = publicText(location.parkingNote)
  const note = publicText(location.openingHours?.note)
  const rows = weeklyRows(location.openingHours)
  return (
    <aside
      className="h-fit rounded-card bg-white p-5 sm:p-6"
      aria-labelledby={`misto-${location.id}`}
    >
      <h2 id={`misto-${location.id}`} className="text-xl">
        {location.name}
      </h2>
      <div className="mt-2">
        <OpenNow hours={location.openingHours} />
      </div>
      {street || city ? (
        <p className="mt-3">
          {street ? <span className="block">{street}</span> : null}
          {city || zip ? (
            <span className="block">{[zip, city].filter(Boolean).join(' ')}</span>
          ) : null}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <table className="mt-4 w-full text-[0.9375rem]">
          <caption className="mb-1 text-left font-slab font-semibold text-brand-brown">
            Otevírací doba
          </caption>
          <tbody>
            {rows.map((row) => (
              <tr key={row.day} className="border-b border-line last:border-0">
                <th scope="row" className="py-1 pr-4 text-left font-medium text-muted">
                  {row.label}
                </th>
                <td className="py-1 font-semibold">{row.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}
      {phone || email ? (
        <p className="mt-4 space-y-1">
          {phone ? (
            <a
              href={`tel:${phone.replace(/\s+/g, '')}`}
              className="block font-semibold text-brand-red hover:underline"
            >
              {phone}
            </a>
          ) : null}
          {email ? (
            <a
              href={`mailto:${email}`}
              className="block font-semibold text-brand-red hover:underline"
            >
              {email}
            </a>
          ) : null}
        </p>
      ) : null}
      {parking ? <p className="mt-4 text-sm">{parking}</p> : null}
      {mapUrl && /^https?:\/\//.test(mapUrl) ? (
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost mt-5 w-full"
        >
          Zobrazit na mapě
        </a>
      ) : null}
      <JsonLd
        data={localBusinessJsonLd({
          name: `${SITE_NAME} – ${location.name}`,
          url: absoluteUrl(pageUrl),
          image: coverUrl(location.image),
          telephone: phone,
          email,
          street,
          city,
          zip,
          mapUrl,
          openingHoursSpecification: openingHoursSpecification(location.openingHours),
        })}
      />
    </aside>
  )
}

export function PageView({ page, location }: { page: Page; location: Location | null }) {
  const url = getPublicPath('pages', page)
  const isStore = Boolean(location) || url.startsWith('/prodejny/')
  return (
    <div className="wrap pb-14">
      <Breadcrumbs
        items={[
          ...(isStore ? [{ name: 'Prodejny', href: LISTING_PATHS.stores }] : []),
          { name: page.title, href: url },
        ]}
      />
      <h1 className="pb-6 text-[2rem] sm:text-[2.5rem]">{page.title}</h1>
      <div className={location ? 'grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]' : 'max-w-3xl'}>
        <div className="min-w-0 rounded-card bg-white px-5 py-7 sm:px-10 sm:py-10">
          <RichText data={page.content} />
        </div>
        {location ? <LocationBox location={location} pageUrl={url} /> : null}
      </div>
    </div>
  )
}
