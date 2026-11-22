import Link from 'next/link'

import { ancestorsOf } from '@/lib/categoryTree'
import { formatCzk } from '@/lib/format'
import { productJsonLd } from '@/lib/jsonld'
import { productItem } from '@/lib/measurement/productItems'
import { publicText } from '@/lib/openingHours'
import {
  defaultVariantIndex,
  isWeightPriced,
  purchaseMode,
  variantOptions,
} from '@/lib/productView'
import { lexicalToPlainText, metaDescription } from '@/lib/text'
import { absoluteUrl, getPublicPath } from '@/lib/urls'
import { whatsappUrl } from '@/lib/whatsapp'
import type { Category, Product, Recipe } from '@/payload-types'
import {
  type CardProduct,
  getAllCategories,
  getCategoryProducts,
  getRecipesUsingProduct,
  getSettings,
  populated,
} from '@/storefront/data'
import { productAnalytics } from '@/storefront/analytics'

import { ViewItemEvent } from '../AnalyticsEvents'
import { Breadcrumbs, type Crumb } from '../Breadcrumbs'
import { BuyBox } from '../BuyBox'
import { VoucherBuyBox } from '../VoucherBuyBox'
import { formatIsoDay } from '@/lib/vouchers/balance'
import { isVoucherFormat, type VoucherFormat } from '@/lib/vouchers/constants'
import { getActiveVoucherExpiry, getVoucherProducts } from '@/storefront/data'
import { RecipeCard } from '../Cards'
import { Gallery, type GalleryImage } from '../Gallery'
import { JsonLd } from '../JsonLd'
import { isMedia, mediaSource } from '../MediaImage'
import { AvailabilityBadge, ProductCard } from '../ProductCard'
import { RichText } from '../RichText'

function term(
  value: unknown,
): { name: string; slug?: string | null; alternativeName?: string | null } | null {
  return typeof value === 'object' && value !== null && 'name' in value
    ? (value as { name: string; slug?: string | null; alternativeName?: string | null })
    : null
}

const FEEDING_LABELS = { grain: 'Dokrmováno obilím (grain fed)', grass: 'Na trávě (grass fed)' }

/** Gallery images: main image first, then the gallery (duplicates removed). */
function galleryImages(product: Product): GalleryImage[] {
  const seen = new Set<number>()
  const all = [product.mainImage, ...(product.gallery ?? [])]
  const images: GalleryImage[] = []
  for (const media of all) {
    if (!isMedia(media) || seen.has(media.id)) continue
    seen.add(media.id)
    const large = mediaSource(media, 'detail')
    const thumb = mediaSource(media, 'thumbnail')
    if (!large) continue
    images.push({ ...large, thumbSrc: thumb?.src ?? large.src, alt: media.alt || product.title })
  }
  return images
}

/** Breadcrumb trail through the first category of the product and its parents. */
async function productCrumbs(
  product: Product,
): Promise<{ crumbs: Crumb[]; primary: Category | null }> {
  const categories = populated<Category>(product.categories)
  const primary = categories[0] ?? null
  if (!primary) return { crumbs: [{ name: 'Produkty', href: '/produkty' }], primary: null }
  const all = await getAllCategories()
  const node = all.find((c) => c.id === primary.id)
  const chain = node ? [...ancestorsOf(all, node), node] : [primary]
  return {
    crumbs: chain.map((c) => ({ name: c.title, href: getPublicPath('categories', c) })),
    primary,
  }
}

