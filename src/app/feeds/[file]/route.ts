import { cachedFeed } from '@/feeds/generate'
import { channelFromFile } from '@/lib/feeds/channels'

/**
 * Product feeds (stage 6), stable public URLs:
 *   /feeds/google.xml   Google Merchant Center
 *   /feeds/meta.xml     Meta Commerce Manager (Facebook/Instagram catalog)
 *   /feeds/heureka.xml  Heureka.cz
 *   /feeds/zbozi.xml    Zboží.cz
 * Generation: `src/feeds/generate.ts` (cached, regenerated after catalog edits or hourly).
 */
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const channel = channelFromFile((await params).file)
  if (!channel) return new Response('Not found', { status: 404 })
  try {
    const feed = await cachedFeed(channel)
    return new Response(feed.xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
        'X-Robots-Tag': 'noindex',
        'X-Feed-Items': String(feed.items),
        'X-Feed-Generated': feed.generatedAt,
      },
    })
  } catch (error) {
    console.error(`[feeds] ${channel} failed: ${String(error)}`)
    // 503 makes the platforms keep the last good copy instead of emptying the catalog.
    return new Response('Feed temporarily unavailable', {
      status: 503,
      headers: { 'Retry-After': '600', 'Cache-Control': 'no-store' },
    })
  }
}
