import config from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload, type Payload } from 'payload'

import {
  DEFAULT_GOOGLE_PRODUCT_CATEGORY,
  DEFAULT_HEUREKA_CATEGORY,
  DEFAULT_ZBOZI_CATEGORY,
} from '@/globals/Marketing'
import type { FeedChannel } from '@/lib/feeds/channels'
import { courierDeliveryId } from '@/lib/feeds/delivery'
import { buildFeedItems, type ExcludedProduct, type FeedProductInput } from '@/lib/feeds/items'
import {
  countRendered,
  type FeedContext,
  renderGoogleFeed,
  renderHeurekaFeed,
  renderMetaFeed,
  renderZboziFeed,
} from '@/lib/feeds/render'
import { type CategoryNode, categoryIdChain, categoryPath } from '@/lib/measurement/items'
import { SITE_NAME } from '@/lib/site'
import { lexicalToPlainText } from '@/lib/text'
import { getSiteUrl } from '@/lib/urls'
import type { Category, Media, Product } from '@/payload-types'
import { STOREFRONT_TAG } from '@/storefront/revalidate'

/**
 * Stage 6: product feed generation (Payload glue; the pure parts are in `src/lib/feeds`).
 *
 * Data: products with the PUBLIC access rules (published, not hidden – exactly what a visitor
 * sees), categories with their feed mapping, settings (delivery price), the Marketing global
 * (defaults) and the active shipping methods (courier carrier, pickup).
 *
 * Caching: `unstable_cache` with the storefront tag – every product/category/settings change in
 * the admin regenerates the feed on the next request; otherwise at most once an hour. The route
 * handlers add CDN headers (`s-maxage=3600`). Each real generation stores its time, item count and
 * duration in Marketing → `feedStats` (shown in the admin).
 */

type Loaded = { products: FeedProductInput[]; ctx: FeedContext }

function mediaUrl(media: unknown): string | null {
  if (!media || typeof media !== 'object') return null
  const m = media as Media
  // The original upload (JPEG/PNG from the old site, ~800 px) – accepted by every channel
  // (Meta does not take WebP); fall back to the 1600 px WebP size otherwise.
  const isJpegOrPng =
    /^image\/(jpeg|png)$/.test(m.mimeType ?? '') ||
    /\.(jpe?g|png)$/i.test(m.filename ?? m.url ?? '')
  const original = m.url && isJpegOrPng ? m.url : null
  const url = original ?? m.sizes?.detail?.url ?? m.url
  if (!url) return null
  const local = url.match(/^https?:\/\/[^/]+(\/api\/media\/file\/.*)$/i)
  return local ? local[1] : url
}

function firstNonEmpty(values: (string | null | undefined)[]): string | null {
  for (const value of values) if (value && value.trim()) return value.trim()
  return null
}

