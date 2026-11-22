import type { ReactNode } from 'react'

import type { CheckoutItem } from '@/lib/analytics'
import type { CartLine } from '@/lib/cart/store'

import type { CartNotice } from './hooks'

/** Small shared pieces of the cart and checkout pages. */

export function StepHeading({
  id,
  number,
  children,
}: {
  id: string
  number: number
  children: ReactNode
}) {
  return (
    <h2 id={id} className="mb-4 flex items-center gap-3 text-xl">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-red font-sans text-base font-bold text-white"
      >
        {number}
      </span>
      {children}
    </h2>
  )
}

/** What changed in the cart since the customer added it (re-validation result). */
export function Notices({ notices }: { notices: CartNotice[] }) {
  if (notices.length === 0) return null
  return (
    <div
      className="rounded-card border-l-4 border-brand-gold-dark bg-white p-4"
      role="status"
      data-testid="cart-notices"
    >
      <p className="font-semibold">Košík jsme upravili podle aktuální nabídky:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {notices.map((notice) => (
          <li key={notice.message} className={notice.kind === 'problem' ? 'text-brand-red' : ''}>
            {notice.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Cart lines in the shape of the analytics hooks (estimated price per piece). */
export function checkoutItems(lines: CartLine[]): CheckoutItem[] {
  return lines.map((line) => ({
    item_id: String(line.productId),
    item_name: line.title,
    item_variant: line.variantLabel ?? undefined,
    price: line.estimatedPrice ?? undefined,
    quantity: line.quantity,
    estimated_weight_grams: line.priceUnit === 'piece' ? null : line.weightGrams,
  }))
}
