import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

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
