import type { Metadata } from 'next'
import { connection } from 'next/server'

import { Breadcrumbs } from '@/components/storefront/Breadcrumbs'
import { CheckoutForm } from '@/components/storefront/checkout/CheckoutForm'
import { findPageLink } from '@/components/storefront/Header'
import { publicText } from '@/lib/openingHours'
import { PRIVACY_PATH, TERMS_PATH, WITHDRAWAL_PATH } from '@/lib/orders/constants'
import { createFormToken } from '@/lib/orders/formToken'
import { foxentryEnabled } from '@/orders/foxentry'
import { FORM_TOKEN_PURPOSE } from '@/orders/placeOrder'
import { turnstileEnabled } from '@/orders/turnstile'
import { getPayloadClient, getSettings } from '@/storefront/data'

/**
 * Checkout (stage 4): one page, numbered sections. Rendered per request because it embeds a
 * signed timestamp (timing trap against bots, `src/lib/orders/formToken.ts`).
 */

export const metadata: Metadata = {
  title: 'Dokončení objednávky',
  robots: { index: false, follow: false },
}

export default async function CheckoutPage() {
  await connection()
  const [payload, settings, terms, privacy] = await Promise.all([
    getPayloadClient(),
    getSettings(),
    findPageLink(TERMS_PATH),
    findPageLink(PRIVACY_PATH),
  ])
  const company = settings.company
  return (
    <div className="wrap pb-16">
      <Breadcrumbs
        items={[
          { name: 'Košík', href: '/kosik' },
          { name: 'Dokončení objednávky', href: '/objednavka' },
        ]}
      />
      <h1 className="pb-6 text-[2rem] sm:text-[2.5rem]">Dokončení objednávky</h1>
      <CheckoutForm
        formToken={createFormToken(payload.secret, FORM_TOKEN_PURPOSE)}
        priceNotice={settings.priceNotice}
        termsHref={terms?.href ?? TERMS_PATH}
        privacyHref={privacy?.href ?? PRIVACY_PATH}
        withdrawalHref={WITHDRAWAL_PATH}
        seller={{
          name: publicText(company?.name),
          ico: publicText(company?.ico),
          address: publicText(company?.address)?.replace(/\s*\n\s*/g, ', ') ?? null,
        }}
        contact={{
          email: publicText(settings.contact?.email),
          phone: publicText(settings.contact?.phone),
        }}
        turnstileSiteKey={
          turnstileEnabled() ? (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null) : null
        }
        addressCheckEnabled={foxentryEnabled()}
        voucherDueHours={settings.vouchers?.paymentDueHours ?? 72}
      />
    </div>
  )
}
