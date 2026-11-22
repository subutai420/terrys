import type { Metadata } from 'next'

import { ThankYouRedirect } from '@/components/storefront/checkout/ThankYouRedirect'

/**
 * `/objednavka/dekujeme` without the token (stage 6). The thank-you page removes its secret token
 * from the address bar so it never reaches analytics; a reload lands here and goes back to the
 * token URL remembered in this tab (sessionStorage). Without it: a short "received" message.
 */
export const metadata: Metadata = {
  title: 'Děkujeme za objednávku',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function ThankYouWithoutToken() {
  return (
    <div className="wrap max-w-3xl pb-16 pt-8">
      <ThankYouRedirect />
    </div>
  )
}
