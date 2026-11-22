'use client'

import { useEffect } from 'react'

import { trackPurchase } from '@/lib/analytics'
import { finishCheckout } from '@/lib/cart/checkoutState'
import { getCartStore } from '@/lib/cart/store'
import { hasConsent } from '@/lib/consent/browser'
import type { EcommercePush, UserProvidedData } from '@/lib/measurement/ecommerce'

const TRACKED_KEY = 'terrys-purchase-tracked-v1'
/** Last thank-you token of this tab: `/objednavka/dekujeme` (no token) finds the page again. */
export const LAST_ORDER_TOKEN_KEY = 'terrys-last-order-token-v1'
export const THANK_YOU_PUBLIC_PATH = '/objednavka/dekujeme'

/**
 * Thank-you page analytics (stage 6):
 * - removes the secret access token from the address bar (`history.replaceState` to
 *   `/objednavka/dekujeme`) BEFORE any page view is reported, so the token never reaches GA4,
 *   Meta or anybody's referrer; a reload of the clean URL finds the page again via sessionStorage,
 * - pushes `purchase` EXACTLY ONCE per order (order numbers already reported are remembered in
 *   localStorage – reload, back button, opening it again from the e-mail do not count twice),
 * - adds `user_data` (enhanced conversions / advanced matching) only with marketing consent,
 * - makes sure the cart is empty.
 */
export function PurchaseEvent({
  message,
  userData,
  token,
}: {
  message: EcommercePush
  userData: UserProvidedData | null
  token: string
}) {
  useEffect(() => {
    try {
      window.sessionStorage.setItem(LAST_ORDER_TOKEN_KEY, token)
    } catch {
      // storage blocked: a reload of the clean URL then shows the "order received" fallback
    }
    if (window.location.pathname !== THANK_YOU_PUBLIC_PATH) {
      window.history.replaceState(window.history.state, '', THANK_YOU_PUBLIC_PATH)
    }

    const orderNumber = String(message.ecommerce.transaction_id ?? '')
    let tracked: string[] = []
    try {
      tracked = JSON.parse(window.localStorage.getItem(TRACKED_KEY) ?? '[]')
      if (!Array.isArray(tracked)) tracked = []
    } catch {
      tracked = []
    }
    if (orderNumber && !tracked.includes(orderNumber)) {
      trackPurchase(
        userData && hasConsent('marketing') ? { ...message, user_data: userData } : message,
      )
      try {
        window.localStorage.setItem(
          TRACKED_KEY,
          JSON.stringify([...tracked, orderNumber].slice(-50)),
        )
      } catch {
        // storage blocked: may fire again on reload – acceptable
      }
      // Coming from the checkout the cart was cleared already; this covers other paths.
      getCartStore().clear()
      finishCheckout()
    }
  }, [message, userData, token])
  return null
}