export async function ProductView({ product }: { product: Product }) {
  const [settings, { crumbs, primary }] = await Promise.all([getSettings(), productCrumbs(product)])
  const url = getPublicPath('products', product)
  const options = variantOptions(product)
  const mode = purchaseMode(product)
  const weightPriced = isWeightPriced(product.priceUnit)
  const images = galleryImages(product)
  const cut = term(product.cut)
  const origin = term(product.origin)
  const meatType = term(product.meatType)
  const shelfLife = term(product.shelfLife)
  const productUsages = populated<{ id: number; name: string }>(product.usages as never)
  const deliveryPrice = settings.deliveryPrice ?? 229
  const priceNotice = settings.priceNotice
  const whatsapp = whatsappUrl(settings.contact?.whatsapp, `Dotaz k produktu: ${product.title}`)

  // Related products: chosen by the editor, otherwise other products from the same category.
  let related = populated<CardProduct & { id: number }>(product.relatedProducts as never).filter(
    (p) => p.id !== product.id && p.availability !== 'hidden',
  )
  if (related.length === 0 && primary) {
    related = (await getCategoryProducts(primary.id))
      .filter((p) => p.id !== product.id && p.availability !== 'sold-out')
      .slice(0, 4)
  }
  // Recipes: chosen on the product, otherwise recipes that list this product.
  let recipes = populated<Recipe>(product.relatedRecipes)
  if (recipes.length === 0) recipes = await getRecipesUsingProduct(product.id)

  const subtitle = [
    cut?.name && cut.alternativeName ? `${cut.name} / ${cut.alternativeName}` : cut?.name,
    origin?.name,
  ]
    .filter(Boolean)
    .join(' · ')

  const params: { label: string; value: string }[] = [
    origin ? { label: 'Původ', value: origin.name } : null,
    cut
      ? {
          label: 'Řez',
          value: cut.alternativeName ? `${cut.name} (${cut.alternativeName})` : cut.name,
        }
      : null,
    meatType ? { label: 'Druh masa', value: meatType.name } : null,
    product.marbling ? { label: 'Mramorování', value: product.marbling } : null,
    product.feeding ? { label: 'Krmení', value: FEEDING_LABELS[product.feeding] } : null,
    publicText(product.brand) ? { label: 'Producent', value: product.brand as string } : null,
    shelfLife ? { label: 'Trvanlivost', value: shelfLife.name } : null,
  ].filter((p): p is { label: string; value: string } => Boolean(p))

  // Stage 7: gift voucher product → own buy box (value chips, electronic / printed, validity).
  let voucher: {
    formats: VoucherFormat[]
    values: { id: number; value: number; url: string; current: boolean }[]
    validUntil: string | null
  } | null = null
  if (product.voucher?.enabled) {
    const [siblings, expiry] = await Promise.all([getVoucherProducts(), getActiveVoucherExpiry()])
    voucher = {
      formats: (product.voucher.formats ?? []).filter(isVoucherFormat),
      values: siblings.map((s) => ({ ...s, current: s.id === product.id })),
      validUntil: expiry ? formatIsoDay(expiry) : null,
    }
  }

  const firstImage = images[0]
  const analytics = await productAnalytics(product)
  const cartInfo = {
    id: product.id,
    title: product.title,
    price: product.price,
    priceUnit: product.priceUnit,
    url,
    imageUrl: firstImage?.thumbSrc ?? null,
    analytics,
  }
  const description = metaDescription(
    product.seo?.description,
    lexicalToPlainText(product.shortDescription),
    lexicalToPlainText(product.description),
  )

  return (
    <div className="wrap pb-12">
      <Breadcrumbs items={[...crumbs, { name: product.title, href: url }]} />

      <div className="grid gap-8 pb-10 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
        <div>
          <Gallery images={images} />
          {productUsages.length > 0 ? (
            <div className="mt-5">
              <h2 className="sr-only">Hodí se na</h2>
              <ul className="flex flex-wrap gap-2" aria-label="Hodí se na">
                {productUsages.map((usage) => (
                  <li
                    key={usage.id}
                    className="rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-brand-brown"
                  >
                    {usage.name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="rounded-card bg-white p-5 sm:p-7">
          <h1 className="text-[1.75rem] sm:text-[2.125rem]">{product.title}</h1>
          {subtitle ? <p className="mt-1 text-muted">{subtitle}</p> : null}
          <RichText data={product.shortDescription} className="prose-terrys mt-4 text-base" />

          <dl className="my-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 border-y border-line py-4 text-[0.9375rem]">
            {params.map((param) => (
              <div key={param.label} className="contents">
                <dt className="text-muted">{param.label}</dt>
                <dd className="font-bold">{param.value}</dd>
              </div>
            ))}
            <dt className="text-muted">Dostupnost</dt>
            <dd data-testid="availability">
              <AvailabilityBadge availability={product.availability} />
            </dd>
            <dt className="text-muted">Cena</dt>
            <dd className="font-bold">
              {formatCzk(product.price)} /{' '}
              {product.priceUnit === 'kg' ? 'kg' : product.priceUnit === '100g' ? '100 g' : 'ks'}
            </dd>
          </dl>

          {voucher ? (
            <VoucherBuyBox
              product={cartInfo}
              formats={voucher.formats}
              values={voucher.values}
              validUntil={voucher.validUntil}
              deliveryPrice={deliveryPrice}
              dueHours={settings.vouchers?.paymentDueHours ?? 72}
              soldOut={product.availability === 'sold-out'}
            />
          ) : (
            <BuyBox
              product={cartInfo}
              options={options}
              defaultIndex={defaultVariantIndex(options)}
              mode={mode}
              weightPriced={weightPriced}
              priceNotice={priceNotice}
              soldOut={product.availability === 'sold-out'}
            />
          )}
          {product.availability === 'sold-out' ? (
            <p className="mt-3 text-sm font-semibold text-brand-brown">
              Produkt je momentálně vyprodaný. Podívejte se na podobné kusy níže.
            </p>
          ) : null}
          {voucher ? null : (
            <p className="mt-3 text-sm text-muted">
              Chlazený rozvoz za {formatCzk(deliveryPrice)} bez ohledu na hodnotu objednávky, nebo
              osobní odběr. Platíte až při převzetí.
            </p>
          )}
        </div>
      </div>

      <section className="rounded-card bg-white px-5 py-6 sm:px-8 sm:py-8" aria-labelledby="popis">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 max-w-[75ch]">
            <h2 id="popis" className="mb-3 text-[1.375rem]">
              Popis
            </h2>
            <RichText data={product.description} />
            {!product.description ? (
              <p className="text-muted">Popis produktu připravujeme.</p>
            ) : null}
          </div>
          <aside
            className="h-fit rounded-card bg-brand-beige-light p-5 text-[0.9375rem]"
            aria-labelledby="doprava"
          >
            <h2 id="doprava" className="mb-2 text-lg">
              {voucher ? 'Jak poukaz funguje' : 'Doprava a platba'}
            </h2>
            {voucher ? (
              <ul className="space-y-2" data-testid="voucher-how">
                <li>
                  Poukaz je platidlo: obdarovaný zadá kód při objednávce na terrys.cz nebo ho ukáže
                  v prodejně a hodnotu odečteme z ceny nákupu.
                </li>
                <li>Lze ho čerpat postupně ve více nákupech až do data platnosti.</li>
                {voucher.validUntil ? <li>Platí do {voucher.validUntil}.</li> : null}
                <li>
                  Elektronický: PDF e-mailem hned, platba převodem. Tištěný: s objednávkou masa nebo
                  k vyzvednutí, platba při převzetí.
                </li>
                <li>
                  Nakupujete pro firmu? V objednávce vyplňte IČO a DIČ – můžete koupit více kusů.
                </li>
              </ul>
            ) : (
              <ul className="space-y-2">
                <li>
                  Chlazený rozvoz: {formatCzk(deliveryPrice)}, bez ohledu na hodnotu objednávky.
                </li>
                <li>Osobní odběr na prodejně nebo výdejním místě zdarma.</li>
                <li>Platíte až při převzetí, žádné placení předem přes internet.</li>
                {weightPriced ? (
                  <li>Každý kus zvážíme. Výsledná cena se řídí skutečnou hmotností.</li>
                ) : null}
              </ul>
            )}
            {whatsapp ? (
              <p className="mt-3">
                Dotaz k masu?{' '}
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-brand-red underline"
                >
                  Napište řezníkům na WhatsApp
                </a>
              </p>
            ) : null}
          </aside>
        </div>
      </section>

      {related.length > 0 ? (
        <section className="pt-12" aria-labelledby="souvisejici">
          <h2 id="souvisejici" className="sec-title">
            Hodí se k tomu
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {related.slice(0, 4).map((item) => (
              <ProductCard
                key={item.id}
                product={item}
                imageSizes="(min-width: 64rem) 280px, (min-width: 40rem) 45vw, 100vw"
              />
            ))}
          </div>
        </section>
      ) : null}

      {recipes.length > 0 ? (
        <section className="pt-12" aria-labelledby="recepty">
          <h2 id="recepty" className="sec-title">
            Co z tohoto masa uvařit
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {recipes.slice(0, 3).map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
          <p className="mt-6 text-center">
            <Link href="/recepty" className="font-semibold text-brand-red hover:underline">
              Všechny recepty
            </Link>
          </p>
        </section>
      ) : null}

      <JsonLd
        data={productJsonLd({
          name: product.title,
          url: absoluteUrl(url),
          description,
          images: images.map((image) => absoluteUrl(image.src)),
          sku: product.sku,
          brand: publicText(product.brand),
          category: primary?.title,
          productId: product.id,
          price: product.price,
          priceUnit: product.priceUnit,
          availability: product.availability,
          options,
          deliveryPrice,
          priceNotice,
        })}
      />
      <ViewItemEvent item={productItem(product, analytics.categories)} />
    </div>
  )
}
