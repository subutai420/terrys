import { createHash } from 'crypto'

import * as cheerio from 'cheerio'
import type { AnyNode, Element } from 'domhandler'

import { absoluteImageUrl } from './html'
import { normalizeUrl, toPathAndQuery } from './urls'

/**
 * Converts HTML of the old site into Payload's Lexical rich text (JSON).
 *
 * Kept: paragraphs, headings (h1 → h2, because the page title is the h1), bulleted and numbered
 * lists (nested too), links, bold / italic / underline / strikethrough / sub / sup, line breaks,
 * quotes, horizontal rules, images (as `upload` blocks, resolved to Media by the loader).
 * Dropped: inline styles, classes, fonts, spans (unwrapped), scripts, empty paragraphs.
 * Not supported by the editor: tables (flattened to one paragraph per row, reported) and embedded
 * iframes/videos (replaced by a paragraph with a link to the video, reported).
 *
 * Internal links are rewritten to the legacy path form "/produkty/…-detail-406" (no host), so
 * they are consistent and the 301 redirects from the second half of stage 8 will catch them.
 */

export interface LexicalNode {
  type: string
  version: number
  [key: string]: unknown
}

export interface LexicalDocument {
  root: LexicalNode & { children: LexicalNode[] }
}

/** Placeholder for an image inside rich text; the loader swaps it for a Media upload node. */
export interface PendingImage {
  src: string
  alt: string
}

export interface RichTextResult {
  doc: LexicalDocument | null
  /** Plain text (for brand-rule checks and SEO fallbacks). */
  text: string
  internalLinks: string[]
  externalLinks: string[]
  images: PendingImage[]
  embeds: string[]
  /** Struck-through text (<s>, <del>, <strike>) – may be a crossed-out price. */
  struckText: string[]
  warnings: string[]
}

// Lexical text format bit flags.
const FORMAT = { bold: 1, italic: 2, strikethrough: 4, underline: 8, code: 16, subscript: 32, superscript: 64 }

const INLINE_FORMAT_TAGS: Record<string, number> = {
  strong: FORMAT.bold,
  b: FORMAT.bold,
  em: FORMAT.italic,
  i: FORMAT.italic,
  u: FORMAT.underline,
  s: FORMAT.strikethrough,
  strike: FORMAT.strikethrough,
  del: FORMAT.strikethrough,
  code: FORMAT.code,
  sub: FORMAT.subscript,
  sup: FORMAT.superscript,
}

const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'figure', 'figcaption',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'table', 'thead', 'tbody', 'tr',
  'hr', 'iframe', 'video', 'object', 'embed', 'center', 'address', 'pre', 'dl', 'dt', 'dd', 'form',
])

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'svg', 'button', 'input', 'select', 'textarea', 'form', 'link', 'meta'])

const base = { direction: 'ltr', format: '', indent: 0, version: 1 }

function textNode(text: string, format: number): LexicalNode {
  return { type: 'text', text, format, detail: 0, mode: 'normal', style: '', version: 1 }
}
const lineBreak = (): LexicalNode => ({ type: 'linebreak', version: 1 })
const paragraph = (children: LexicalNode[]): LexicalNode => ({ type: 'paragraph', ...base, textFormat: 0, textStyle: '', children })

/**
 * Lexical ids are 24-char hex strings (Mongo ObjectID style), used by upload/link nodes.
 * They are derived from the page URL and a counter, so converting the same HTML twice gives the
 * same JSON (stable source hash, no needless updates on re-import).
 */
function idGenerator(seed: string): () => string {
  let counter = 0
  return () => createHash('sha1').update(`${seed}#${counter++}`).digest('hex').slice(0, 24)
}

export interface RichTextOptions {
  /** URL of the page the HTML comes from (to resolve relative links and images). */
  pageUrl: string
  /** Alt text for images that have none. */
  defaultAlt?: string
}

