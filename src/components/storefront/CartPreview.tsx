'use client'

import Link from 'next/link'

import { getCartStore } from '@/lib/cart/store'
import { useCartLines } from '@/lib/cart/useCart'
import { formatCzk } from '@/lib/format'

/** Read-only view of the browser cart with quantity controls (stage 4 builds the checkout). */
export function CartPreview({
  priceNotice,
  deliveryPrice,
}: {
  priceNotice: string
  deliveryPrice: number
}) {
  const lines = useCartLines()
  const store = getCartStore()
  if (lines.length === 0) {
    return (
      <div className="rounded-card bg-white p-8 text-center">
        <p className="font-semibold">Košík je zatím prázdný.</p>
        <Link href="/produkty" className="btn mt-5">
          Vybrat maso
        </Link>
      </div>
    )
  }
  const total = lines.reduce((sum, line) => sum + (line.estimatedPrice ?? 0) * line.quantity, 0)
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <ul className="divide-y divide-line rounded-card bg-white">
        {lines.map((line) => (
          <li
            key={`${line.productId}-${line.variantId}`}
            className="flex flex-wrap items-center gap-4 p-4"
          >
            <div className="min-w-0 flex-1">
              <Link href={line.url} className="font-semibold hover:underline">
                {line.title}
              </Link>
              {line.variantLabel ? (
                <div className="text-sm text-muted">{line.variantLabel}</div>
              ) : null}
            </div>
            <div
              className="flex items-center gap-2"
              role="group"
              aria-label={`Počet: ${line.title}`}
            >
              <button
                type="button"
                className="h-9 w-9 rounded-card border border-line font-bold"
                aria-label="Ubrat jeden kus"
                onClick={() => store.setQuantity(line.productId, line.variantId, line.quantity - 1)}
              >
                −
              </button>
              <span className="min-w-6 text-center font-bold" aria-live="polite">
                {line.quantity}
              </span>
              <button
                type="button"
                className="h-9 w-9 rounded-card border border-line font-bold"
                aria-label="Přidat jeden kus"
                onClick={() => store.setQuantity(line.productId, line.variantId, line.quantity + 1)}
              >
                +
              </button>
            </div>
            <div className="w-24 text-right font-slab font-bold text-brand-red">
              {line.estimatedPrice !== null
                ? `≈ ${formatCzk(line.estimatedPrice * line.quantity)}`
                : ''}
            </div>
          </li>
        ))}
      </ul>
      <aside className="h-fit rounded-card bg-white p-5">
        <p className="flex justify-between font-semibold">
          <span>Odhad za zboží</span>
          <span>≈ {formatCzk(total)}</span>
        </p>
        <p className="mt-2 flex justify-between text-sm text-muted">
          <span>Chlazený rozvoz</span>
          <span>{formatCzk(deliveryPrice)}</span>
        </p>
        <p className="mt-4 text-sm text-muted">{priceNotice}</p>
        <p className="mt-4 rounded bg-brand-beige-light p-3 text-sm">
          Dokončení objednávky přes e-shop připravujeme.
        </p>
      </aside>
    </div>
  )
}
