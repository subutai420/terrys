import Link from 'next/link'

import { lineForSingle, lineForVariant } from '@/lib/cart/line'
import { formatCzk } from '@/lib/format'
import {
  availabilityLabel,
  defaultVariantIndex,
  PRICE_UNIT_SHORT,
  purchaseMode,
  variantOptions,
} from '@/lib/productView'
import { getPublicPath } from '@/lib/urls'
import type { CardProduct } from '@/storefront/data'

import { AddToCartButton } from './AddToCartButton'
import { isMedia, MediaImage, mediaSource } from './MediaImage'

function termName(value: unknown): string | null {
  return typeof value === 'object' && value !== null && 'name' in value
    ? String((value as { name: string }).name)
    : null
}

export function AvailabilityBadge({ availability }: { availability: CardProduct['availability'] }) {
  const color =
    availability === 'in-stock'
      ? 'text-ok'
      : availability === 'in-transit'
        ? 'text-transit'
        : 'text-muted'
  return <span className={`text-sm font-bold ${color}`}>{availabilityLabel(availability)}</span>
}

/** Product card for grids (category, search, related products), design A. */
export function ProductCard({
  product,
  imageSizes = '(min-width: 64rem) 300px, (min-width: 40rem) 45vw, 100vw',
  showButton = true,
}: {
  product: CardProduct
  imageSizes?: string
  showButton?: boolean
}) {
  const url = getPublicPath('products', product)
  const options = variantOptions(product)
  const mode = purchaseMode(product)
  const image = isMedia(product.mainImage) ? product.mainImage : null
  const info = {
    id: product.id,
    title: product.title,
    price: product.price,
    priceUnit: product.priceUnit,
    url,
    imageUrl: image ? (mediaSource(image, 'thumbnail')?.src ?? null) : null,
  }
  const defaultOption = options[defaultVariantIndex(options)]
  const line =
    mode === 'variants' && defaultOption
      ? lineForVariant(info, defaultOption)
      : mode === 'single'
        ? lineForSingle(info)
        : null
  const meta = [termName(product.cut), termName(product.origin)].filter(Boolean).join(', ')

  return (
    <article className="flex flex-col overflow-hidden rounded-card bg-white">
      <Link
        href={url}
        className="relative block aspect-[3/2] bg-brand-beige-light"
        tabIndex={-1}
        aria-hidden="true"
      >
        {image ? (
          <MediaImage
            media={image}
            size="card"
            sizes={imageSizes}
            alt=""
            fill
            className="object-cover"
          />
        ) : null}
        {product.marbling ? (
          <span className="absolute top-2.5 left-2.5 rounded bg-brand-gold-light px-2 py-0.5 text-[0.8125rem] font-bold text-brand-brown">
            {product.marbling}
          </span>
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col gap-1 px-4 pt-3.5 pb-4">
        <h3 className="text-lg font-semibold">
          <Link href={url} className="hover:underline">
            {product.title}
          </Link>
        </h3>
        {meta ? <span className="text-sm text-muted">{meta}</span> : null}
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <span className="font-slab text-2xl font-bold text-brand-red">
            {formatCzk(product.price)}{' '}
            <small className="font-sans text-sm font-semibold text-muted">
              / {PRICE_UNIT_SHORT[product.priceUnit]}
            </small>
          </span>
          <AvailabilityBadge availability={product.availability} />
        </div>
        {showButton && line ? (
          <AddToCartButton
            line={line}
            className="mt-3 w-full px-3 py-2.5"
            label={line.variantLabel ? `Do košíku · ${line.variantLabel}` : 'Do košíku'}
          />
        ) : null}
        {showButton && !line ? (
          <Link href={url} className="btn btn-ghost mt-3 w-full px-3 py-2.5">
            Zobrazit detail
          </Link>
        ) : null}
      </div>
    </article>
  )
}
