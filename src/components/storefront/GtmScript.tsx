import { gtmConfigFromEnv, gtmInlineScript } from '@/lib/measurement/gtm'

/**
 * Google Tag Manager loader (stage 6), rendered in the storefront <head>. Renders NOTHING unless
 * `GTM_ENABLED=1`, `GTM_ID` and `GTM_ALLOWED_HOSTS` are set (and never the production container
 * outside a production build). The inline script itself checks the page hostname against the
 * allow-list before it sets Consent Mode defaults and loads gtm.js – see `src/lib/measurement/gtm.ts`.
 *
 * No GA4 / Meta / Ads snippets anywhere in the site: everything client-side goes through GTM.
 */
export function GtmScript({ consentVersion }: { consentVersion: string }) {
  const config = gtmConfigFromEnv(process.env, consentVersion)
  if (!config) return null
  return (
    <script
      id="gtm-loader"
      // Inline on purpose: it must run before any other script (Consent Mode default first).
      dangerouslySetInnerHTML={{ __html: gtmInlineScript(config) }}
    />
  )
}
