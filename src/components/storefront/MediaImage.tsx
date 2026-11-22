import Image from 'next/image'

import type { Media } from '@/payload-types'

/**
 * Image from the Payload media library via next/image.
 *
 * `size` picks one of the generated WebP sizes (`thumbnail` 400², `card` 800², `detail` 1600 w,
 * `og` 1200×630); next/image then builds the responsive srcset from it. Missing sizes fall back
 * to the original file. Width/height are always set, so the layout does not shift.
 */

export type MediaSize = 'thumbnail' | 'card' | 'detail' | 'og'

export function isMedia(value: unknown): value is Media {
  return typeof value === 'object' && value !== null && 'url' in value && 'alt' in value
}

/**
 * Payload returns absolute file URLs (it knows `serverURL`). Our own files are served as local
 * paths, so next/image treats them as local images (`images.localPatterns` in next.config.ts).
 */
export function localMediaPath(url: string): string {
  const match = url.match(/^https?:\/\/[^/]+(\/api\/media\/file\/.*)$/i)
  return match ? match[1] : url
}

export function mediaSource(media: Media, size: MediaSize) {
  const variant = media.sizes?.[size]
  if (variant?.url && variant.width && variant.height) {
    return { src: localMediaPath(variant.url), width: variant.width, height: variant.height }
  }
  if (media.url && media.width && media.height) {
    return { src: localMediaPath(media.url), width: media.width, height: media.height }
  }
  return null
}

type Props = {
  media: unknown
  size: MediaSize
  sizes: string
  className?: string
  /** Override the stored alt text (e.g. "" for decorative images). */
  alt?: string
  /** Above-the-fold image (LCP): preload it instead of lazy loading. */
  preload?: boolean
  fill?: boolean
}

export function MediaImage({ media, size, sizes, className, alt, preload, fill }: Props) {
  if (!isMedia(media)) return null
  const source = mediaSource(media, size)
  if (!source) return null
  const altText = alt ?? media.alt ?? ''
  if (fill) {
    return (
      <Image
        src={source.src}
        alt={altText}
        fill
        sizes={sizes}
        className={className}
        preload={preload}
      />
    )
  }
  return (
    <Image
      src={source.src}
      alt={altText}
      width={source.width}
      height={source.height}
      sizes={sizes}
      className={className}
      preload={preload}
    />
  )
}
