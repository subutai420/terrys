'use client'

import { useCartCount } from '@/lib/cart/useCart'

/** Number badge on the cart icon in the header (from the browser cart, stage 4 will extend). */
export function CartCount() {
  const count = useCartCount()
  return (
    <>
      <span
        data-testid="cart-count"
        aria-hidden="true"
        className="inline-grid h-6 min-w-6 place-items-center rounded-full bg-brand-gold-light px-1.5 text-[0.8125rem] font-bold text-brand-brown"
      >
        {count}
      </span>
      <span className="sr-only">
        {count === 0
          ? 'Košík je prázdný'
          : `V košíku: ${count} ${count === 1 ? 'položka' : count < 5 ? 'položky' : 'položek'}`}
      </span>
    </>
  )
}