async function load(payload: Payload, now: Date): Promise<Loaded> {
  const [productResult, categoryResult, settings, marketing, methods] = await Promise.all([
    payload.find({
      collection: 'products',
      depth: 1,
      limit: 5000,
      pagination: false,
      draft: false,
      overrideAccess: false,
      sort: 'id',
      select: {
        title: true,
        slug: true,
        legacyUrl: true,
        price: true,
        priceUnit: true,
        availability: true,
        variants: true,
        brand: true,
        shortDescription: true,
        description: true,
        mainImage: true,
        gallery: true,
        categories: true,
        feeds: true,
        voucher: true,
      },
      populate: {
        media: { url: true, filename: true, mimeType: true, sizes: true },
        categories: { title: true },
      },
    }),
    payload.find({
      collection: 'categories',
      depth: 0,
      limit: 1000,
      pagination: false,
      overrideAccess: false,
      select: { title: true, parent: true, feeds: true },
    }),
    payload.findGlobal({ slug: 'settings', depth: 0, overrideAccess: false }),
    payload.findGlobal({ slug: 'marketing', depth: 0, overrideAccess: true }),
    payload.find({
      collection: 'shipping-methods',
      depth: 0,
      limit: 50,
      pagination: false,
      overrideAccess: true,
      where: { active: { equals: true } },
      select: { type: true, balikobot: true },
    }),
  ])

  const categories = categoryResult.docs as Category[]
  const nodes: CategoryNode[] = categories.map((c) => ({
    id: c.id,
    title: c.title,
    parent: typeof c.parent === 'object' && c.parent ? c.parent.id : (c.parent ?? null),
  }))
  const byId = new Map(categories.map((c) => [c.id, c]))
  const defaults = marketing.feedDefaults ?? {}

  const products: FeedProductInput[] = (productResult.docs as Product[]).map((doc) => {
    const chain = categoryIdChain(doc.categories, nodes).map((id) => byId.get(id))
    const pick = (key: 'googleProductCategory' | 'heurekaCategory' | 'zboziCategory') =>
      firstNonEmpty(chain.map((c) => c?.feeds?.[key]))
    const images = [doc.mainImage, ...(doc.gallery ?? [])]
      .map(mediaUrl)
      .filter((url, i, all): url is string => Boolean(url) && all.indexOf(url) === i)
    const description = [
      lexicalToPlainText(doc.shortDescription),
      lexicalToPlainText(doc.description),
    ]
      .filter(Boolean)
      .join('\n')
      .replace(/\s+/g, ' ')
      .trim()
    return {
      id: doc.id,
      title: doc.title,
      slug: doc.slug,
      legacyUrl: doc.legacyUrl,
      price: doc.price,
      priceUnit: doc.priceUnit,
      availability: doc.availability,
      variants: doc.variants ?? [],
      brand: doc.brand,
      description,
      images,
      categoryPath: categoryPath(doc.categories, nodes),
      categories: {
        google:
          pick('googleProductCategory') ??
          (defaults.googleProductCategory || DEFAULT_GOOGLE_PRODUCT_CATEGORY),
        heureka: pick('heurekaCategory') ?? (defaults.heurekaCategory || DEFAULT_HEUREKA_CATEGORY),
        zbozi: pick('zboziCategory') ?? (defaults.zboziCategory || DEFAULT_ZBOZI_CATEGORY),
      },
      excluded: Boolean(doc.feeds?.exclude),
      categoryExcluded: chain.some((c) => c?.feeds?.exclude),
      ...(doc.voucher?.enabled
        ? {
            // Stage 7: vouchers get their own categories (Google 53 = Dárkové certifikáty).
            categories: {
              google: '53',
              heureka: marketing.vouchers?.heurekaCategory || null,
              zbozi: marketing.vouchers?.zboziCategory || null,
            },
            voucher: {
              included: Boolean(marketing.vouchers?.includeInFeeds),
              formats: doc.voucher.formats ?? [],
            },
          }
        : {}),
    }
  })

  const courier = methods.docs.find((m) => m.type === 'courier')
  const ctx: FeedContext = {
    siteUrl: getSiteUrl(),
    shopName: SITE_NAME,
    deliveryPrice: Math.max(1, settings.deliveryPrice ?? 229),
    courierDeliveryId: courierDeliveryId(courier?.balikobot?.carrierCode),
    pickup: methods.docs.some((m) => m.type === 'pickup'),
    inStockDeliveryDays: defaults.inStockDeliveryDays ?? 0,
    inTransitDeliveryDays: defaults.inTransitDeliveryDays ?? 7,
    now,
  }
  return { products, ctx }
}

export type FeedResult = {
  xml: string
  items: number
  products: number
  excluded: ExcludedProduct[]
  generatedAt: string
  ms: number
}

const RENDERERS: Record<FeedChannel, typeof renderGoogleFeed> = {
  google: renderGoogleFeed,
  meta: renderMetaFeed,
  heureka: renderHeurekaFeed,
  zbozi: renderZboziFeed,
}

/** Generates one feed now (no cache). Used by the cached route and by tests. */
export async function generateFeed(
  payload: Payload,
  channel: FeedChannel,
  now = new Date(),
): Promise<FeedResult> {
  const started = Date.now()
  const { products, ctx } = await load(payload, now)
  const { items, excluded } = buildFeedItems(products, ctx.siteUrl)
  const xml = RENDERERS[channel](items, ctx)
  const count = countRendered(xml, channel === 'google' || channel === 'meta' ? 'item' : 'SHOPITEM')
  return {
    xml,
    items: count,
    // Heureka and Zboží leave sold-out variants out.
    products: new Set(
      items
        .filter(
          (item) => channel === 'google' || channel === 'meta' || item.availability !== 'sold-out',
        )
        .map((item) => item.productId),
    ).size,
    excluded,
    generatedAt: now.toISOString(),
    ms: Date.now() - started,
  }
}

async function recordStats(payload: Payload, channel: FeedChannel, result: FeedResult) {
  try {
    const marketing = await payload.findGlobal({
      slug: 'marketing',
      depth: 0,
      overrideAccess: true,
    })
    const stats = { ...((marketing.feedStats as Record<string, unknown> | null) ?? {}) }
    stats[channel] = {
      generatedAt: result.generatedAt,
      items: result.items,
      products: result.products,
      excluded: result.excluded.length,
      ms: result.ms,
    }
    await payload.updateGlobal({
      slug: 'marketing',
      data: { feedStats: stats },
      overrideAccess: true,
      depth: 0,
      context: { disableRevalidate: true },
    })
  } catch (error) {
    payload.logger.warn(`[feeds] could not store stats: ${String(error)}`)
  }
}

/** The feed as served by `/feeds/<channel>.xml` (cached under the storefront tag). */
export function cachedFeed(channel: FeedChannel): Promise<FeedResult> {
  const version = process.env.STOREFRONT_CACHE_VERSION ?? 'dev'
  return unstable_cache(
    async () => {
      const payload = await getPayload({ config })
      const result = await generateFeed(payload, channel)
      await recordStats(payload, channel, result)
      return result
    },
    ['feeds', version, channel],
    { tags: [STOREFRONT_TAG], revalidate: 3600 },
  )()
}
