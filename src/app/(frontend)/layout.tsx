import type { Metadata, Viewport } from 'next'
import { Quicksand, Roboto_Slab } from 'next/font/google'
import React from 'react'

import { AttributionCapture } from '@/components/storefront/AttributionCapture'
import { DraftBanner } from '@/components/storefront/DraftBanner'
import { Footer } from '@/components/storefront/Footer'
import { Header } from '@/components/storefront/Header'
import { JsonLd } from '@/components/storefront/JsonLd'
import { organizationJsonLd, websiteJsonLd } from '@/lib/jsonld'
import { publicText } from '@/lib/openingHours'
import { LOGO_PATH, SITE_NAME } from '@/lib/site'
import { absoluteUrl, getSiteUrl } from '@/lib/urls'
import { getSettings } from '@/storefront/data'

import './globals.css'

// Fonts of design A. Both are SIL Open Font License; next/font downloads them at build time and
// serves them from our own domain (no request to Google from the visitor's browser).
const quicksand = Quicksand({
  subsets: ['latin', 'latin-ext'],
  // Variable font: one file covers all weights (fewer bytes than three static weights).
  display: 'swap',
  variable: '--font-quicksand',
})
const robotoSlab = Roboto_Slab({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-roboto-slab',
})

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: `${SITE_NAME} – prémiové steaky a maso z celého světa`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    'Řeznictví Terrys: steaky z Argentiny, Uruguaye, USA, Austrálie a japonské wagyu. ' +
    'Porcujeme u nás, vážíme každou objednávku a vozíme chlazeným rozvozem.',
  applicationName: SITE_NAME,
  openGraph: {
    type: 'website',
    locale: 'cs_CZ',
    siteName: SITE_NAME,
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: '#b00004',
}

export default async function FrontendLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings()
  const siteUrl = getSiteUrl()
  const sameAs = Object.values(settings.social ?? {})
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => /^https?:\/\//.test(value))

  return (
    <html lang="cs" className={`${quicksand.variable} ${robotoSlab.variable}`}>
      <body className="flex min-h-screen flex-col bg-brand-beige font-sans text-ink antialiased">
        <DraftBanner />
        <Header />
        <main id="obsah" className="flex-1">
          {children}
        </main>
        <Footer />
        <AttributionCapture />
        <JsonLd
          data={[
            organizationJsonLd({
              name: SITE_NAME,
              url: siteUrl,
              logoUrl: absoluteUrl(LOGO_PATH),
              email: publicText(settings.contact?.email),
              telephone: publicText(settings.contact?.phone),
              legalName: publicText(settings.company?.name),
              vatId: publicText(settings.company?.dic),
              taxId: publicText(settings.company?.ico),
              sameAs,
            }),
            websiteJsonLd({ name: SITE_NAME, url: siteUrl }),
          ]}
        />
      </body>
    </html>
  )
}
