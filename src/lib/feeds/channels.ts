/** Product feed channels and their stable public URLs (stage 6). */
export const FEED_CHANNELS = ['google', 'meta', 'heureka', 'zbozi'] as const
export type FeedChannel = (typeof FEED_CHANNELS)[number]

export const FEED_LABELS: Record<FeedChannel, string> = {
  google: 'Google Merchant Center',
  meta: 'Meta (Facebook/Instagram) katalog',
  heureka: 'Heureka.cz',
  zbozi: 'Zboží.cz',
}

/** `/feeds/google.xml`, `/feeds/meta.xml`, `/feeds/heureka.xml`, `/feeds/zbozi.xml`. */
export function feedPath(channel: FeedChannel): string {
  return `/feeds/${channel}.xml`
}

export function channelFromFile(file: string): FeedChannel | null {
  const match = file.match(/^([a-z]+)\.xml$/)
  const channel = match?.[1] as FeedChannel | undefined
  return channel && (FEED_CHANNELS as readonly string[]).includes(channel) ? channel : null
}