/** Main entry: HTML fragment → Lexical document (null when there is no text at all). */
export function htmlToLexical(html: string, options: RichTextOptions): RichTextResult {
  const $ = cheerio.load(`<div id="__root">${html}</div>`, null, false)
  const result: RichTextResult = {
    doc: null,
    text: '',
    internalLinks: [],
    externalLinks: [],
    images: [],
    embeds: [],
    struckText: [],
    warnings: [],
  }
  const lexicalId = idGenerator(`${options.pageUrl}:${createHash('sha1').update(html).digest('hex')}`)
  const blocks: LexicalNode[] = []
  let inline: LexicalNode[] = []

  const flush = (target: LexicalNode[]) => {
    const cleaned = trimInline(inline)
    if (cleaned.length) target.push(paragraph(cleaned))
    inline = []
  }

  // ---------------------------------------------------------------- inline content
  function inlineNodes(node: AnyNode, format: number, out: LexicalNode[]) {
    if (node.type === 'text') {
      const text = (node as unknown as { data: string }).data.replace(/[\s ]+/g, ' ')
      if (text) out.push(textNode(text, format))
      if (format & FORMAT.strikethrough && text.trim()) result.struckText.push(text.trim())
      return
    }
    if (node.type !== 'tag') return
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    if (SKIP_TAGS.has(tag)) return
    if (tag === 'br') {
      out.push(lineBreak())
      return
    }
    if (tag === 'img') {
      // Images are block-level in the editor; handled by the block walker.
      return
    }
    if (tag === 'a') {
      const href = $(el).attr('href') ?? ''
      const children: LexicalNode[] = []
      el.children.forEach((child) => inlineNodes(child, format, children))
      const link = resolveLink(href, options.pageUrl)
      if (!link || !children.some((c) => c.type === 'text' && String(c.text).trim())) {
        // javascript:/empty links → keep only the text (or nothing for "(více)" buttons).
        if ($(el).hasClass('btnTextMore')) return
        out.push(...children)
        return
      }
      if (link.internal) result.internalLinks.push(link.url)
      else result.externalLinks.push(link.url)
      out.push({
        type: 'link',
        ...base,
        version: 3,
        id: lexicalId(),
        fields: { linkType: 'custom', url: link.url, newTab: !link.internal || $(el).attr('target') === '_blank' },
        children,
      })
      return
    }
    const extra = INLINE_FORMAT_TAGS[tag] ?? 0
    // <span style="font-weight:bold"> etc. are rare; styles are intentionally dropped.
    el.children.forEach((child) => inlineNodes(child, format | extra, out))
  }

  // ---------------------------------------------------------------- block content
  function walk(node: AnyNode, target: LexicalNode[]) {
    if (node.type === 'text' || (node.type === 'tag' && !BLOCK_TAGS.has((node as Element).tagName.toLowerCase()) && (node as Element).tagName.toLowerCase() !== 'img' && !containsBlock(node as Element))) {
      inlineNodes(node, 0, inline)
      return
    }
    if (node.type !== 'tag') return
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    if (SKIP_TAGS.has(tag)) return

    if (tag === 'img') {
      flush(target)
      const src = absoluteImageUrl($(el).attr('src') ?? $(el).attr('data-src'), options.pageUrl)
      if (src && !/\/templates\/css\/images\//.test(src)) {
        // EasyWeb fills inserted photos with alt="Image 3" – treat that as missing.
        const rawAlt = ($(el).attr('alt') ?? '').trim()
        const alt = (/^image\s*\d*$/i.test(rawAlt) ? '' : rawAlt) || options.defaultAlt || ''
        result.images.push({ src, alt })
        target.push({ type: 'upload', version: 3, format: '', id: lexicalId(), fields: {}, relationTo: 'media', value: null, pendingImage: { src, alt } })
      }
      return
    }

    if (/^h[1-6]$/.test(tag)) {
      flush(target)
      const children: LexicalNode[] = []
      el.children.forEach((child) => inlineNodes(child, 0, children))
      const cleaned = trimInline(children.filter((c) => c.type !== 'linebreak'))
      if (cleaned.length) target.push({ type: 'heading', ...base, tag: tag === 'h1' ? 'h2' : tag, children: cleaned })
      collectImages(el, target)
      return
    }

    if (tag === 'ul' || tag === 'ol') {
      flush(target)
      const list = convertList(el)
      if (list) target.push(list)
      return
    }

    if (tag === 'blockquote') {
      flush(target)
      const children: LexicalNode[] = []
      el.children.forEach((child) => inlineNodes(child, 0, children))
      const cleaned = trimInline(children)
      if (cleaned.length) target.push({ type: 'quote', ...base, children: cleaned })
      return
    }

    if (tag === 'hr') {
      flush(target)
      target.push({ type: 'horizontalrule', version: 1 })
      return
    }

    if (tag === 'iframe' || tag === 'video' || tag === 'object' || tag === 'embed') {
      flush(target)
      const src = $(el).attr('src') ?? $(el).find('source').attr('src') ?? $(el).attr('data') ?? ''
      const url = src.startsWith('//') ? `https:${src}` : src
      result.embeds.push(url || `<${tag}>`)
      if (url) {
        target.push(
          paragraph([
            {
              type: 'link',
              ...base,
              version: 3,
              id: lexicalId(),
              fields: { linkType: 'custom', url, newTab: true },
              children: [textNode(/youtu/.test(url) ? 'Video na YouTube' : 'Video', 0)],
            },
          ]),
        )
      }
      return
    }

    if (tag === 'table') {
      flush(target)
      result.warnings.push('tabulka převedena na odstavce (editor tabulky nepodporuje)')
      $(el)
        .find('tr')
        .each((_, tr) => {
          const cells: LexicalNode[] = []
          $(tr)
            .children('td,th')
            .each((i, cell) => {
              if (i > 0) cells.push(textNode(' | ', 0))
              cell.children.forEach((child) => inlineNodes(child, cell.tagName === 'th' ? FORMAT.bold : 0, cells))
            })
          const cleaned = trimInline(cells)
          if (cleaned.length) target.push(paragraph(cleaned))
        })
      return
    }

    // p, div and other containers: walk children; paragraph breaks around them.
    flush(target)
    el.children.forEach((child) => walk(child, target))
    flush(target)
  }

  function containsBlock(el: Element): boolean {
    return $(el).find('img, p, div, ul, ol, table, iframe, h1, h2, h3, h4, h5, h6, blockquote').length > 0
  }

  function collectImages(el: Element, target: LexicalNode[]) {
    $(el)
      .find('img')
      .each((_, img) => walk(img, target))
  }

  function convertList(el: Element): LexicalNode | null {
    const ordered = el.tagName.toLowerCase() === 'ol'
    const items: LexicalNode[] = []
    let value = 1
    $(el)
      .children('li')
      .each((_, li) => {
        const children: LexicalNode[] = []
        const nested: LexicalNode[] = []
        li.children.forEach((child) => {
          if (child.type === 'tag' && ['ul', 'ol'].includes((child as Element).tagName.toLowerCase())) {
            const sub = convertList(child as Element)
            if (sub) nested.push(sub)
          } else if (child.type === 'tag' && ['p', 'div'].includes((child as Element).tagName.toLowerCase())) {
            if (children.length) children.push(lineBreak())
            ;(child as Element).children.forEach((c) => inlineNodes(c, 0, children))
          } else inlineNodes(child, 0, children)
        })
        const cleaned = trimInline(children)
        if (cleaned.length) items.push({ type: 'listitem', ...base, value: value++, children: cleaned })
        for (const sub of nested) items.push({ type: 'listitem', ...base, value: value++, children: [sub] })
      })
    if (!items.length) return null
    return { type: 'list', ...base, listType: ordered ? 'number' : 'bullet', start: 1, tag: ordered ? 'ol' : 'ul', children: items }
  }

  const rootEl = $('#__root')[0] as Element
  rootEl.children.forEach((child) => walk(child, blocks))
  flush(blocks)

  result.text = blocks.map(plainText).join('\n').replace(/[ \t]+/g, ' ').trim()
  result.internalLinks = [...new Set(result.internalLinks)]
  result.externalLinks = [...new Set(result.externalLinks)]
  if (blocks.length) {
    result.doc = { root: { type: 'root', ...base, children: blocks } }
  }
  return result
}

