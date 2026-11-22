'use client'

import { useEffect } from 'react'

import { type PurchasePayload, trackPurchase } from '@/lib/analytics'
import { finishCheckout } from '@/lib/cart/checkoutState'
import { getCartStore } from '@/lib/cart/store'

const TRACKED_KEY = 'terrys-purchase-tracked-v1'

/**
 * Fires the `purchase` analytics hook EXACTLY ONCE per order (reloading the thank-you page or
 * opening it again from the e-mail does not count twice: the order numbers already reported are
 * remembered in localStorage). Also makes sure the cart is empty.
 */
export function PurchaseEvent({ payload }: { payload: PurchasePayload }) {
  useEffect(() => {
    let tracked: string[] = []
    try {
      tracked = JSON.parse(window.localStorage.getItem(TRACKED_KEY) ?? '[]')
      if (!Array.isArray(tracked)) tracked = []
    } catch {
      tracked = []
    }
    if (!tracked.includes(payload.transaction_id)) {
      trackPurchase(payload)
      try {
        window.localStorage.setItem(
          TRACKED_KEY,
          JSON.stringify([...tracked, payload.transaction_id].slice(-50)),
        )
      } catch {
        // storage blocked: may fire again on reload – acceptable
      }
      // Coming from the checkout the cart was cleared already; this covers other paths.
      getCartStore().clear()
      finishCheckout()
    }
  }, [payload])
  return null
}
