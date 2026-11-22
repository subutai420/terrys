import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

import { securityHeaderRules } from './src/lib/security/headers'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  env: {
    // Stage 3: part of every storefront data cache key (src/storefront/data.ts). Next keeps
    // `unstable_cache` entries across builds; a new build (or dev start) must never read data
    // cached by older code with a different shape.
    STOREFRONT_CACHE_VERSION: String(Date.now()),
  },
  // Stage 7 (gift vouchers): `pdfkit` (voucher PDF, src/vouchers/pdf.ts) loads font files and
  // its own data files from disk at runtime, which breaks when Next.js bundles it. Keeping it
  // external means it is loaded from node_modules like in plain Node.
  serverExternalPackages: ['pdfkit'],
  // The voucher PDF reads its fonts and the logo via fs at runtime (paths from process.cwd()).
  // Vercel only ships files it can see being imported, so list them explicitly for every
  // server route ('/**' = all routes; the PDF can be generated from Payload hooks/endpoints).
  outputFileTracingIncludes: {
    '/**': ['./src/vouchers/fonts/*.ttf', './public/img/logo-red.svg'],
  },
  // Stage 8b: old addresses with a trailing slash (`/magazin/?Id=807`) are redirected by
  // src/proxy.ts in ONE hop to the final page; Next's own trailing-slash redirect would run first
  // and make it two hops. The proxy strips trailing slashes of every page it handles.
  skipTrailingSlashRedirect: true,
  // Stage 9: security headers (HSTS, nosniff, Referrer-Policy, X-Frame-Options,
  // Permissions-Policy) on every route and a Content Security Policy on storefront pages –
  // report-only unless CSP_MODE=enforce. Rules and reasons: src/lib/security/headers.ts.
  // Evaluated at BUILD time: changing CSP_MODE needs a new deploy.
  async headers() {
    return securityHeaderRules(process.env, process.env.NODE_ENV === 'development')
  },
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