/** Internal link → legacy path form; external link → absolute URL; null = drop the link. */
export function resolveLink(href: string, pageUrl: string): { url: string; internal: boolean } | null {
  const raw = href.trim()
  if (!raw || raw.startsWith('#') || /^javascript:/i.test(raw)) return null
  if (/^(mailto|tel):/i.test(raw)) return { url: raw, internal: false }
  const internal = normalizeUrl(raw, pageUrl)
  if (internal) return { url: toPathAndQuery(internal), internal: true }
  try {
    const url = new URL(raw, pageUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return { url: url.toString(), internal: false }
  } catch {
    return null
  }
}

/** Removes leading/trailing whitespace and line breaks of a paragraph and merges spaces. */
function trimInline(nodes: LexicalNode[]): LexicalNode[] {
  const out = nodes.filter((n) => !(n.type === 'text' && n.text === ''))
  // Collapse spaces around line breaks and between adjacent text nodes.
  for (let i = 0; i < out.length; i++) {
    const node = out[i]
    if (node.type !== 'text') continue
    const prev = out[i - 1]
    const prevText = prev && prev.type === 'text' ? String(prev.text) : prev && prev.type === 'linebreak' ? '\n' : i === 0 ? '\n' : ''
    let text = String(node.text)
    if (prevText.endsWith(' ') || prevText.endsWith('\n')) text = text.replace(/^ +/, '')
    const next = out[i + 1]
    if (!next || next.type === 'linebreak') text = text.replace(/ +$/, '')
    node.text = text
  }
  const filtered = out.filter((n) => !(n.type === 'text' && n.text === ''))
  while (filtered.length && filtered[0].type === 'linebreak') filtered.shift()
  while (filtered.length && filtered[filtered.length - 1].type === 'linebreak') filtered.pop()
  // Drop paragraphs made only of whitespace.
  const hasContent = filtered.some((n) => (n.type === 'text' && String(n.text).trim()) || n.type === 'link')
  return hasContent ? mergeAdjacentText(filtered) : []
}

function mergeAdjacentText(nodes: LexicalNode[]): LexicalNode[] {
  const out: LexicalNode[] = []
  for (const node of nodes) {
    const prev = out[out.length - 1]
    if (prev && prev.type === 'text' && node.type === 'text' && prev.format === node.format) {
      prev.text = String(prev.text) + String(node.text)
    } else out.push(node)
  }
  return out
}

/** Plain text of a Lexical node tree. */
export function plainText(node: LexicalNode): string {
  if (node.type === 'text') return String(node.text)
  if (node.type === 'linebreak') return '\n'
  const children = (node.children as LexicalNode[] | undefined) ?? []
  const inner = children.map(plainText).join(node.type === 'list' || node.type === 'root' ? '\n' : '')
  return inner
}

/** A Lexical document from plain paragraphs (used for simple texts such as perex fallbacks). */
export function lexicalFromParagraphs(paragraphs: string[]): LexicalDocument | null {
  const blocks = paragraphs.map((p) => p.trim()).filter(Boolean).map((p) => paragraph([textNode(p, 0)]))
  return blocks.length ? { root: { type: 'root', ...base, children: blocks } } : null
}
