'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import type { PublicDeliveryOptions } from '@/delivery/options'
import type { CartLine } from '@/lib/cart/store'
import { getCartStore } from '@/lib/cart/store'
import { useCartLines } from '@/lib/cart/useCart'
import type { CartCheckResult, ResolvedLine } from '@/lib/orders/cartCheck'
import { lineEstimate } from '@/lib/orders/money'

/** True after hydration (avoids flashing the empty cart before localStorage is read). */
const noopSubscribe = () => () => {}
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
}

/** Cart store line → the line shape shown in the cart, estimate computed with the shared maths. */
export function lineTotal(line: CartLine): number | null {
  return lineEstimate({
    unitPrice: line.unitPrice,
    priceUnit: line.priceUnit,
    weightGrams: line.priceUnit === 'piece' ? null : line.weightGrams,
    quantity: line.quantity,
  })
}

export function resolvedToCartLine(line: ResolvedLine): CartLine {
  return {
    productId: line.productId,
    variantId: line.variantId,
    quantity: line.quantity,
    title: line.title,
    variantLabel: line.variantLabel,
    unitPrice: line.unitPrice,
    priceUnit: line.priceUnit,
    weightGrams: line.weightGrams,
    estimatedPrice: line.estimatedPrice,
    url: line.url,
    imageUrl: line.imageUrl,
  }
}

export type CartNotice = { kind: 'problem' | 'change'; message: string }

/** Applies a server check result to the browser cart; returns the notices to show. */
export function applyCartCheck(result: CartCheckResult): CartNotice[] {
  getCartStore().replace(result.lines.map(resolvedToCartLine))
  return [
    ...result.problems.map((p) => ({ kind: 'problem' as const, message: p.message })),
    ...result.changes.map((c) => ({ kind: 'change' as const, message: c.message })),
  ]
}

/**
 * The browser cart, re-validated against the server once when the page opens (product gone,
 * sold out, price or variant changed → the cart is corrected and the customer told why).
 */
export function useValidatedCart() {
  const lines = useCartLines()
  const hydrated = useHydrated()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [notices, setNotices] = useState<CartNotice[]>([])
  const started = useRef(false)

  const validate = useCallback(async () => {
    const current = getCartStore().getLines()
    if (current.length === 0) {
      setStatus('ready')
      return
    }
    try {
      const response = await fetch('/api/checkout/validate-cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: current.map((line) => ({
            productId: line.productId,
            variantId: line.variantId,
            quantity: line.quantity,
            snapshot: {
              title: line.title,
              variantLabel: line.variantLabel,
              unitPrice: line.unitPrice,
              weightGrams: line.weightGrams,
            },
          })),
        }),
      })
      if (!response.ok) throw new Error(String(response.status))
      const result = (await response.json()) as CartCheckResult
      setNotices(applyCartCheck(result))
      setStatus('ready')
    } catch {
      // The cart still works; the server checks everything again when the order is sent.
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    if (!hydrated || started.current) return
    started.current = true
    void validate()
  }, [hydrated, validate])

  return { lines, hydrated, status, notices, setNotices, revalidate: validate }
}

export type DeliveryState =
  | { status: 'idle' }
  | { status: 'loading'; postcode: string }
  | { status: 'ok'; postcode: string; data: PublicDeliveryOptions }
  | { status: 'error'; postcode: string; message: string }

const ERROR_MESSAGE =
  'Nepodařilo se načíst možnosti dopravy. Zkontrolujte připojení a zkuste to znovu.'

/**
 * Delivery options for a postcode from the stage 2 endpoint (`GET /api/delivery/options`).
 * The answer is stored together with the request key; anything else is "loading" (derived
 * during render, no state updates inside the effect body).
 */
export function useDeliveryOptions(postcode: string) {
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState<{ key: string; state: DeliveryState } | null>(null)
  const code = postcode.replace(/\s/g, '')
  const valid = /^[1-7]\d{4}$/.test(code)
  const key = valid ? `${code}:${reloadKey}` : ''

  useEffect(() => {
    if (!key) return
    const [psc] = key.split(':')
    const controller = new AbortController()
    fetch(`/api/delivery/options?psc=${psc}${reloadKey ? `&r=${reloadKey}` : ''}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const body = await response.json()
        setResult({
          key,
          state: response.ok
            ? { status: 'ok', postcode: psc, data: body as PublicDeliveryOptions }
            : { status: 'error', postcode: psc, message: body.message ?? 'Neplatné PSČ.' },
        })
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name === 'AbortError') return
        setResult({ key, state: { status: 'error', postcode: psc, message: ERROR_MESSAGE } })
      })
    return () => controller.abort()
  }, [key, reloadKey])

  const state: DeliveryState = !valid
    ? { status: 'idle' }
    : result?.key === key
      ? result.state
      : { status: 'loading', postcode: code }

  /** Force a fresh answer (after the server said the date is no longer available). */
  const reload = useCallback(() => setReloadKey(Date.now()), [])
  /** Use options the server already sent (place-order 409 response). */
  const setData = useCallback(
    (data: PublicDeliveryOptions) =>
      setResult({
        key: `${data.postcode.code}:${reloadKey}`,
        state: { status: 'ok', postcode: data.postcode.code, data },
      }),
    [reloadKey],
  )
  return { state, reload, setData }
}
