'use client'

import Image from 'next/image'
import Link from 'next/link'

import { type CartLine, getCartStore, MAX_QUANTITY } from '@/lib/cart/store'
import { formatCzk, formatUnitPrice } from '@/lib/format'
import { UNIT_LABEL, weightText } from '@/lib/orders/format'

import { lineTotal } from './hooks'

/** Cart lines with photo, variant, estimated weight and price, quantity and remove. */
export function CartLines({ lines, editable = true }: { lines: CartLine[]; editable?: boolean }) {
  const store = getCartStore()
  return (
    <ul className="divide-y divide-line" data-testid="cart-lines">
      {lines.map((line) => {
        const total = lineTotal(line)
        const weight =
          line.priceUnit === 'piece' ? null : weightText(line.weightGrams, line.quantity)
        return (
          <li
            key={`${line.productId}-${line.variantId}`}
            className="grid grid-cols-[4rem_1fr] gap-x-3 gap-y-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[5rem_1fr_auto] sm:items-center"
            data-testid="cart-line"
          >
            <div className="row-span-2 sm:row-span-1">
              {line.imageUrl ? (
                <Image
                  src={line.imageUrl}
                  alt=""
                  width={80}
                  height={80}
                  className="aspect-square w-16 rounded-card object-cover sm:w-20"
                />
              ) : (
                <div className="aspect-square w-16 rounded-card bg-brand-beige-light sm:w-20" />
              )}
            </div>
            <div className="min-w-0">
              <Link href={line.url} className="font-semibold leading-snug hover:underline">
                {line.title}
              </Link>
              <div className="text-sm text-muted">
                {[
                  line.variantLabel,
                  `${formatUnitPrice(line.unitPrice)} / ${UNIT_LABEL[line.priceUnit]}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {weight ? <div className="text-sm text-muted">Odhad hmotnosti: {weight}</div> : null}
            </div>
            <div className="col-start-2 flex items-center justify-between gap-3 sm:col-start-3 sm:flex-col sm:items-end">
              {editable ? (
                <div
                  className="flex items-center gap-1"
                  role="group"
                  aria-label={`Počet kusů: ${line.title}`}
                >
                  <button
                    type="button"
                    className="h-10 w-10 rounded-card border border-line bg-white text-lg font-bold hover:border-brand-brown"
                    aria-label={line.quantity === 1 ? `Odebrat ${line.title}` : 'Ubrat jeden kus'}
                    onClick={() =>
                      store.setQuantity(line.productId, line.variantId, line.quantity - 1)
                    }
                  >
                    −
                  </button>
                  <span
                    className="min-w-8 text-center font-bold"
                    aria-live="polite"
                    data-testid="line-quantity"
                  >
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    className="h-10 w-10 rounded-card border border-line bg-white text-lg font-bold hover:border-brand-brown disabled:opacity-40"
                    aria-label="Přidat jeden kus"
                    disabled={line.quantity >= MAX_QUANTITY}
                    onClick={() =>
                      store.setQuantity(line.productId, line.variantId, line.quantity + 1)
                    }
                  >
                    +
                  </button>
                </div>
              ) : (
                <span className="text-sm text-muted">{line.quantity}×</span>
              )}
              <div className="text-right">
                <div
                  className="font-slab text-lg font-bold text-brand-red"
                  data-testid="line-total"
                >
                  {total !== null
                    ? `${line.priceUnit === 'piece' ? '' : '≈ '}${formatCzk(total)}`
                    : '–'}
                </div>
                {editable ? (
                  <button
                    type="button"
                    className="text-sm text-muted underline hover:text-brand-red"
                    onClick={() => store.remove(line.productId, line.variantId)}
                  >
                    Odebrat<span className="sr-only"> {line.title}</span>
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
