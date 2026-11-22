import { CONSENT_COOKIE, GOOGLE_CONSENT_DEFAULT } from './consent'

/**
 * Google Tag Manager loading rules (stage 6). Pure, unit-tested in `gtm.test.ts`.
 *
 * GTM is loaded only when ALL of these hold:
 * 1. `GTM_ENABLED=1` and `GTM_ID` is set (server env) – both are empty in development and tests,
 * 2. the production container is never used outside a production build (`NODE_ENV=production`),
 * 3. in the BROWSER the page hostname is on `GTM_ALLOWED_HOSTS` (production: `terrys.cz,
 *    www.terrys.cz`). A clone site that reverse-proxies our HTML (terrys.live did) runs the same
 *    script on its own hostname → GTM does not load there and pollutes nothing.
 *
 * The inline script (`gtmInlineScript`) runs in <head> before anything else and, in this order:
 * defines `dataLayer` + `gtag`, sets Consent Mode v2 DEFAULT = denied (wait_for_update 500 ms),
 * applies a stored choice from the `terrys_consent` cookie (so returning visitors are measured
 * from the first hit), and only then loads gtm.js.
 */

/** The production container (public id, configured with GA4 G-PXMZXR26RG and the Meta pixel). */
export const PRODUCTION_GTM_ID = 'GTM-NBGRZCL'

export type GtmConfig = {
  id: string
  allowedHosts: string[]
  /** GTM environment (preview/staging container version), optional. */
  auth?: string
  preview?: string
  consentVersion: string
}

export function parseHostList(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => /^[a-z0-9.-]+$/.test(host))
}

export function isHostAllowed(hostname: string, allowed: string[]): boolean {
  return allowed.includes(hostname.trim().toLowerCase())
}

type Env = Record<string, string | undefined>

/** GTM settings from env, or null when GTM must not be rendered at all. */
export function gtmConfigFromEnv(env: Env, consentVersion: string): GtmConfig | null {
  if (env.GTM_ENABLED !== '1') return null
  const id = env.GTM_ID?.trim() ?? ''
  if (!/^GTM-[A-Z0-9]{4,12}$/.test(id)) return null
  if (id === PRODUCTION_GTM_ID && env.NODE_ENV !== 'production') return null
  const allowedHosts = parseHostList(env.GTM_ALLOWED_HOSTS)
  if (allowedHosts.length === 0) return null
  return {
    id,
    allowedHosts,
    auth: env.GTM_AUTH?.trim() || undefined,
    preview: env.GTM_PREVIEW?.trim() || undefined,
    consentVersion,
  }
}

/** JSON for embedding in a <script> (no `</script>` breakout). */
function js(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

/**
 * The inline <head> script. Uses the official gtag consent commands
 * (https://developers.google.com/tag-platform/security/guides/consent) – `gtag` pushes the
 * `arguments` object, which is what GTM expects for consent commands.
 */
export function gtmInlineScript(config: GtmConfig): string {
  const env =
    config.auth && config.preview
      ? `&gtm_auth=${encodeURIComponent(config.auth)}&gtm_preview=${encodeURIComponent(config.preview)}&gtm_cookies_win=x`
      : ''
  return `(function(w,d){
var hosts=${js(config.allowedHosts)};
if(hosts.indexOf(w.location.hostname.toLowerCase())===-1)return;
w.dataLayer=w.dataLayer||[];
function gtag(){w.dataLayer.push(arguments);}
w.gtag=w.gtag||gtag;
gtag('consent','default',${js({ ...GOOGLE_CONSENT_DEFAULT, wait_for_update: 500 })});
gtag('set','ads_data_redaction',true);
try{var m=d.cookie.match(/(?:^|; )${CONSENT_COOKIE}=([^;]*)/);if(m){var c=JSON.parse(decodeURIComponent(m[1]));if(c&&c.v===${js(config.consentVersion)}){var a=c.a===1?'granted':'denied',k=c.m===1?'granted':'denied';gtag('consent','update',{analytics_storage:a,ad_storage:k,ad_user_data:k,ad_personalization:k});w.dataLayer.push({event:'consent_restored',consent_analytics:a,consent_marketing:k});}}}catch(e){}
w.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});
var s=d.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtm.js?id='+${js(config.id)}+${js(env)};
var f=d.getElementsByTagName('script')[0];if(f&&f.parentNode){f.parentNode.insertBefore(s,f);}else{d.head.appendChild(s);}
w.terrysGtmLoaded=true;
})(window,document);`
}
