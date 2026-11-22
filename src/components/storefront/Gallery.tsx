'use client'

import Image from 'next/image'
import { type KeyboardEvent, useRef, useState } from 'react'

export type GalleryImage = {
  src: string
  width: number
  height: number
  thumbSrc: string
  alt: string
}

/**
 * Product gallery: large image + thumbnails. Thumbnails are buttons (aria-pressed); arrow keys
 * move between them, Enter/Space shows the image. The first image is preloaded (LCP).
 */
export function Gallery({ images }: { images: GalleryImage[] }) {
  const [active, setActive] = useState(0)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const current = images[active] ?? images[0]
  if (!current) {
    return <div className="aspect-[3/2] rounded-card bg-brand-beige-light" aria-hidden="true" />
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % images.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (index - 1 + images.length) % images.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = images.length - 1
    if (next !== null) {
      event.preventDefault()
      setActive(next)
      buttons.current[next]?.focus()
    }
  }

  return (
    <div>
      <div className="relative aspect-[3/2] overflow-hidden rounded-card bg-white">
        <Image
          key={current.src}
          src={current.src}
          alt={current.alt}
          fill
          sizes="(min-width: 64rem) 640px, 100vw"
          className="object-cover"
          preload={active === 0}
        />
      </div>
      {images.length > 1 ? (
        <div className="mt-2.5 grid grid-cols-4 gap-2.5" role="group" aria-label="Fotky produktu">
          {images.map((image, index) => (
            <button
              key={`${image.src}-${index}`}
              ref={(el) => {
                buttons.current[index] = el
              }}
              type="button"
              aria-pressed={index === active}
              aria-label={`Fotka ${index + 1} z ${images.length}${image.alt ? `: ${image.alt}` : ''}`}
              tabIndex={index === active ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`relative aspect-square overflow-hidden rounded border-2 ${
                index === active ? 'border-brand-red' : 'border-transparent hover:border-line'
              }`}
            >
              <Image src={image.thumbSrc} alt="" fill sizes="120px" className="object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
