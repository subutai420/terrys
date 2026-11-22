'use client'

import { useSyncExternalStore } from 'react'

import { type CartLine, getCartStore } from './store'

const EMPTY: CartLine[] = []

/** Current cart lines in a client component; re-renders after every change. */
export function useCartLines(): CartLine[] {
  const store = getCartStore()
  return useSyncExternalStore(store.subscribe, store.getLines, () => EMPTY)
}

/** Number of pieces in the cart (0 during server rendering, then the real count). */
export function useCartCount(): number {
  const store = getCartStore()
  return useSyncExternalStore(store.subscribe, store.getCount, () => 0)
}
