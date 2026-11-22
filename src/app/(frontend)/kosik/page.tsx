import type { Metadata } from 'next'

import { Breadcrumbs } from '@/components/storefront/Breadcrumbs'
import { CartView } from '@/components/storefront/checkout/CartView'
import { findPageLink } from '@/components/storefront/Header'
import { DELIVERY_INFO_PATH } from '@/lib/orders/constants'
import { getSettings } from '@/storefront/data'

/**
 * Cart (stage 4). The cart itself lives in the browser (`src/lib/cart/store.ts`); this page
 * re-validates it against the server, asks for the postcode, delivery method and date, and leads
 * to the checkout (`/objednavka`).
 */

export const metadata: Metadata = {
  title: 'Košík',
  robots: { index: false, follow: false },
}

export default async function CartPage() {
  const [settings, deliveryPage] = await Promise.all([
    getSettings(),
    findPageLink(DELIVERY_INFO_PATH),
  ])
  return (
    <div className="wrap pb-16">
      <Breadcrumbs items={[{ name: 'Košík', href: '/kosik' }]} />
      <h1 className="pb-6 text-[2rem] sm:text-[2.5rem]">Košík</h1>
      <CartView priceNotice={settings.priceNotice} deliveryInfoHref={deliveryPage?.href ?? null} />
    </div>
  )
}
