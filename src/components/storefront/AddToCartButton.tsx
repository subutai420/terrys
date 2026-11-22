'use client'

import { useEffect, useRef, useState } from 'react'

import { trackAddToCart } from '@/lib/analytics'
import { type AddToCartInput, getCartStore } from '@/lib/cart/store'

type Props = {
  line: AddToCartInput | null
  label?: string
  className?: string
  /** Shown instead of the button when nothing can be bought (sold out…). */
  disabledLabel?: string
}

/**
 * "Do košíku" button. Stores the line in the browser cart (`src/lib/cart/store.ts`), confirms
 * visually for a moment and announces it to screen readers. Stage 4 replaces the store behind it.
 */
export function AddToCartButton({
  line,
  label = 'Do košíku',
  className = '',
  disabledLabel,
}: Props) {
  const [added, setAdded] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  if (!line) {
    return (
      <button type="button" className={`btn ${className}`} disabled>
        {disabledLabel ?? 'Nelze objednat'}
      </button>
    )
  }

  const onClick = () => {
    getCartStore().add(line)
    trackAddToCart({
      item_id: String(line.productId),
      item_name: line.title,
      item_variant: line.variantLabel ?? undefined,
      price: line.estimatedPrice ?? undefined,
      quantity: line.quantity ?? 1,
    })
    setAdded(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setAdded(false), 1800)
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={`btn ${added ? 'bg-ok! hover:bg-ok!' : ''} ${className}`}
        data-testid="add-to-cart"
      >
        {added ? 'Přidáno do košíku' : label}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {added
          ? `${line.title}${line.variantLabel ? `, ${line.variantLabel}` : ''} přidáno do košíku`
          : ''}
      </span>
    </>
  )
}
