/**
 * Client-side cart store (stage 3, used by the stage 4 cart and checkout).
 *
 * The cart lives in the browser's localStorage behind this small interface (no accounts, most
 * customers buy without registration). Everything stored here is a SNAPSHOT for display only:
 * the cart page re-validates it against the server (`POST /api/checkout/validate-cart`, then
 * `replace()`), and the order placement re-reads products and recomputes every price.
 *
 * React components use `useCartLines()` / `useCartCount()` from `useCart.ts`.
 */

import type { PriceUnit } from '../catalog'

export type CartLine = {
  productId: number
  /** Variant row id from Payload (`variants[].id`); null for fixed-price items without variants. */
  variantId: string | null
  quantity: number
  // Snapshot for display (stage 4 must re-validate on the server):
  title: string
  variantLabel: string | null
  /** Product price per `priceUnit` at the time of adding. */
  unitPrice: number
  priceUnit: PriceUnit
  weightGrams: number | null
  /** Estimated price of ONE piece of this line in whole CZK. */
  estimatedPrice: number | null
  /** Public URL of the product (for links from the cart). */
  url: string
  imageUrl: string | null
}

export type AddToCartInput = Omit<CartLine, 'quantity'> & { quantity?: number }

export interface CartStore {
  getLines(): CartLine[]
  /** Number of pieces in the cart (sum of quantities) – the header badge. */
  getCount(): number
  add(input: AddToCartInput): CartLine[]
  setQuantity(productId: number, variantId: string | null, quantity: number): CartLine[]
  remove(productId: number, variantId: string | null): CartLine[]
  /** Replaces all lines (stage 4: after the server re-validated the cart). */
  replace(lines: CartLine[]): CartLine[]
  clear(): void
  /** Re-reads the storage (another tab changed the cart) and notifies listeners. */
  refresh(): void
  /** Called after every change (also from another browser tab). Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
}

export const CART_STORAGE_KEY = 'terrys-cart-v1'
export const MAX_QUANTITY = 99

/** Minimal storage interface (window.localStorage in the browser, a Map in tests). */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function isCartLine(value: unknown): value is CartLine {
  const line = value as CartLine
  return (
    typeof line === 'object' &&
    line !== null &&
    typeof line.productId === 'number' &&
    (typeof line.variantId === 'string' || line.variantId === null) &&
    typeof line.quantity === 'number' &&
    line.quantity > 0 &&
    typeof line.title === 'string'
  )
}

const sameLine = (line: CartLine, productId: number, variantId: string | null) =>
  line.productId === productId && line.variantId === variantId

const clampQuantity = (quantity: number) =>
  Math.min(MAX_QUANTITY, Math.max(0, Math.floor(Number.isFinite(quantity) ? quantity : 0)))

/** Creates a cart store on top of a key-value storage. */
export function createCartStore(storage: KeyValueStorage | null): CartStore {
  const listeners = new Set<() => void>()
  // useSyncExternalStore needs a stable snapshot between changes.
  let cache: CartLine[] | null = null

  const read = (): CartLine[] => {
    if (cache) return cache
    try {
      const parsed: unknown = JSON.parse(storage?.getItem(CART_STORAGE_KEY) ?? '[]')
      cache = Array.isArray(parsed) ? parsed.filter(isCartLine) : []
    } catch {
      cache = []
    }
    return cache
  }

  const write = (lines: CartLine[]): CartLine[] => {
    cache = lines
    try {
      if (lines.length) storage?.setItem(CART_STORAGE_KEY, JSON.stringify(lines))
      else storage?.removeItem(CART_STORAGE_KEY)
    } catch {
      // Storage full or blocked (private mode): keep the cart in memory for this page.
    }
    listeners.forEach((listener) => listener())
    return lines
  }

  return {
    getLines: read,
    getCount: () => read().reduce((sum, line) => sum + line.quantity, 0),
    add(input) {
      const quantity = clampQuantity(input.quantity ?? 1) || 1
      const lines = read()
      const existing = lines.find((line) => sameLine(line, input.productId, input.variantId))
      if (existing) {
        return write(
          lines.map((line) =>
            line === existing
              ? { ...line, ...input, quantity: clampQuantity(line.quantity + quantity) }
              : line,
          ),
        )
      }
      return write([...lines, { ...input, quantity }])
    },
    setQuantity(productId, variantId, quantity) {
      const q = clampQuantity(quantity)
      const lines = read()
      return write(
        q === 0
          ? lines.filter((line) => !sameLine(line, productId, variantId))
          : lines.map((line) =>
              sameLine(line, productId, variantId) ? { ...line, quantity: q } : line,
            ),
      )
    },
    remove(productId, variantId) {
      return write(read().filter((line) => !sameLine(line, productId, variantId)))
    },
    replace(lines) {
      return write(lines.filter(isCartLine))
    },
    clear() {
      write([])
    },
    refresh() {
      cache = null
      listeners.forEach((listener) => listener())
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

let browserStore: CartStore | null = null

/** The cart of this browser (a no-storage store during server rendering). */
export function getCartStore(): CartStore {
  if (typeof window === 'undefined') return createCartStore(null)
  if (!browserStore) {
    let storage: KeyValueStorage | null = null
    try {
      storage = window.localStorage
    } catch {
      storage = null
    }
    const store = createCartStore(storage)
    // Keep several open tabs in sync.
    window.addEventListener('storage', (event) => {
      if (event.key === CART_STORAGE_KEY) store.refresh()
    })
    browserStore = store
  }
  return browserStore
}
