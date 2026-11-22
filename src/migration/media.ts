import fs from 'fs/promises'
import type { Payload } from 'payload'
import sharp from 'sharp'

import { slugify } from '@/lib/slugify'

import type { CacheReader } from './fetcher'
import { sha1 } from './fetcher'
import type { LexicalDocument, LexicalNode } from './richtext'

/**
 * Uploads images of the old site into the Payload `media` collection.
 *
 * - Bytes come from the crawl cache (migration/.cache/images); a missing image is fetched politely.
 * - Deduplication by content: the file name ends with the first 12 hex chars of the SHA-1 of the
 *   bytes ("argentinsky-hovezi-rib-eye-1a2b3c4d5e6f.jpg"); an image with the same bytes is never
 *   uploaded twice, even when several products or articles use it.
 * - Alt text (required) is Czech and comes from the product / article name.
 * - Upload goes through Payload, so the WebP sizes (thumbnail, card, detail, og) are generated.
 */

export interface MediaProblem {
  url: string
  usedOn: string
  reason: string
}

export class MediaImporter {
  private byHash = new Map<string, number>()
  private byUrl = new Map<string, number | null>()
  uploaded = 0
  reused = 0
  problems: MediaProblem[] = []
  /** Number of `ensure` calls that returned null (the loader marks such imports incomplete). */
  failures = 0
  /** Alt texts requested for images uploaded in this run (one photo can serve several products). */
  private altsByCreatedId = new Map<number, string[]>()

  constructor(
    private payload: Payload,
    private fetcher: CacheReader,
    private dryRun: boolean,
  ) {}

  /** Media id for an old image URL, or null (problem recorded) when it cannot be used. */
  async ensure(url: string, alt: string, usedOn: string): Promise<number | null> {
    const id = this.byUrl.has(url) ? (this.byUrl.get(url) ?? null) : await this.load(url, alt, usedOn)
    this.byUrl.set(url, id)
    if (id === null) this.failures++
    return id
  }

  private async load(url: string, alt: string, usedOn: string): Promise<number | null> {
    const cached = await this.fetcher.getBinary(url)
    if (!cached) {
      this.problems.push({ url, usedOn, reason: 'není v cache (spusťte pnpm migrate:crawl)' })
      return null
    }
    if (cached.status !== 200 || !cached.file) {
      this.problems.push({ url, usedOn, reason: `HTTP ${cached.status}` })
      return null
    }
    const data = await fs.readFile(cached.file)
    const hash = sha1(data)
    let format: string | undefined
    try {
      const meta = await sharp(data).metadata()
      format = meta.format
      if (!meta.width || !meta.height) throw new Error('bez rozměrů')
    } catch (error) {
      this.problems.push({ url, usedOn, reason: `není platný obrázek (${String(error)})` })
      return null
    }
    const known = this.byHash.get(hash)
    if (known) {
      this.altsByCreatedId.get(known)?.push(alt)
      this.reused++
      return known
    }
    const short = hash.slice(0, 12)
    const existing = await this.payload.find({
      collection: 'media',
      where: { filename: { like: short } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.docs[0]) {
      this.byHash.set(hash, existing.docs[0].id)
      this.reused++
      return existing.docs[0].id
    }
    if (this.dryRun) {
      // Pretend id; nothing is written in a dry run.
      this.uploaded++
      this.byHash.set(hash, -1)
      return -1
    }
    const ext = format === 'jpeg' ? 'jpg' : (format ?? 'jpg')
    const name = `${slugify(alt).slice(0, 60) || 'obrazek'}-${short}.${ext}`
    const created = await this.payload.create({
      collection: 'media',
      data: { alt: alt.slice(0, 250) || 'Obrázek ze starého webu Terrys' },
      file: { data, mimetype: format === 'jpeg' ? 'image/jpeg' : `image/${format}`, name, size: data.length },
      overrideAccess: true,
    })
    this.byHash.set(hash, created.id)
    this.altsByCreatedId.set(created.id, [alt])
    this.uploaded++
    return created.id
  }

  /**
   * A photo shared by several products ("Argentinský … Chuck Tender", "Irský … Chuck Tender")
   * gets the words all of them have in common ("Hovězí Chuck Tender") as its alt text, so the
   * alt does not name the wrong origin. Only images uploaded in this run are touched.
   */
  async finalizeSharedAlts(): Promise<number> {
    let updated = 0
    for (const [id, alts] of this.altsByCreatedId) {
      const unique = [...new Set(alts)]
      if (unique.length < 2) continue
      const common = commonWords(unique)
      if (!common || common === unique[0]) continue
      await this.payload.update({ collection: 'media', id, data: { alt: common }, overrideAccess: true })
      updated++
    }
    return updated
  }

  /**
   * Replaces the `pendingImage` placeholders of a rich text document by real upload nodes;
   * images that cannot be uploaded are removed from the text (and reported).
   */
  async resolveRichText(doc: LexicalDocument | null, usedOn: string): Promise<LexicalDocument | null> {
    if (!doc) return null
    const visit = async (nodes: LexicalNode[]): Promise<LexicalNode[]> => {
      const out: LexicalNode[] = []
      for (const node of nodes) {
        if (node.type === 'upload' && node.pendingImage) {
          const { src, alt } = node.pendingImage as { src: string; alt: string }
          const id = await this.ensure(src, alt, usedOn)
          if (id === null) continue
          const { pendingImage: _ignored, ...rest } = node
          out.push({ ...rest, value: id })
          continue
        }
        if (Array.isArray(node.children)) {
          out.push({ ...node, children: await visit(node.children as LexicalNode[]) })
        } else out.push(node)
      }
      return out
    }
    const children = await visit(doc.root.children)
    return children.length ? { root: { ...doc.root, children } } : null
  }
}


/**
 * Longest run of consecutive words present in every text (case-insensitive), first letter
 * capitalised; undefined when it is shorter than two words.
 * ["Argentinský hovězí Chuck Tender", "Irský hovězí Chuck Tender"] → "Hovězí Chuck Tender".
 */
export function commonWords(texts: string[]): string | undefined {
  const words = texts[0].split(/\s+/).filter(Boolean)
  const others = texts.slice(1).map((t) => ` ${t.toLowerCase().split(/\s+/).join(' ')} `)
  let best: string[] = []
  for (let i = 0; i < words.length; i++) {
    for (let j = words.length; j > i + best.length; j--) {
      const run = words.slice(i, j)
      const needle = ` ${run.join(' ').toLowerCase()} `
      if (others.every((o) => o.includes(needle))) {
        best = run
        break
      }
    }
  }
  if (best.length < 2) return undefined
  const text = best.join(' ').replace(/[–-]\s*$/, '').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}