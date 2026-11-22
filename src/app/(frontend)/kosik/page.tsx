import type { Metadata } from 'next'

import { Breadcrumbs } from '@/components/storefront/Breadcrumbs'
import { CartPreview } from '@/components/storefront/CartPreview'
import { getSettings } from '@/storefront/data'

/**
 * Cart overview – STAGE 3 PLACEHOLDER. Shows what is in the browser cart; stage 4 replaces this
 * page with the real cart and checkout (postcode, delivery date, order).
 */

export const metadata: Metadata = {
  title: 'Košík',
  robots: { index: false, follow: false },
}

export default async function CartPage() {
  const settings = await getSettings()
  return (
    <div className="wrap pb-16">
      <Breadcrumbs items={[{ name: 'Košík', href: '/kosik' }]} />
      <h1 className="pb-6 text-[2rem] sm:text-[2.5rem]">Košík</h1>
      <CartPreview
        priceNotice={settings.priceNotice}
        deliveryPrice={settings.deliveryPrice ?? 229}
      />
    </div>
  )
}
